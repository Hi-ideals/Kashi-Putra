const fs = require('fs');
const path = require('path');
const { query, one, transaction } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { slugify, fileUrl, cleanText, todayISO } = require('../utils/helpers');
const { audit } = require('../services/audit');
const cache = require('../services/cache');
const images = require('../services/images');
const settings = require('../services/settings');
const { publishEdition, pagesWithImages, serializeEdition } = require('../services/editions');
const { cleanupFiles } = require('../middleware/upload');
const config = require('../config');

const PUBLIC_WHERE = "e.status='published' AND e.is_active=1 AND e.deleted_at IS NULL";

async function uniqueSlug(base, excludeId = 0) {
  let slug = base; let i = 1;
  while (await one('SELECT id FROM editions WHERE slug=? AND id<>?', [slug, excludeId])) slug = `${base}-${++i}`;
  return slug;
}

const baseSelect = `SELECT e.*, c.name AS category_name, c.slug AS category_slug, r.name AS region_name,
  (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id) AS page_count,
  (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id AND p.is_visible=1) AS visible_page_count,
  (SELECT s.publish_at FROM edition_schedules s WHERE s.edition_id=e.id AND s.status='pending' ORDER BY s.publish_at LIMIT 1) AS scheduled_for
  FROM editions e JOIN edition_categories c ON c.id=e.category_id LEFT JOIN regions r ON r.id=e.region_id`;

/* ----------------------------- ADMIN ----------------------------- */

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const w = ['e.deleted_at IS NULL']; const p = [];
  if (req.query.q) { w.push('(e.title LIKE ? OR e.slug LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.status) { w.push('e.status=?'); p.push(req.query.status); }
  if (req.query.category_id) { w.push('e.category_id=?'); p.push(req.query.category_id); }
  if (req.query.region_id) { w.push('e.region_id=?'); p.push(req.query.region_id); }
  if (req.query.date_from) { w.push('e.edition_date>=?'); p.push(req.query.date_from); }
  if (req.query.date_to) { w.push('e.edition_date<=?'); p.push(req.query.date_to); }
  if (req.query.active === '1' || req.query.active === '0') { w.push('e.is_active=?'); p.push(Number(req.query.active)); }
  const sortMap = { date: 'e.edition_date', title: 'e.title', created: 'e.created_at', status: 'e.status', views: 'e.view_count' };
  const sort = sortMap[req.query.sort] || 'e.edition_date';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const where = w.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM editions e WHERE ${where}`, p);
  const rows = await query(`${baseSelect} WHERE ${where} ORDER BY ${sort} ${dir}, e.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  ok(res, rows.map(serializeEdition), 'OK', 200, pageMeta(page, limit, total));
});

const get = asyncHandler(async (req, res) => {
  const ed = await one(`${baseSelect} WHERE e.id=? AND e.deleted_at IS NULL`, [req.params.id]);
  if (!ed) throw ApiError.notFound('Edition not found');
  const pages = await pagesWithImages(ed.id);
  const schedules = await query('SELECT * FROM edition_schedules WHERE edition_id=? ORDER BY publish_at DESC', [ed.id]);
  const seo = await one("SELECT * FROM seo_settings WHERE entity_type='edition' AND entity_id=?", [ed.id]);
  const mappings = await query('SELECT * FROM area_mappings WHERE edition_id=?', [ed.id]);
  ok(res, { ...serializeEdition(ed), pages, schedules, seo, mappings });
});

async function handleCover(req, current) {
  if (req.file) {
    const p = await images.storeImage(req.file.path, 'covers', { maxWidth: 1200 });
    return p;
  }
  if (req.body.remove_cover) return null;
  return current;
}

function parsePublishAt(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid publication date/time');
  return d;
}

const create = asyncHandler(async (req, res) => {
  try {
    const b = req.body;
    if (!(await one('SELECT id FROM edition_categories WHERE id=? AND deleted_at IS NULL', [b.category_id]))) throw ApiError.badRequest('Selected category does not exist');
    if (b.status === 'published') throw ApiError.badRequest('Upload pages before publishing. Save the edition as a draft first.');
    const publishAt = parsePublishAt(b.publish_at);
    if (b.status === 'scheduled' && (!publishAt || publishAt <= new Date())) throw ApiError.badRequest('Choose a future publication date and time to schedule.');
    const slug = await uniqueSlug(slugify(b.slug || `${b.title}-${b.edition_date}`));
    const cover = await handleCover(req, null);
    const id = await transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO editions (category_id, region_id, title, slug, edition_date, description, cover_image, status, is_active, publish_at, comments_enabled, allow_download, allow_print, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.category_id, b.region_id, cleanText(b.title), slug, b.edition_date, b.description ? cleanText(b.description) : null, cover, b.status, b.is_active ? 1 : 0,
          b.status === 'scheduled' ? publishAt : null, b.comments_enabled ? 1 : 0, b.allow_download ? 1 : 0, b.allow_print ? 1 : 0, req.user.id, req.user.id]);
      if (b.status === 'scheduled') {
        await conn.query('INSERT INTO edition_schedules (edition_id, publish_at, created_by) VALUES (?,?,?)', [r.insertId, publishAt, req.user.id]);
      }
      return r.insertId;
    });
    await audit(req, 'edition.created', 'edition', id, { title: b.title, status: b.status });
    cache.invalidate('public:');
    const ed = await one(`${baseSelect} WHERE e.id=?`, [id]);
    created(res, serializeEdition(ed), 'Edition created successfully');
  } finally { cleanupFiles(req); }
});

const update = asyncHandler(async (req, res) => {
  try {
    const b = req.body;
    const ed = await one('SELECT * FROM editions WHERE id=? AND deleted_at IS NULL', [req.params.id]);
    if (!ed) throw ApiError.notFound('Edition not found');
    const publishAt = parsePublishAt(b.publish_at);
    if (b.status === 'scheduled' && (!publishAt || publishAt <= new Date())) throw ApiError.badRequest('Choose a future publication date and time to schedule.');
    if (b.status === 'published' && ed.status !== 'published') {
      if (!req.user.is_super && !req.user.permissions.includes('editions.publish')) throw ApiError.forbidden('You do not have permission to publish editions');
    }
    const slug = b.slug && slugify(b.slug) !== ed.slug ? await uniqueSlug(slugify(b.slug), ed.id) : ed.slug;
    const cover = await handleCover(req, ed.cover_image);
    await transaction(async (conn) => {
      await conn.query(
        `UPDATE editions SET category_id=?, region_id=?, title=?, slug=?, edition_date=?, description=?, cover_image=?, is_active=?, comments_enabled=?, allow_download=?, allow_print=?, updated_by=? WHERE id=?`,
        [b.category_id, b.region_id, cleanText(b.title), slug, b.edition_date, b.description ? cleanText(b.description) : null, cover, b.is_active ? 1 : 0,
          b.comments_enabled ? 1 : 0, b.allow_download ? 1 : 0, b.allow_print ? 1 : 0, req.user.id, ed.id]);
      if (b.status !== ed.status || b.status === 'scheduled') {
        if (b.status === 'scheduled') {
          await conn.query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [ed.id]);
          await conn.query('INSERT INTO edition_schedules (edition_id, publish_at, created_by) VALUES (?,?,?)', [ed.id, publishAt, req.user.id]);
          await conn.query("UPDATE editions SET status='scheduled', publish_at=? WHERE id=?", [publishAt, ed.id]);
        } else if (b.status !== 'published') {
          await conn.query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [ed.id]);
          await conn.query('UPDATE editions SET status=?, publish_at=NULL WHERE id=?', [b.status, ed.id]);
        }
      }
    });
    if (b.status === 'published' && ed.status !== 'published') await publishEdition(ed.id, req.user.id);
    if (cover !== ed.cover_image && ed.cover_image && ed.cover_image.startsWith('covers/')) images.safeUnlink(images.absUpload(ed.cover_image));
    await audit(req, 'edition.updated', 'edition', ed.id, { status: b.status });
    cache.invalidate('public:');
    const fresh = await one(`${baseSelect} WHERE e.id=?`, [ed.id]);
    ok(res, serializeEdition(fresh), 'Edition updated successfully');
  } finally { cleanupFiles(req); }
});

const remove = asyncHandler(async (req, res) => {
  const ed = await one('SELECT id, slug, title FROM editions WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!ed) throw ApiError.notFound('Edition not found');
  await query("UPDATE editions SET deleted_at=NOW(), status='archived', is_active=0, slug=CONCAT(slug,'-deleted-',id) WHERE id=?", [ed.id]);
  await query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [ed.id]);
  await audit(req, 'edition.deleted', 'edition', ed.id, { title: ed.title });
  cache.invalidate('public:');
  ok(res, null, 'Edition deleted');
});

/** Duplicate an edition incl. pages and image files (as a draft). */
async function duplicateEdition(id, user) {
  const ed = await one('SELECT * FROM editions WHERE id=? AND deleted_at IS NULL', [id]);
  if (!ed) throw ApiError.notFound('Edition not found');
  const slug = await uniqueSlug(`${ed.slug}-copy`);
  const newId = await transaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO editions (category_id, region_id, title, slug, edition_date, description, cover_image, status, is_active, comments_enabled, allow_download, allow_print, created_by, updated_by)
       VALUES (?,?,?,?,?,?,?, 'draft', 1, ?,?,?,?,?)`,
      [ed.category_id, ed.region_id, `${ed.title} (Copy)`, slug, ed.edition_date, ed.description, null, ed.comments_enabled, ed.allow_download, ed.allow_print, user.id, user.id]);
    const pages = await conn.query('SELECT * FROM edition_pages WHERE edition_id=? ORDER BY page_number', [id]);
    for (const p of pages[0]) {
      const [pr] = await conn.query('INSERT INTO edition_pages (edition_id, page_number, title, description, is_visible, original_name, width, height) VALUES (?,?,?,?,?,?,?,?)',
        [r.insertId, p.page_number, p.title, p.description, p.is_visible, p.original_name, p.width, p.height]);
      const [imgs] = await conn.query('SELECT * FROM page_images WHERE page_id=?', [p.id]);
      for (const im of imgs) {
        const isOrig = im.variant === 'original';
        const srcAbs = isOrig ? images.absOriginal(im.path) : images.absUpload(im.path);
        const destRel = im.path.replace(/editions\/\d+\//, `editions/${r.insertId}/`);
        const destAbs = isOrig ? images.absOriginal(destRel) : images.absUpload(destRel);
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        if (fs.existsSync(srcAbs)) await fs.promises.copyFile(srcAbs, destAbs);
        await conn.query('INSERT INTO page_images (page_id, variant, path, mime, width, height, size_bytes, is_watermarked) VALUES (?,?,?,?,?,?,?,?)',
          [pr.insertId, im.variant, destRel, im.mime, im.width, im.height, im.size_bytes, im.is_watermarked]);
      }
    }
    return r.insertId;
  });
  return newId;
}

const duplicate = asyncHandler(async (req, res) => {
  const newId = await duplicateEdition(req.params.id, req.user);
  await audit(req, 'edition.duplicated', 'edition', newId, { from: Number(req.params.id) });
  const ed = await one(`${baseSelect} WHERE e.id=?`, [newId]);
  created(res, serializeEdition(ed), 'Edition duplicated as a draft');
});

/** Single-edition action: publish | unpublish | archive | draft | activate | deactivate */
async function applyAction(id, action, req) {
  const ed = await one('SELECT id, status FROM editions WHERE id=? AND deleted_at IS NULL', [id]);
  if (!ed) throw ApiError.notFound(`Edition #${id} not found`);
  switch (action) {
    case 'publish': await publishEdition(id, req.user.id); break;
    case 'unpublish':
      await query("UPDATE editions SET status='unpublished', updated_by=? WHERE id=?", [req.user.id, id]);
      await query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [id]); break;
    case 'archive': await query("UPDATE editions SET status='archived', updated_by=? WHERE id=?", [req.user.id, id]); break;
    case 'draft':
      await query("UPDATE editions SET status='draft', publish_at=NULL, updated_by=? WHERE id=?", [req.user.id, id]);
      await query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [id]); break;
    case 'activate': await query('UPDATE editions SET is_active=1, updated_by=? WHERE id=?', [req.user.id, id]); break;
    case 'deactivate': await query('UPDATE editions SET is_active=0, updated_by=? WHERE id=?', [req.user.id, id]); break;
    case 'delete': await query("UPDATE editions SET deleted_at=NOW(), status='archived', is_active=0, slug=CONCAT(slug,'-deleted-',id) WHERE id=?", [id]); break;
    case 'duplicate': return duplicateEdition(id, req.user);
    default: throw ApiError.badRequest('Unknown action');
  }
  await audit(req, `edition.${action}`, 'edition', id);
  return id;
}

const ACTION_PERMS = { publish: 'editions.publish', unpublish: 'editions.publish', archive: 'editions.edit', draft: 'editions.edit', activate: 'editions.edit', deactivate: 'editions.edit', delete: 'editions.delete', duplicate: 'editions.add' };
function checkActionPerm(req, action) {
  const need = ACTION_PERMS[action];
  if (!need) throw ApiError.badRequest('Unknown action');
  if (!req.user.is_super && !req.user.permissions.includes(need)) throw ApiError.forbidden(`You need the "${need}" permission for this action`);
}

const action = asyncHandler(async (req, res) => {
  const act = req.params.action;
  checkActionPerm(req, act);
  await applyAction(Number(req.params.id), act, req);
  cache.invalidate('public:');
  const ed = await one(`${baseSelect} WHERE e.id=?`, [req.params.id]);
  ok(res, ed ? serializeEdition(ed) : null, `Edition ${act === 'delete' ? 'deleted' : act + (act.endsWith('e') ? 'd' : 'ed')} successfully`);
});

const bulk = asyncHandler(async (req, res) => {
  const { ids, action: act } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw ApiError.badRequest('Select at least one edition');
  checkActionPerm(req, act);
  const results = { success: [], failed: [] };
  for (const id of ids.slice(0, 200)) {
    try { await applyAction(Number(id), act, req); results.success.push(id); } catch (e) { results.failed.push({ id, error: e.message }); }
  }
  cache.invalidate('public:');
  ok(res, results, `${results.success.length} edition(s) updated${results.failed.length ? `, ${results.failed.length} failed` : ''}`);
});

/* ----------------------------- PUBLIC ----------------------------- */

const publicSelect = `SELECT e.id, e.title, e.slug, e.edition_date, e.description, e.cover_image, e.published_at, e.category_id, e.region_id,
  e.comments_enabled, e.allow_download, e.allow_print, e.view_count, c.name AS category_name, c.slug AS category_slug, r.name AS region_name,
  (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id AND p.is_visible=1) AS page_count,
  (SELECT pi.path FROM edition_pages p JOIN page_images pi ON pi.page_id=p.id AND pi.variant='thumb' WHERE p.edition_id=e.id AND p.is_visible=1 ORDER BY p.page_number LIMIT 1) AS thumb_path
  FROM editions e JOIN edition_categories c ON c.id=e.category_id AND c.status='active' AND c.deleted_at IS NULL LEFT JOIN regions r ON r.id=e.region_id`;

const pub = (e) => ({ ...serializeEdition(e), thumb_url: fileUrl(e.thumb_path) || fileUrl(e.cover_image), thumb_path: undefined, cover_image: undefined });

function publicFilters(q) {
  const w = [PUBLIC_WHERE, 'EXISTS (SELECT 1 FROM edition_pages p WHERE p.edition_id=e.id AND p.is_visible=1)']; const p = [];
  if (q.date) { w.push('e.edition_date=?'); p.push(q.date); }
  if (q.date_from) { w.push('e.edition_date>=?'); p.push(q.date_from); }
  if (q.date_to) { w.push('e.edition_date<=?'); p.push(q.date_to); }
  if (q.category) { w.push('(c.slug=? OR c.id=?)'); p.push(q.category, Number(q.category) || 0); }
  if (q.region) { w.push('(r.slug=? OR e.region_id=?)'); p.push(q.region, Number(q.region) || 0); }
  if (q.q) { w.push('e.title LIKE ?'); p.push(`%${q.q}%`); }
  if (q.state || q.district || q.city) {
    const sub = ['am.status=\'active\''];
    if (q.state) { sub.push('am.state_id=?'); p.push(q.state); }
    if (q.district) { sub.push('am.district_id=?'); p.push(q.district); }
    if (q.city) { sub.push('am.city_id=?'); p.push(q.city); }
    w.push(`EXISTS (SELECT 1 FROM area_mappings am WHERE ${sub.join(' AND ')} AND (am.edition_id=e.id OR am.category_id=e.category_id OR (am.region_id IS NOT NULL AND am.region_id=e.region_id)))`);
  }
  return { where: w.join(' AND '), params: p };
}

const publicList = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query, 12, 60);
  const key = `public:editions:${JSON.stringify(req.query)}`;
  const data = await cache.remember(key, 60, async () => {
    const { where, params } = publicFilters(req.query);
    const [{ total }] = await query(`SELECT COUNT(*) total FROM editions e JOIN edition_categories c ON c.id=e.category_id AND c.status='active' AND c.deleted_at IS NULL LEFT JOIN regions r ON r.id=e.region_id WHERE ${where}`, params);
    const rows = await query(`${publicSelect} WHERE ${where} ORDER BY e.edition_date DESC, c.sort_order, e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { rows: rows.map(pub), meta: pageMeta(page, limit, total) };
  });
  ok(res, data.rows, 'OK', 200, data.meta);
});

const publicLatest = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  const limit = Math.min(30, Number(req.query.limit) || s.latest_editions_count || 8);
  const rows = await cache.remember(`public:latest:${limit}:${req.query.category || ''}`, 60, async () => {
    const { where, params } = publicFilters({ category: req.query.category });
    return (await query(`${publicSelect} WHERE ${where} ORDER BY e.edition_date DESC, e.published_at DESC LIMIT ?`, [...params, limit])).map(pub);
  });
  ok(res, rows);
});

/** Dates with published editions (for the date picker). */
const publicDates = asyncHandler(async (req, res) => {
  const rows = await cache.remember(`public:dates:${req.query.category || ''}`, 120, async () => {
    const { where, params } = publicFilters({ category: req.query.category });
    return (await query(`SELECT DISTINCT e.edition_date d FROM editions e JOIN edition_categories c ON c.id=e.category_id AND c.status='active' AND c.deleted_at IS NULL LEFT JOIN regions r ON r.id=e.region_id WHERE ${where} ORDER BY d DESC LIMIT 400`, params)).map((r) => r.d);
  });
  ok(res, rows);
});

/** Find the edition to open by default (or for a given date/category). */
const publicResolve = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  const category = req.query.category || (s.default_category_id ? String(s.default_category_id) : '');
  const tryFind = async (q) => {
    const { where, params } = publicFilters(q);
    return one(`${publicSelect} WHERE ${where} ORDER BY e.edition_date DESC, c.is_main DESC, c.sort_order LIMIT 1`, params);
  };
  let date = req.query.date;
  if (!date && s.default_date_mode === 'today') date = todayISO(s.timezone);
  let ed = await tryFind({ category, date });
  if (!ed && date && !req.query.date) ed = await tryFind({ category }); // fall back to latest
  if (!ed && !req.query.category) ed = await tryFind({ date: req.query.date });
  if (!ed) throw ApiError.notFound(req.query.date ? 'No edition is available for the selected date.' : 'No editions have been published yet.');
  ok(res, pub(ed));
});

const publicGet = asyncHandler(async (req, res) => {
  const data = await cache.remember(`public:edition:${req.params.slug}`, 60, async () => {
    const ed = await one(`${publicSelect} WHERE ${PUBLIC_WHERE} AND e.slug=?`, [req.params.slug]);
    if (!ed) return null;
    const pages = await pagesWithImages(ed.id, { onlyVisible: true, withAreas: true });
    const prev = await one(`SELECT e.slug, e.edition_date, e.title FROM editions e WHERE ${PUBLIC_WHERE} AND e.category_id=? AND e.edition_date<? ORDER BY e.edition_date DESC LIMIT 1`, [ed.category_id, ed.edition_date]);
    const next = await one(`SELECT e.slug, e.edition_date, e.title FROM editions e WHERE ${PUBLIC_WHERE} AND e.category_id=? AND e.edition_date>? ORDER BY e.edition_date ASC LIMIT 1`, [ed.category_id, ed.edition_date]);
    const sameDay = await query(`SELECT e.slug, e.title, c.name AS category_name FROM editions e JOIN edition_categories c ON c.id=e.category_id WHERE ${PUBLIC_WHERE} AND e.edition_date=? AND e.id<>? ORDER BY c.sort_order`, [ed.edition_date, ed.id]);
    const seo = await one("SELECT meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, robots FROM seo_settings WHERE entity_type='edition' AND entity_id=?", [ed.id]);
    return { ...pub(ed), pages: pages.map((p) => ({ ...p, original_name: undefined })), prev, next, same_day: sameDay, seo };
  });
  if (!data) throw ApiError.notFound('Edition not found or not published');
  query('UPDATE editions SET view_count=view_count+1 WHERE id=?', [data.id]).catch(() => {});
  ok(res, data);
});

const pageView = asyncHandler(async (req, res) => {
  await query('UPDATE edition_pages SET view_count=view_count+1 WHERE id=?', [req.params.pageId]);
  ok(res, null);
});

module.exports = { list, get, create, update, remove, duplicate, action, bulk, publicList, publicLatest, publicDates, publicResolve, publicGet, pageView, PUBLIC_WHERE, uniqueSlug };
