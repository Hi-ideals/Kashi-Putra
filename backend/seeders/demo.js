/*
 * OPTIONAL demo content: `npm run seed:demo`
 * Generates sample newspaper page images and publishes a few editions through the
 * same services the admin panel uses, so you can try the reader immediately.
 * Not needed in production — delete demo editions from the admin panel any time.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { pool, query, one, transaction } = require('../config/db');
const images = require('../services/images');
const { publishEdition } = require('../services/editions');
const { slugify } = require('../utils/helpers');

const HEADLINES = ['State budget focuses on rural roads and irrigation', 'Monsoon brings relief to farmers across districts', 'City metro phase two to open next month',
  'University announces new research centre', 'District hospital gets modern ICU facility', 'Local team wins state-level kabaddi championship',
  'Silk exports reach record high this quarter', 'Heritage temple restoration completed', 'Startups get new incubation hub', 'Lake rejuvenation drive begins'];

function pageSvg({ title, date, pageNo, total, edition }) {
  const W = 1700; const H = 2600;
  const h = (i) => HEADLINES[(pageNo * 3 + i) % HEADLINES.length];
  const lines = (x, y, w, n, gap = 26) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i % 7 === 6 ? w * 0.6 : w}" height="11" fill="#6b6b6b" opacity="0.55"/>`).join('');
  const story = (x, y, w, i, n) => `<text x="${x}" y="${y}" font-family="Georgia, serif" font-weight="700" font-size="${i === 0 ? 62 : Math.min(40, Math.floor(w / (h(i).length * 0.55)))}" fill="#111">${h(i)}</text>
    <rect x="${x}" y="${y + 22}" width="${w}" height="2" fill="#c8102e"/>${lines(x, y + 52, w, n)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fbf9f3"/>
    ${pageNo === 1 ? `<text x="${W / 2}" y="170" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="150" fill="#0b2545">${title}</text>
    <rect x="80" y="205" width="${W - 160}" height="8" fill="#c8102e"/>` : `<text x="80" y="110" font-family="Georgia, serif" font-weight="900" font-size="64" fill="#0b2545">${title}</text>
    <rect x="80" y="135" width="${W - 160}" height="5" fill="#c8102e"/>`}
    <text x="80" y="${pageNo === 1 ? 260 : 180}" font-family="Arial" font-size="30" fill="#333">${edition} · ${date}</text>
    <text x="${W - 80}" y="${pageNo === 1 ? 260 : 180}" text-anchor="end" font-family="Arial" font-size="30" fill="#333">Page ${pageNo} of ${total}</text>
    ${story(80, 360, W - 160, 0, 3)}
    <rect x="80" y="520" width="${(W - 200) * 0.58}" height="620" fill="#cfd6df"/>
    <text x="${80 + (W - 200) * 0.29}" y="840" text-anchor="middle" font-family="Arial" font-size="34" fill="#55606e">PHOTO</text>
    ${lines(80 + (W - 200) * 0.58 + 40, 520, (W - 200) * 0.42 - 40, 24)}
    ${story(80, 1220, (W - 220) / 2, 1, 16)}${story(80 + (W - 220) / 2 + 60, 1220, (W - 220) / 2, 2, 16)}
    ${story(80, 1760, (W - 260) / 3, 3, 26)}${story(80 + (W - 260) / 3 + 50, 1760, (W - 260) / 3, 4, 26)}${story(80 + 2 * ((W - 260) / 3 + 50), 1760, (W - 260) / 3, 5, 26)}
    <rect x="80" y="${H - 90}" width="${W - 160}" height="2" fill="#999"/>
  </svg>`;
}

async function makeEdition(categoryId, editionName, date, pages, adminId) {
  const title = `${editionName}`;
  const slug = slugify(`${title}-${date}`);
  if (await one('SELECT id FROM editions WHERE slug=?', [slug])) return null;
  const r = await query("INSERT INTO editions (category_id, title, slug, edition_date, description, status, created_by) VALUES (?,?,?,?,?, 'draft', ?)",
    [categoryId, title, slug, date, `Sample ${editionName} for ${date}`, adminId]);
  const tmpDir = path.join(config.paths.tmp, 'demo'); fs.mkdirSync(tmpDir, { recursive: true });
  for (let i = 1; i <= pages; i++) {
    const file = path.join(tmpDir, `p${i}.jpg`);
    await sharp(Buffer.from(pageSvg({ title: 'VACHANA KRANTI', date, pageNo: i, total: pages, edition: editionName }))).jpeg({ quality: 88 }).toFile(file);
    await transaction(async (conn) => {
      const orig = await images.saveOriginal(file, r.insertId, `page-${i}.jpg`);
      const v = await images.buildVariants(images.absOriginal(orig.path), r.insertId);
      const [pr] = await conn.query('INSERT INTO edition_pages (edition_id, page_number, title, original_name, width, height) VALUES (?,?,?,?,?,?)', [r.insertId, i, `Page ${i}`, `page-${i}.jpg`, orig.width, orig.height]);
      for (const [variant, x] of Object.entries({ original: orig, ...v })) {
        await conn.query('INSERT INTO page_images (page_id, variant, path, mime, width, height, size_bytes, is_watermarked) VALUES (?,?,?,?,?,?,?,?)', [pr.insertId, variant, x.path, x.mime, x.width, x.height, x.size_bytes, x.is_watermarked]);
      }
    });
    fs.unlinkSync(file);
  }
  await publishEdition(r.insertId, adminId, { notify: false });
  return r.insertId;
}

async function main() {
  const admin = await one('SELECT id FROM users WHERE role_id IS NOT NULL ORDER BY id LIMIT 1');
  if (!admin) throw new Error('No admin user found. Run `npm run setup` first (it must finish without errors).');
  const main = await one('SELECT id FROM edition_categories WHERE is_main=1 LIMIT 1') || await one('SELECT id FROM edition_categories LIMIT 1');
  let district = await one("SELECT id FROM edition_categories WHERE slug='kalaburagi-edition'");
  if (!district) district = { id: (await query("INSERT INTO edition_categories (name, slug, description, sort_order) VALUES ('Kalaburagi Edition','kalaburagi-edition','District edition',2)")).insertId };
  const st = await one("SELECT id FROM states WHERE slug='karnataka'");
  const dist = await one("SELECT id FROM districts WHERE slug='kalaburagi'");
  if (st && dist && !(await one('SELECT id FROM area_mappings WHERE category_id=?', [district.id]))) {
    await query('INSERT INTO area_mappings (location_name, state_id, district_id, category_id) VALUES (?,?,?,?)', ['Kalaburagi', st.id, dist.id, district.id]);
    await query('INSERT INTO area_mappings (location_name, state_id, category_id) VALUES (?,?,?)', ['Karnataka (All)', st.id, main.id]);
  }
  for (let d = 2; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const a = await makeEdition(main.id, 'Main Edition', date, 8, admin.id);
    const b = await makeEdition(district.id, 'Kalaburagi Edition', date, 4, admin.id);
    console.log(`  ${date}: ${a ? 'main ✓' : 'main exists'} ${b ? 'district ✓' : 'district exists'}`);
  }
  console.log('✓ Demo editions created.');
}

main().then(() => pool.end()).catch((e) => { console.error('✗ Demo seeding failed:', e.message); pool.end(); process.exit(1); });
