const { query, one } = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { fileUrl, cleanText } = require('../utils/helpers');
const settings = require('../services/settings');
const images = require('../services/images');
const cache = require('../services/cache');
const { audit } = require('../services/audit');
const { cleanupFiles } = require('../middleware/upload');
const config = require('../config');

const TYPES = ['home', 'edition', 'page', 'category', 'cms'];

const get = asyncHandler(async (req, res) => {
  const { type } = req.params; const id = Number(req.params.id) || 0;
  if (!TYPES.includes(type)) throw ApiError.notFound('Unknown SEO type');
  const row = await one('SELECT * FROM seo_settings WHERE entity_type=? AND entity_id=?', [type, id]);
  ok(res, row ? { ...row, og_image_url: fileUrl(row.og_image) } : { entity_type: type, entity_id: id });
});

const save = asyncHandler(async (req, res) => {
  try {
    const { type } = req.params; const id = Number(req.params.id) || 0;
    if (!TYPES.includes(type)) throw ApiError.notFound('Unknown SEO type');
    const b = req.body;
    const cur = await one('SELECT * FROM seo_settings WHERE entity_type=? AND entity_id=?', [type, id]);
    let og = cur?.og_image || null;
    if (req.file) og = await images.storeImage(req.file.path, 'seo', { maxWidth: 1200 });
    else if (b.remove_og_image === 'true' || b.remove_og_image === true) og = null;
    const vals = [b.meta_title, b.meta_description, b.meta_keywords, b.og_title, b.og_description, og, b.canonical_url, b.robots || 'index,follow'].map((v, i) => (i === 5 ? v : v ? cleanText(v) : null));
    await query(`INSERT INTO seo_settings (entity_type, entity_id, meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, robots)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE meta_title=VALUES(meta_title), meta_description=VALUES(meta_description), meta_keywords=VALUES(meta_keywords),
      og_title=VALUES(og_title), og_description=VALUES(og_description), og_image=VALUES(og_image), canonical_url=VALUES(canonical_url), robots=VALUES(robots)`, [type, id, ...vals]);
    await audit(req, 'seo.updated', type, id);
    cache.invalidate('public:', 'meta:');
    const row = await one('SELECT * FROM seo_settings WHERE entity_type=? AND entity_id=?', [type, id]);
    ok(res, { ...row, og_image_url: fileUrl(row.og_image) }, 'SEO settings saved');
  } finally { cleanupFiles(req); }
});

/** Overview list of all entities with their SEO status. */
const overview = asyncHandler(async (req, res) => {
  const type = req.query.type || 'edition';
  const map = {
    edition: "SELECT e.id, CONCAT(e.title,' (',e.edition_date,')') AS name, e.slug FROM editions e WHERE e.deleted_at IS NULL ORDER BY e.edition_date DESC LIMIT 300",
    category: 'SELECT id, name, slug FROM edition_categories WHERE deleted_at IS NULL ORDER BY sort_order',
    cms: 'SELECT id, title AS name, slug FROM cms_pages WHERE deleted_at IS NULL ORDER BY sort_order',
    page: "SELECT p.id, CONCAT(e.title,' - Page ',p.page_number) AS name, e.slug FROM edition_pages p JOIN editions e ON e.id=p.edition_id AND e.deleted_at IS NULL ORDER BY e.edition_date DESC, p.page_number LIMIT 500",
  };
  if (!map[type]) throw ApiError.badRequest('Unknown type');
  const rows = await query(map[type]);
  const seo = await query('SELECT entity_id, meta_title, meta_description FROM seo_settings WHERE entity_type=?', [type]);
  const s = Object.fromEntries(seo.map((r) => [r.entity_id, r]));
  ok(res, rows.map((r) => ({ ...r, has_seo: !!s[r.id], meta_title: s[r.id]?.meta_title || null })));
});

const robots = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  const base = (s.site_url || config.appUrl).replace(/\/$/, '');
  let txt = s.robots_txt || 'User-agent: *\nAllow: /';
  if (s.sitemap_enabled && !/sitemap:/i.test(txt)) txt += `\nSitemap: ${base}/sitemap.xml`;
  res.type('text/plain').send(txt);
});

const sitemap = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.sitemap_enabled) return res.status(404).type('text/plain').send('Sitemap disabled');
  const xml = await cache.remember('meta:sitemap', 600, async () => {
    const base = (s.site_url || config.appUrl).replace(/\/$/, '');
    const urls = [{ loc: `${base}/`, priority: '1.0', changefreq: 'daily' }, { loc: `${base}/editions`, priority: '0.8', changefreq: 'daily' }];
    const eds = await query(`SELECT e.slug, e.updated_at, (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id AND p.is_visible=1) pc FROM editions e
      WHERE e.status='published' AND e.is_active=1 AND e.deleted_at IS NULL ORDER BY e.edition_date DESC LIMIT 5000`);
    for (const e of eds) {
      urls.push({ loc: `${base}/edition/${e.slug}`, lastmod: e.updated_at, priority: '0.9', changefreq: 'weekly' });
      for (let i = 2; i <= Math.min(e.pc, 40); i++) urls.push({ loc: `${base}/edition/${e.slug}/page/${i}`, lastmod: e.updated_at, priority: '0.5' });
    }
    for (const c of await query("SELECT slug, updated_at FROM edition_categories WHERE status='active' AND deleted_at IS NULL")) urls.push({ loc: `${base}/category/${c.slug}`, lastmod: c.updated_at, priority: '0.7' });
    for (const p of await query("SELECT slug, updated_at FROM cms_pages WHERE status='published' AND deleted_at IS NULL")) urls.push({ loc: `${base}/page/${p.slug}`, lastmod: p.updated_at, priority: '0.4' });
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) =>
      `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>`;
  });
  res.type('application/xml').send(xml);
});

const regenerateSitemap = asyncHandler(async (req, res) => {
  cache.invalidate('meta:sitemap');
  const count = await query("SELECT COUNT(*) n FROM editions WHERE status='published' AND deleted_at IS NULL");
  await audit(req, 'seo.sitemap_regenerated', 'seo', 'sitemap');
  ok(res, { editions: count[0].n }, 'Sitemap regenerated');
});

module.exports = { get, save, overview, robots, sitemap, regenerateSitemap };
