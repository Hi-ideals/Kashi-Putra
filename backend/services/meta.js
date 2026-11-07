/**
 * Server-side <head> meta injection for the built React app, so crawlers and
 * social networks (WhatsApp, Facebook, X, Telegram) see correct titles,
 * descriptions and preview images for editions, pages, clippings and CMS pages.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { one } = require('../config/db');
const settings = require('./settings');
const cache = require('./cache');
const { fileUrl } = require('../utils/helpers');

let template = null;
function getTemplate() {
  if (template && config.isProd) return template;
  const file = path.join(config.paths.frontendDist, 'index.html');
  template = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return template;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function metaFor(urlPath) {
  const site = await settings.getGroup('website_settings');
  const base = (site.site_url || config.appUrl).replace(/\/$/, '');
  const abs = (u) => (!u ? null : /^https?:/.test(u) ? u : `${base}${u}`);
  const home = await one("SELECT * FROM seo_settings WHERE entity_type='home' AND entity_id=0");
  const m = {
    title: home?.meta_title || site.site_title, description: home?.meta_description || site.footer_content, keywords: home?.meta_keywords,
    og_title: home?.og_title, og_description: home?.og_description, image: abs(fileUrl(home?.og_image) || fileUrl(site.site_logo)),
    canonical: home?.canonical_url || `${base}${urlPath === '/' ? '/' : urlPath}`, robots: home?.robots || 'index,follow', type: 'website',
  };
  let mt;
  if ((mt = urlPath.match(/^\/edition\/([^/]+)(?:\/page\/(\d+))?/))) {
    const ed = await one(`SELECT e.id, e.title, e.edition_date, e.description, e.cover_image, c.name cat FROM editions e JOIN edition_categories c ON c.id=e.category_id
      WHERE e.slug=? AND e.status='published' AND e.is_active=1 AND e.deleted_at IS NULL`, [decodeURIComponent(mt[1])]);
    if (ed) {
      const pn = Number(mt[2] || 1);
      const pg = await one(`SELECT p.id, p.title, pi.path FROM edition_pages p LEFT JOIN page_images pi ON pi.page_id=p.id AND pi.variant='medium' WHERE p.edition_id=? AND p.is_visible=1 ORDER BY p.page_number LIMIT 1 OFFSET ?`, [ed.id, pn - 1]);
      const seoE = await one("SELECT * FROM seo_settings WHERE entity_type='edition' AND entity_id=?", [ed.id]);
      const seoP = pg ? await one("SELECT * FROM seo_settings WHERE entity_type='page' AND entity_id=?", [pg.id]) : null;
      const s = { ...(seoE || {}), ...Object.fromEntries(Object.entries(seoP || {}).filter(([, v]) => v)) };
      Object.assign(m, {
        title: s.meta_title || `${ed.title} – ${ed.edition_date}${pn > 1 ? ` – Page ${pn}` : ''} | ${site.site_name}`,
        description: s.meta_description || ed.description || `Read ${ed.title} (${ed.cat}) dated ${ed.edition_date} online – ${site.site_name} ePaper.`,
        keywords: s.meta_keywords || m.keywords, og_title: s.og_title, og_description: s.og_description,
        image: abs(fileUrl(s.og_image) || fileUrl(pg?.path) || fileUrl(ed.cover_image)) || m.image,
        canonical: s.canonical_url || `${base}${urlPath}`, robots: s.robots || m.robots, type: 'article',
      });
    }
  } else if ((mt = urlPath.match(/^\/clip\/([A-Za-z0-9]+)/))) {
    const c = await one(`SELECT sc.image_path, e.title, e.edition_date, p.page_number FROM shared_clippings sc JOIN editions e ON e.id=sc.edition_id JOIN edition_pages p ON p.id=sc.page_id WHERE sc.code=?`, [mt[1]]);
    if (c) Object.assign(m, { title: `${c.title} – ${c.edition_date} – Page ${c.page_number} | ${site.site_name}`, description: `News clipping from ${site.site_name} ePaper, ${c.edition_date}.`, image: abs(fileUrl(c.image_path)), type: 'article', og_title: null, og_description: null });
  } else if ((mt = urlPath.match(/^\/page\/([^/]+)/))) {
    const p = await one("SELECT id, title, featured_image FROM cms_pages WHERE slug=? AND status='published' AND deleted_at IS NULL", [mt[1]]);
    if (p) {
      const s = await one("SELECT * FROM seo_settings WHERE entity_type='cms' AND entity_id=?", [p.id]);
      Object.assign(m, { title: s?.meta_title || `${p.title} | ${site.site_name}`, description: s?.meta_description || m.description, keywords: s?.meta_keywords || m.keywords, image: abs(fileUrl(s?.og_image) || fileUrl(p.featured_image)) || m.image, og_title: s?.og_title, og_description: s?.og_description, robots: s?.robots || m.robots });
    }
  } else if ((mt = urlPath.match(/^\/category\/([^/]+)/))) {
    const c = await one("SELECT id, name, description, image FROM edition_categories WHERE slug=? AND status='active' AND deleted_at IS NULL", [mt[1]]);
    if (c) {
      const s = await one("SELECT * FROM seo_settings WHERE entity_type='category' AND entity_id=?", [c.id]);
      Object.assign(m, { title: s?.meta_title || `${c.name} | ${site.site_name} ePaper`, description: s?.meta_description || c.description || m.description, keywords: s?.meta_keywords || m.keywords, image: abs(fileUrl(s?.og_image) || fileUrl(c.image)) || m.image, og_title: s?.og_title, og_description: s?.og_description, robots: s?.robots || m.robots });
    }
  } else if (urlPath.startsWith('/admin')) {
    m.robots = 'noindex,nofollow'; m.title = `Admin | ${site.site_name}`;
  }
  const fav = fileUrl(site.favicon);
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    m.keywords ? `<meta name="keywords" content="${esc(m.keywords)}">` : '',
    `<meta name="robots" content="${esc(m.robots)}">`,
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta property="og:site_name" content="${esc(site.site_name)}">`,
    `<meta property="og:type" content="${m.type}">`,
    `<meta property="og:title" content="${esc(m.og_title || m.title)}">`,
    `<meta property="og:description" content="${esc(m.og_description || m.description)}">`,
    `<meta property="og:url" content="${esc(`${base}${urlPath}`)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(m.og_title || m.title)}">`,
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}">` : '',
    fav ? `<link rel="icon" href="${esc(fav)}">` : '',
  ].filter(Boolean).join('\n    ');
}

async function renderIndex(urlPath) {
  const tpl = getTemplate();
  if (!tpl) return null;
  const head = await cache.remember(`meta:${urlPath}`, 60, () => metaFor(urlPath));
  return tpl.replace(/<title>[\s\S]*?<\/title>/, '').replace('<!--app-meta-->', head);
}

module.exports = { renderIndex, metaFor };
