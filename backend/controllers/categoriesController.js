const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { slugify, fileUrl, cleanText } = require('../utils/helpers');
const images = require('../services/images');
const cache = require('../services/cache');
const { audit } = require('../services/audit');
const { cleanupFiles } = require('../middleware/upload');

const ser = (c) => ({ ...c, image_url: fileUrl(c.image), is_main: !!c.is_main });

async function uniqueSlug(base, exclude = 0) {
  let s = base; let i = 1;
  while (await one('SELECT id FROM edition_categories WHERE slug=? AND id<>?', [s, exclude])) s = `${base}-${++i}`;
  return s;
}

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query, 50, 200);
  const w = ['c.deleted_at IS NULL']; const p = [];
  if (req.query.q) { w.push('c.name LIKE ?'); p.push(`%${req.query.q}%`); }
  if (req.query.status) { w.push('c.status=?'); p.push(req.query.status); }
  const [{ total }] = await query(`SELECT COUNT(*) total FROM edition_categories c WHERE ${w.join(' AND ')}`, p);
  const rows = await query(`SELECT c.*, (SELECT COUNT(*) FROM editions e WHERE e.category_id=c.id AND e.deleted_at IS NULL) AS edition_count
    FROM edition_categories c WHERE ${w.join(' AND ')} ORDER BY c.sort_order, c.name LIMIT ? OFFSET ?`, [...p, limit, offset]);
  ok(res, rows.map(ser), 'OK', 200, pageMeta(page, limit, total));
});

const get = asyncHandler(async (req, res) => {
  const c = await one('SELECT * FROM edition_categories WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!c) throw ApiError.notFound('Category not found');
  const seo = await one("SELECT * FROM seo_settings WHERE entity_type='category' AND entity_id=?", [c.id]);
  ok(res, { ...ser(c), seo });
});

const save = (isNew) => asyncHandler(async (req, res) => {
  try {
    const b = req.body;
    let cur = null;
    if (!isNew) {
      cur = await one('SELECT * FROM edition_categories WHERE id=? AND deleted_at IS NULL', [req.params.id]);
      if (!cur) throw ApiError.notFound('Category not found');
    }
    const slug = await uniqueSlug(slugify(b.slug || b.name), cur?.id || 0);
    let image = cur?.image || null;
    if (req.file) image = await images.storeImage(req.file.path, 'categories', { maxWidth: 800 });
    else if (b.remove_image) image = null;
    if (b.is_main) await query('UPDATE edition_categories SET is_main=0');
    let id = cur?.id;
    if (isNew) {
      const r = await query('INSERT INTO edition_categories (name, slug, description, image, status, sort_order, is_main) VALUES (?,?,?,?,?,?,?)',
        [cleanText(b.name), slug, b.description ? cleanText(b.description) : null, image, b.status, b.sort_order, b.is_main ? 1 : 0]);
      id = r.insertId;
    } else {
      await query('UPDATE edition_categories SET name=?, slug=?, description=?, image=?, status=?, sort_order=?, is_main=? WHERE id=?',
        [cleanText(b.name), slug, b.description ? cleanText(b.description) : null, image, b.status, b.sort_order, b.is_main ? 1 : 0, id]);
      if (cur.image && cur.image !== image) images.safeUnlink(images.absUpload(cur.image));
    }
    // Assign editions to this category
    if (Array.isArray(req.body.assign_edition_ids) && req.body.assign_edition_ids.length) {
      await query('UPDATE editions SET category_id=? WHERE id IN (?)', [id, req.body.assign_edition_ids.map(Number)]);
    }
    await audit(req, isNew ? 'category.created' : 'category.updated', 'category', id, { name: b.name });
    cache.invalidate('public:');
    const c = await one('SELECT * FROM edition_categories WHERE id=?', [id]);
    (isNew ? created : ok)(res, ser(c), isNew ? 'Category created' : 'Category updated');
  } finally { cleanupFiles(req); }
});

const remove = asyncHandler(async (req, res) => {
  const c = await one('SELECT * FROM edition_categories WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!c) throw ApiError.notFound('Category not found');
  const used = await one('SELECT COUNT(*) n FROM editions WHERE category_id=? AND deleted_at IS NULL', [c.id]);
  if (used.n) throw ApiError.conflict(`This category has ${used.n} edition(s). Move or delete them first.`);
  await query("UPDATE edition_categories SET deleted_at=NOW(), status='inactive', slug=CONCAT(slug,'-deleted-',id) WHERE id=?", [c.id]);
  await audit(req, 'category.deleted', 'category', c.id, { name: c.name });
  cache.invalidate('public:');
  ok(res, null, 'Category deleted');
});

const toggle = asyncHandler(async (req, res) => {
  await query("UPDATE edition_categories SET status=IF(status='active','inactive','active') WHERE id=? AND deleted_at IS NULL", [req.params.id]);
  await audit(req, 'category.status_toggled', 'category', req.params.id);
  cache.invalidate('public:');
  ok(res, ser(await one('SELECT * FROM edition_categories WHERE id=?', [req.params.id])), 'Status updated');
});

const publicList = asyncHandler(async (req, res) => {
  const rows = await cache.remember('public:categories', 120, () => query(`SELECT c.id, c.name, c.slug, c.description, c.image, c.is_main,
    (SELECT COUNT(*) FROM editions e WHERE e.category_id=c.id AND e.status='published' AND e.is_active=1 AND e.deleted_at IS NULL) AS edition_count
    FROM edition_categories c WHERE c.status='active' AND c.deleted_at IS NULL ORDER BY c.is_main DESC, c.sort_order, c.name`));
  ok(res, rows.map(ser));
});

module.exports = { list, get, create: save(true), update: save(false), remove, toggle, publicList };
