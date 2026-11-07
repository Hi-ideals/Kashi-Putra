const { query, one, transaction } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { audit } = require('../services/audit');
const cache = require('../services/cache');
const { runDueSchedules } = require('../jobs/scheduler');

const select = `SELECT s.*, e.title AS edition_title, e.slug AS edition_slug, e.edition_date, e.status AS edition_status, c.name AS category_name, u.name AS created_by_name,
  (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id AND p.is_visible=1) AS page_count
  FROM edition_schedules s JOIN editions e ON e.id=s.edition_id JOIN edition_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=s.created_by`;

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const w = ['e.deleted_at IS NULL']; const p = [];
  const tab = req.query.tab || 'upcoming';
  if (tab === 'upcoming') w.push("s.status='pending'");
  else if (tab === 'completed') w.push("s.status='completed'");
  else if (tab === 'cancelled') w.push("s.status IN ('cancelled','failed')");
  if (req.query.q) { w.push('e.title LIKE ?'); p.push(`%${req.query.q}%`); }
  if (req.query.date_from) { w.push('DATE(s.publish_at)>=?'); p.push(req.query.date_from); }
  if (req.query.date_to) { w.push('DATE(s.publish_at)<=?'); p.push(req.query.date_to); }
  const where = w.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM edition_schedules s JOIN editions e ON e.id=s.edition_id WHERE ${where}`, p);
  const rows = await query(`${select} WHERE ${where} ORDER BY s.publish_at ${tab === 'upcoming' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`, [...p, limit, offset]);
  ok(res, rows, 'OK', 200, pageMeta(page, limit, total));
});

async function assertSchedulable(editionId) {
  const ed = await one('SELECT id, status FROM editions WHERE id=? AND deleted_at IS NULL', [editionId]);
  if (!ed) throw ApiError.notFound('Edition not found');
  if (ed.status === 'published') throw ApiError.badRequest('This edition is already published. Unpublish it first to schedule.');
  return ed;
}

const create = asyncHandler(async (req, res) => {
  const b = req.body;
  await assertSchedulable(b.edition_id);
  const at = new Date(b.publish_at);
  if (at <= new Date()) throw ApiError.badRequest('Publication time must be in the future', { publish_at: 'Must be in the future' });
  const id = await transaction(async (conn) => {
    await conn.query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending'", [b.edition_id]);
    const [r] = await conn.query('INSERT INTO edition_schedules (edition_id, publish_at, notify_on_publish, notes, created_by) VALUES (?,?,?,?,?)',
      [b.edition_id, at, b.notify_on_publish ? 1 : 0, b.notes, req.user.id]);
    await conn.query("UPDATE editions SET status='scheduled', publish_at=?, updated_by=? WHERE id=?", [at, req.user.id, b.edition_id]);
    return r.insertId;
  });
  await audit(req, 'schedule.created', 'edition', b.edition_id, { publish_at: at });
  cache.invalidate('public:');
  created(res, await one(`${select} WHERE s.id=?`, [id]), 'Edition scheduled');
});

/** Reschedule (edit) a pending schedule. */
const update = asyncHandler(async (req, res) => {
  const s = await one('SELECT * FROM edition_schedules WHERE id=?', [req.params.id]);
  if (!s) throw ApiError.notFound('Schedule not found');
  if (!['pending', 'failed', 'cancelled'].includes(s.status)) throw ApiError.badRequest('Completed schedules cannot be changed');
  const at = new Date(req.body.publish_at);
  if (Number.isNaN(at.getTime()) || at <= new Date()) throw ApiError.badRequest('Publication time must be in the future');
  await assertSchedulable(s.edition_id);
  await transaction(async (conn) => {
    await conn.query("UPDATE edition_schedules SET status='cancelled' WHERE edition_id=? AND status='pending' AND id<>?", [s.edition_id, s.id]);
    await conn.query("UPDATE edition_schedules SET publish_at=?, status='pending', notify_on_publish=?, notes=?, error_message=NULL, executed_at=NULL WHERE id=?",
      [at, req.body.notify_on_publish === false ? 0 : 1, req.body.notes ?? s.notes, s.id]);
    await conn.query("UPDATE editions SET status='scheduled', publish_at=? WHERE id=?", [at, s.edition_id]);
  });
  await audit(req, 'schedule.rescheduled', 'edition', s.edition_id, { publish_at: at });
  ok(res, await one(`${select} WHERE s.id=?`, [s.id]), 'Schedule updated');
});

const cancel = asyncHandler(async (req, res) => {
  const s = await one('SELECT * FROM edition_schedules WHERE id=?', [req.params.id]);
  if (!s) throw ApiError.notFound('Schedule not found');
  if (s.status !== 'pending') throw ApiError.badRequest('Only pending schedules can be cancelled');
  await query("UPDATE edition_schedules SET status='cancelled' WHERE id=?", [s.id]);
  await query("UPDATE editions SET status='draft', publish_at=NULL WHERE id=? AND status='scheduled'", [s.edition_id]);
  await audit(req, 'schedule.cancelled', 'edition', s.edition_id);
  cache.invalidate('public:');
  ok(res, await one(`${select} WHERE s.id=?`, [s.id]), 'Schedule cancelled; edition moved to drafts');
});

const remove = asyncHandler(async (req, res) => {
  const s = await one('SELECT * FROM edition_schedules WHERE id=?', [req.params.id]);
  if (!s) throw ApiError.notFound('Schedule not found');
  if (s.status === 'pending') await query("UPDATE editions SET status='draft', publish_at=NULL WHERE id=? AND status='scheduled'", [s.edition_id]);
  await query('DELETE FROM edition_schedules WHERE id=?', [s.id]);
  await audit(req, 'schedule.deleted', 'edition', s.edition_id);
  ok(res, null, 'Schedule removed');
});

/** Trigger the scheduler now (useful for testing). */
const runNow = asyncHandler(async (req, res) => {
  await runDueSchedules();
  ok(res, null, 'Scheduler run completed');
});

module.exports = { list, create, update, cancel, remove, runNow };
