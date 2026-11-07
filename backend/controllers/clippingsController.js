const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { randomCode, fileUrl, clientIp } = require('../utils/helpers');
const images = require('../services/images');
const settings = require('../services/settings');
const config = require('../config');
const { PUBLIC_WHERE } = require('./editionsController');

const shareUrl = (code) => `${config.appUrl}/clip/${code}`;

const create = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.action_crop) throw ApiError.forbidden('Clipping is disabled.');
  const { page_id, x, y, w, h } = req.body;
  const page = await one(`SELECT p.id, p.edition_id, p.page_number, e.edition_date, pi.path FROM edition_pages p JOIN editions e ON e.id=p.edition_id
    JOIN page_images pi ON pi.page_id=p.id AND pi.variant='large' WHERE p.id=? AND p.is_visible=1 AND ${PUBLIC_WHERE}`, [page_id]);
  if (!page) throw ApiError.notFound('Page not found');
  // Same box on the same page → reuse existing clipping
  const box = { x: Math.min(x, 0.99), y: Math.min(y, 0.99), w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
  const existing = await one('SELECT code FROM shared_clippings WHERE page_id=? AND ABS(x-?)<0.0005 AND ABS(y-?)<0.0005 AND ABS(w-?)<0.0005 AND ABS(h-?)<0.0005 LIMIT 1',
    [page.id, box.x, box.y, box.w, box.h]);
  if (existing) return ok(res, await clipPayload(existing.code), 'Clipping ready');
  const theme = await settings.getGroup('theme_settings');
  const [{ pos }] = await query('SELECT COUNT(*) pos FROM edition_pages WHERE edition_id=? AND is_visible=1 AND page_number<=?', [page.edition_id, page.page_number]);
  const [dy, dm, dd] = String(page.edition_date).split('-').map(Number);
  let domain = config.appUrl;
  try { domain = new URL(s.site_url || config.appUrl).host; } catch { /* keep */ }
  const out = await images.cropClip(page.path, box, {
    logo: s.header_logo || s.site_logo, siteName: s.site_name, color: theme.primary_color,
    dateText: new Date(dy, (dm || 1) - 1, dd || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    pageNo: pos, domain,
  });
  let code;
  do { code = randomCode(10); } while (await one('SELECT id FROM shared_clippings WHERE code=?', [code]));
  await query('INSERT INTO shared_clippings (code, edition_id, page_id, x, y, w, h, image_path, width, height, user_id, ip_address) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [code, page.edition_id, page.id, box.x, box.y, box.w, box.h, out.path, out.width, out.height, req.user?.id || null, clientIp(req)]);
  created(res, await clipPayload(code), 'Clipping created');
});

async function clipPayload(code) {
  const c = await one(`SELECT sc.*, e.title AS edition_title, e.slug AS edition_slug, e.edition_date, p.page_number, c.name AS category_name
    FROM shared_clippings sc JOIN editions e ON e.id=sc.edition_id JOIN edition_pages p ON p.id=sc.page_id JOIN edition_categories c ON c.id=e.category_id
    WHERE sc.code=? AND ${PUBLIC_WHERE} AND p.is_visible=1`, [code]);
  if (!c) return null;
  return {
    code: c.code, image_url: fileUrl(c.image_path), width: c.width, height: c.height, x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h),
    edition_title: c.edition_title, edition_slug: c.edition_slug, edition_date: c.edition_date, page_number: c.page_number, page_id: c.page_id,
    category_name: c.category_name, view_count: c.view_count, created_at: c.created_at, share_url: shareUrl(c.code),
  };
}

const get = asyncHandler(async (req, res) => {
  const data = await clipPayload(req.params.code);
  if (!data) throw ApiError.notFound('Clipping not found or no longer available');
  query('UPDATE shared_clippings SET view_count=view_count+1 WHERE code=?', [req.params.code]).catch(() => {});
  ok(res, data);
});

const download = asyncHandler(async (req, res) => {
  const c = await one('SELECT image_path, code FROM shared_clippings WHERE code=?', [req.params.code]);
  if (!c) throw ApiError.notFound('Clipping not found');
  res.download(images.absUpload(c.image_path), `clip-${c.code}.jpg`);
});

/** Admin listing of clippings */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const [{ total }] = await query('SELECT COUNT(*) total FROM shared_clippings');
  const rows = await query(`SELECT sc.code, sc.image_path, sc.view_count, sc.created_at, e.title AS edition_title, p.page_number FROM shared_clippings sc
    JOIN editions e ON e.id=sc.edition_id JOIN edition_pages p ON p.id=sc.page_id ORDER BY sc.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
  ok(res, rows.map((r) => ({ ...r, image_url: fileUrl(r.image_path), share_url: shareUrl(r.code) })), 'OK', 200, pageMeta(page, limit, total));
});

const remove = asyncHandler(async (req, res) => {
  const c = await one('SELECT * FROM shared_clippings WHERE code=?', [req.params.code]);
  if (!c) throw ApiError.notFound();
  await query('DELETE FROM shared_clippings WHERE id=?', [c.id]);
  images.safeUnlink(images.absUpload(c.image_path));
  ok(res, null, 'Clipping deleted');
});

module.exports = { create, get, download, list, remove, clipPayload };
