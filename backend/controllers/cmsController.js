const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { slugify, cleanText, cleanRichHtml, fileUrl, clientIp } = require('../utils/helpers');
const images = require('../services/images');
const cache = require('../services/cache');
const settings = require('../services/settings');
const { sendMail } = require('../services/mail');
const { audit } = require('../services/audit');
const { cleanupFiles } = require('../middleware/upload');

const ser = (p) => p && ({ ...p, featured_image_url: fileUrl(p.featured_image), show_in_footer: !!p.show_in_footer, show_in_header: !!p.show_in_header });
const RESERVED = ['admin', 'api', 'edition', 'editions', 'login', 'register', 'clip', 'uploads'];

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query, 50);
  const w = ['deleted_at IS NULL']; const p = [];
  if (req.query.q) { w.push('(title LIKE ? OR slug LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.status) { w.push('status=?'); p.push(req.query.status); }
  const [{ total }] = await query(`SELECT COUNT(*) total FROM cms_pages WHERE ${w.join(' AND ')}`, p);
  const rows = await query(`SELECT id, title, slug, status, show_in_footer, show_in_header, sort_order, featured_image, updated_at, created_at FROM cms_pages WHERE ${w.join(' AND ')} ORDER BY sort_order, title LIMIT ? OFFSET ?`, [...p, limit, offset]);
  ok(res, rows.map(ser), 'OK', 200, pageMeta(page, limit, total));
});

const get = asyncHandler(async (req, res) => {
  const p = await one('SELECT * FROM cms_pages WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw ApiError.notFound('Page not found');
  const seo = await one("SELECT * FROM seo_settings WHERE entity_type='cms' AND entity_id=?", [p.id]);
  ok(res, { ...ser(p), seo });
});

const save = (isNew) => asyncHandler(async (req, res) => {
  try {
    const b = req.body;
    let cur = null;
    if (!isNew) { cur = await one('SELECT * FROM cms_pages WHERE id=? AND deleted_at IS NULL', [req.params.id]); if (!cur) throw ApiError.notFound('Page not found'); }
    const slug = slugify(b.slug || b.title);
    if (RESERVED.includes(slug)) throw ApiError.badRequest('This URL is reserved. Choose another slug.');
    if (await one('SELECT id FROM cms_pages WHERE slug=? AND id<>? AND deleted_at IS NULL', [slug, cur?.id || 0])) throw ApiError.conflict('Another page already uses this URL');
    let img = cur?.featured_image || null;
    if (req.file) img = await images.storeImage(req.file.path, 'cms', { maxWidth: 1600 });
    else if (b.remove_image) img = null;
    const vals = { title: cleanText(b.title), slug, content: cleanRichHtml(b.content), featured_image: img, status: b.status, show_in_footer: b.show_in_footer ? 1 : 0, show_in_header: b.show_in_header ? 1 : 0, sort_order: b.sort_order };
    let id = cur?.id;
    if (isNew) id = (await query('INSERT INTO cms_pages SET ?', [{ ...vals, created_by: req.user.id }])).insertId;
    else await query('UPDATE cms_pages SET ? WHERE id=?', [vals, id]);
    // inline SEO
    let seo = b.seo;
    if (typeof seo === 'string') { try { seo = JSON.parse(seo); } catch { seo = null; } }
    if (seo && typeof seo === 'object') {
      await query(`INSERT INTO seo_settings (entity_type, entity_id, meta_title, meta_description, meta_keywords) VALUES ('cms',?,?,?,?)
        ON DUPLICATE KEY UPDATE meta_title=VALUES(meta_title), meta_description=VALUES(meta_description), meta_keywords=VALUES(meta_keywords)`,
      [id, cleanText(seo.meta_title || '') || null, cleanText(seo.meta_description || '') || null, cleanText(seo.meta_keywords || '') || null]);
    }
    await audit(req, isNew ? 'cms.created' : 'cms.updated', 'cms_page', id, { title: vals.title });
    cache.invalidate('public:', 'meta:');
    (isNew ? created : ok)(res, ser(await one('SELECT * FROM cms_pages WHERE id=?', [id])), isNew ? 'Page created' : 'Page updated');
  } finally { cleanupFiles(req); }
});

const remove = asyncHandler(async (req, res) => {
  const p = await one('SELECT * FROM cms_pages WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw ApiError.notFound();
  await query("UPDATE cms_pages SET deleted_at=NOW(), slug=CONCAT(slug,'-deleted-',id) WHERE id=?", [p.id]);
  await audit(req, 'cms.deleted', 'cms_page', p.id, { title: p.title });
  cache.invalidate('public:');
  ok(res, null, 'Page deleted');
});

const toggle = asyncHandler(async (req, res) => {
  await query("UPDATE cms_pages SET status=IF(status='published','draft','published') WHERE id=?", [req.params.id]);
  await audit(req, 'cms.status_toggled', 'cms_page', req.params.id);
  cache.invalidate('public:');
  ok(res, ser(await one('SELECT * FROM cms_pages WHERE id=?', [req.params.id])), 'Status updated');
});

/** Upload an inline image for the rich text editor. */
const uploadImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) throw ApiError.badRequest('No image');
    const p = await images.storeImage(req.file.path, 'cms', { maxWidth: 1600 });
    ok(res, { url: fileUrl(p) }, 'Image uploaded');
  } finally { cleanupFiles(req); }
});

const publicGet = asyncHandler(async (req, res) => {
  const p = await cache.remember(`public:cms:${req.params.slug}`, 120, async () => {
    const row = await one("SELECT id, title, slug, content, featured_image, updated_at FROM cms_pages WHERE slug=? AND status='published' AND deleted_at IS NULL", [req.params.slug]);
    if (!row) return null;
    const seo = await one("SELECT meta_title, meta_description, meta_keywords FROM seo_settings WHERE entity_type='cms' AND entity_id=?", [row.id]);
    return { ...ser(row), seo };
  });
  if (!p) throw ApiError.notFound('Page not found');
  ok(res, p);
});

/* Contact form */
const contact = asyncHandler(async (req, res) => {
  const b = req.body;
  const recent = await one('SELECT COUNT(*) n FROM contact_messages WHERE ip_address=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [clientIp(req)]);
  if (recent.n >= 5) throw new ApiError(429, 'Too many messages. Please try again later.');
  await query('INSERT INTO contact_messages (name, email, subject, message, ip_address) VALUES (?,?,?,?,?)', [cleanText(b.name), b.email, b.subject ? cleanText(b.subject) : null, cleanText(b.message), clientIp(req)]);
  const s = await settings.getGroup('website_settings');
  if (s.contact_email) sendMail({ to: s.contact_email, subject: `[Contact] ${b.subject || 'New message'} – ${b.name}`, html: `<p><b>${cleanText(b.name)}</b> &lt;${b.email}&gt;</p><p>${cleanText(b.message).replace(/\n/g, '<br>')}</p>` }).catch(() => {});
  created(res, null, 'Thank you! Your message has been sent.');
});

const contactList = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const [{ total }] = await query('SELECT COUNT(*) total FROM contact_messages');
  ok(res, await query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]), 'OK', 200, pageMeta(page, limit, total));
});
const contactRead = asyncHandler(async (req, res) => { await query('UPDATE contact_messages SET is_read=1 WHERE id=?', [req.params.id]); ok(res, null, 'Marked as read'); });
const contactRemove = asyncHandler(async (req, res) => { await query('DELETE FROM contact_messages WHERE id=?', [req.params.id]); await audit(req, 'contact.deleted', 'contact', req.params.id); ok(res, null, 'Message deleted'); });

module.exports = { list, get, create: save(true), update: save(false), remove, toggle, uploadImage, publicGet, contact, contactList, contactRead, contactRemove };
