/* Base seeder: roles, permissions, super admin, settings, categories, CMS pages, locations. Idempotent. */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, query, one } = require('../config/db');
const { MODULES, ROLES } = require('../config/permissions');
const settings = require('../services/settings');
const { randomToken } = require('../utils/helpers');

const CMS = [
  ['About Us', 'about-us', '<h2>About Us</h2><p>Vachana Kranti is a Kannada daily newspaper. This ePaper lets you read every page of our print edition online, exactly as it appears in print.</p>'],
  ['Contact Us', 'contact-us', '<h2>Contact Us</h2><p>For subscriptions, advertisements and feedback please use the form below or reach us by email or phone.</p>'],
  ['Privacy Policy', 'privacy-policy', '<h2>Privacy Policy</h2><p>We collect only the information required to provide our services, such as your name and email address when you register or subscribe. We never sell your personal data.</p>'],
  ['Disclaimer', 'disclaimer', '<h2>Disclaimer</h2><p>The content of this ePaper is the property of the publisher. Reproduction without permission is prohibited.</p>'],
  ['Terms and Conditions', 'terms-and-conditions', '<h2>Terms and Conditions</h2><p>By using this website you agree to these terms. Content is provided for personal, non-commercial reading only.</p>'],
  ['Important Links', 'important-links', '<h2>Important Links</h2><ul><li><a href="/editions">All Editions</a></li><li><a href="/page/about-us">About Us</a></li></ul>'],
];

const KARNATAKA_DISTRICTS = ['Bengaluru Urban', 'Bengaluru Rural', 'Mysuru', 'Belagavi', 'Kalaburagi', 'Dharwad', 'Ballari', 'Vijayapura', 'Shivamogga', 'Dakshina Kannada', 'Tumakuru', 'Raichur', 'Bidar', 'Hassan', 'Mandya'];

async function main() {
  // Permissions
  for (const [module, actions] of Object.entries(MODULES)) {
    for (const action of actions) {
      await query('INSERT IGNORE INTO permissions (module, action, slug, description) VALUES (?,?,?,?)',
        [module, action, `${module}.${action}`, `${action} ${module.replace('_', ' ')}`]);
    }
  }
  const perms = await query('SELECT id, slug FROM permissions');
  const permId = Object.fromEntries(perms.map((p) => [p.slug, p.id]));

  // Roles (permissions only seeded when the role is first created, so admin edits are kept)
  for (const r of ROLES) {
    const existing = await one('SELECT id FROM roles WHERE slug=?', [r.slug]);
    if (existing) {
      if (r.slug === 'super-admin') {
        for (const p of r.perms) await query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)', [existing.id, permId[p]]);
      }
      continue;
    }
    const res = await query('INSERT INTO roles (name, slug, description, is_system) VALUES (?,?,?,1)', [r.name, r.slug, r.description]);
    for (const p of r.perms) await query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)', [res.insertId, permId[p]]);
  }

  // Super admin
  const sa = await one("SELECT id FROM roles WHERE slug='super-admin'");
  const adminExists = await one('SELECT id FROM users WHERE email=?', [config.admin.email]);
  if (!adminExists) {
    const hash = await bcrypt.hash(config.admin.password, config.bcryptRounds);
    await query('INSERT INTO users (name, email, password_hash, role_id, status) VALUES (?,?,?,?,"active")', [config.admin.name, config.admin.email, hash, sa.id]);
    console.log(`✓ Super admin created: ${config.admin.email} / ${config.admin.password}  (change this password after first login)`);
  }

  // Settings defaults
  await settings.ensureDefaults();
  await settings.updateGroup('website_settings', { site_url: config.appUrl });

  // Default category
  if (!(await one('SELECT id FROM edition_categories LIMIT 1'))) {
    const r = await query("INSERT INTO edition_categories (name, slug, description, is_main, sort_order) VALUES ('Main Edition','main-edition','State main edition',1,1)");
    await settings.updateGroup('website_settings', { default_category_id: r.insertId });
  }

  // CMS pages
  for (const [i, [title, slug, content]] of CMS.entries()) {
    await query('INSERT IGNORE INTO cms_pages (title, slug, content, status, show_in_footer, sort_order) VALUES (?,?,?,"published",1,?)', [title, slug, content, i + 1]);
  }

  // Social links
  if (!(await one('SELECT id FROM social_links LIMIT 1'))) {
    const links = [['facebook', 'Facebook', 'https://www.facebook.com/'], ['instagram', 'Instagram', 'https://www.instagram.com/'], ['youtube', 'YouTube', 'https://www.youtube.com/'], ['x', 'X', 'https://x.com/'], ['whatsapp', 'WhatsApp', 'https://whatsapp.com/'], ['telegram', 'Telegram', 'https://t.me/']];
    for (const [i, [platform, label, url]] of links.entries()) {
      await query('INSERT INTO social_links (platform, label, url, icon, sort_order) VALUES (?,?,?,?,?)', [platform, label, url, platform, i + 1]);
    }
  }

  // SEO home
  await query("INSERT IGNORE INTO seo_settings (entity_type, entity_id, meta_title, meta_description, meta_keywords, robots) VALUES ('home',0,?,?,?, 'index,follow')",
    ['Vachana Kranti ePaper', 'Read the Vachana Kranti Kannada daily newspaper online. Main and district editions, every day.', 'epaper, kannada newspaper, vachana kranti, e-paper']);

  // Location master data (Karnataka)
  if (!(await one('SELECT id FROM states LIMIT 1'))) {
    const st = await query("INSERT INTO states (name, slug, code) VALUES ('Karnataka','karnataka','KA')");
    for (const d of KARNATAKA_DISTRICTS) {
      await query('INSERT INTO districts (state_id, name, slug) VALUES (?,?,?)', [st.insertId, d, d.toLowerCase().replace(/[^a-z0-9]+/g, '-')]);
    }
  }

  // Ensure every subscriber has a token (safety for imported data)
  const noTok = await query("SELECT id FROM subscribers WHERE unsubscribe_token='' ");
  for (const s of noTok) await query('UPDATE subscribers SET unsubscribe_token=? WHERE id=?', [randomToken(24), s.id]);

  console.log('✓ Seeding complete.');
}

main().then(() => pool.end()).catch((e) => { console.error('Seeding failed:', e); pool.end(); process.exit(1); });
