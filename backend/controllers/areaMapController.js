/** Article area mapping on newspaper pages (admin). */
const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler } = require('../utils/http');
const { cleanText } = require('../utils/helpers');
const cache = require('../services/cache');
const { audit } = require('../services/audit');

const num = (v) => Math.min(1, Math.max(0, Number(v)));
const ser = (a) => ({ ...a, x: Number(a.x), y: Number(a.y), w: Number(a.w), h: Number(a.h) });

function readBody(b) {
  const x = num(b.x); const y = num(b.y);
  const w = Math.min(num(b.w), 1 - x); const h = Math.min(num(b.h), 1 - y);
  if (![x, y, w, h].every(Number.isFinite) || w < 0.01 || h < 0.005) throw ApiError.badRequest('Draw a larger area');
  const link = b.link_url ? String(b.link_url).trim().slice(0, 500) : null;
  if (link && !/^(https?:\/\/|\/)/i.test(link)) throw ApiError.badRequest('Link must start with http://, https:// or /');
  return {
    x, y, w, h,
    title: b.title ? cleanText(b.title).slice(0, 255) : null,
    description: b.description ? cleanText(b.description).slice(0, 5000) : null,
    link_url: link,
    sort_order: Number(b.sort_order) || 0,
  };
}

const list = asyncHandler(async (req, res) => {
  const ed = await one('SELECT id FROM editions WHERE id=? AND deleted_at IS NULL', [req.params.editionId]);
  if (!ed) throw ApiError.notFound('Edition not found');
  const rows = await query('SELECT * FROM page_areas WHERE edition_id=? ORDER BY page_id, sort_order, y, x', [ed.id]);
  ok(res, rows.map(ser));
});

const create = asyncHandler(async (req, res) => {
  const page = await one('SELECT id, edition_id FROM edition_pages WHERE id=?', [req.body.page_id]);
  if (!page) throw ApiError.notFound('Page not found');
  const v = readBody(req.body);
  const r = await query('INSERT INTO page_areas SET ?', [{ ...v, page_id: page.id, edition_id: page.edition_id, created_by: req.user.id }]);
  await audit(req, 'area_map.created', 'page', page.id, { area_id: r.insertId, title: v.title });
  cache.invalidate('public:');
  created(res, ser(await one('SELECT * FROM page_areas WHERE id=?', [r.insertId])), 'Area added');
});

const update = asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM page_areas WHERE id=?', [req.params.id]);
  if (!a) throw ApiError.notFound('Area not found');
  const v = readBody({ ...ser(a), ...req.body });
  await query('UPDATE page_areas SET ? WHERE id=?', [v, a.id]);
  await audit(req, 'area_map.updated', 'page', a.page_id, { area_id: a.id });
  cache.invalidate('public:');
  ok(res, ser(await one('SELECT * FROM page_areas WHERE id=?', [a.id])), 'Area saved');
});

const remove = asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM page_areas WHERE id=?', [req.params.id]);
  if (!a) throw ApiError.notFound('Area not found');
  await query('DELETE FROM page_areas WHERE id=?', [a.id]);
  await audit(req, 'area_map.deleted', 'page', a.page_id, { area_id: a.id });
  cache.invalidate('public:');
  ok(res, null, 'Area deleted');
});

/** Copy the areas of one page to another page (e.g. repeated layout). */
const copyPage = asyncHandler(async (req, res) => {
  const from = await one('SELECT id, edition_id FROM edition_pages WHERE id=?', [req.body.from_page_id]);
  const to = await one('SELECT id, edition_id FROM edition_pages WHERE id=?', [req.body.to_page_id]);
  if (!from || !to) throw ApiError.notFound('Page not found');
  const rows = await query('SELECT * FROM page_areas WHERE page_id=?', [from.id]);
  for (const a of rows) {
    await query('INSERT INTO page_areas (edition_id, page_id, x, y, w, h, title, description, link_url, sort_order, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [to.edition_id, to.id, a.x, a.y, a.w, a.h, a.title, a.description, a.link_url, a.sort_order, req.user.id]);
  }
  cache.invalidate('public:');
  ok(res, { copied: rows.length }, `${rows.length} area(s) copied`);
});

module.exports = { list, create, update, remove, copyPage };
