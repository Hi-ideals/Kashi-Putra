const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { cleanText, clientIp } = require('../utils/helpers');
const settings = require('../services/settings');
const { audit } = require('../services/audit');
const { PUBLIC_WHERE } = require('./editionsController');

const select = `SELECT cm.id, cm.edition_id, cm.page_id, cm.user_id, cm.body, cm.status, cm.ip_address, cm.created_at, cm.moderated_at,
  u.name AS user_name, u.email AS user_email, u.status AS user_status, u.can_comment, e.title AS edition_title, e.slug AS edition_slug, p.page_number, cm.area_id, pa.title AS area_title
  FROM comments cm JOIN users u ON u.id=cm.user_id JOIN editions e ON e.id=cm.edition_id LEFT JOIN edition_pages p ON p.id=cm.page_id LEFT JOIN page_areas pa ON pa.id=cm.area_id`;

/* Public */
const publicList = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query, 20, 50);
  const w = ["cm.status='approved'", 'cm.deleted_at IS NULL']; const p = [];
  if (req.query.area_id) { w.push('cm.area_id=?'); p.push(req.query.area_id); }
  else if (req.query.page_id) { w.push('cm.page_id=?'); p.push(req.query.page_id); }
  else if (req.query.edition_id) { w.push('cm.edition_id=?'); p.push(req.query.edition_id); }
  else throw ApiError.badRequest('edition_id or page_id is required');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM comments cm WHERE ${w.join(' AND ')}`, p);
  const rows = await query(`SELECT cm.id, cm.body, cm.created_at, cm.page_id, u.name AS user_name, u.avatar FROM comments cm JOIN users u ON u.id=cm.user_id
    WHERE ${w.join(' AND ')} ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  // the current user's own pending comments
  let mine = [];
  if (req.user) {
    mine = await query(`SELECT cm.id, cm.body, cm.created_at, cm.page_id, cm.status FROM comments cm WHERE cm.user_id=? AND cm.status='pending' AND cm.deleted_at IS NULL AND ${req.query.area_id ? 'cm.area_id=?' : req.query.page_id ? 'cm.page_id=?' : 'cm.edition_id=?'}`,
      [req.user.id, req.query.area_id || req.query.page_id || req.query.edition_id]);
  }
  ok(res, { comments: rows, pending_mine: mine }, 'OK', 200, pageMeta(page, limit, total));
});

const create = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.comments_enabled) throw ApiError.forbidden('Comments are disabled.');
  if (!req.user.can_comment) throw ApiError.forbidden('You are not allowed to post comments.');
  const ed = await one(`SELECT e.id, e.comments_enabled FROM editions e WHERE e.id=? AND ${PUBLIC_WHERE}`, [req.body.edition_id]);
  if (!ed) throw ApiError.notFound('Edition not found');
  if (!ed.comments_enabled) throw ApiError.forbidden('Comments are disabled for this edition.');
  if (req.body.page_id && !(await one('SELECT id FROM edition_pages WHERE id=? AND edition_id=?', [req.body.page_id, ed.id]))) throw ApiError.badRequest('Invalid page');
  // Comment on a mapped article (area of a page)
  let areaId = null;
  if (req.body.area_id) {
    const area = await one('SELECT id, page_id FROM page_areas WHERE id=? AND edition_id=?', [req.body.area_id, ed.id]);
    if (!area) throw ApiError.badRequest('Invalid article');
    areaId = area.id;
    req.body.page_id = area.page_id;
  }
  const body = cleanText(req.body.body);
  const max = s.comment_max_length || 200;
  if (body.length < 2) throw ApiError.badRequest('Comment is too short');
  if (body.length > max) throw ApiError.badRequest(`Comments can be at most ${max} characters`);
  // Rate limit per user
  const recent = await one('SELECT COUNT(*) n FROM comments WHERE user_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [req.user.id]);
  if (recent.n >= (s.comment_rate_per_hour || 10)) throw new ApiError(429, 'You are commenting too quickly. Please try again later.');
  const dup = await one('SELECT id FROM comments WHERE user_id=? AND body=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)', [req.user.id, body]);
  if (dup) throw ApiError.conflict('You have already posted this comment.');
  // Spam detection
  let status = s.comments_require_approval ? 'pending' : 'approved';
  const blocked = String(s.comment_blocked_words || '').split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (blocked.some((w) => body.toLowerCase().includes(w))) status = 'spam';
  if (s.comment_auto_spam_links && /(https?:\/\/|www\.)/i.test(body)) status = 'spam';
  const r = await query('INSERT INTO comments (edition_id, page_id, area_id, user_id, body, status, ip_address, user_agent) VALUES (?,?,?,?,?,?,?,?)',
    [ed.id, req.body.page_id || null, areaId, req.user.id, body, status, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 255)]);
  await audit(req, 'comment.created', 'comment', r.insertId, { status });
  created(res, { id: r.insertId, status, body, created_at: new Date() },
    status === 'approved' ? 'Comment posted' : 'Thank you! Your comment will appear after moderation.');
});

/* Admin */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const w = ['cm.deleted_at IS NULL']; const p = [];
  if (req.query.status) { w.push('cm.status=?'); p.push(req.query.status); }
  if (req.query.edition_id) { w.push('cm.edition_id=?'); p.push(req.query.edition_id); }
  if (req.query.q) { w.push('(cm.body LIKE ? OR u.name LIKE ? OR u.email LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const where = w.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM comments cm JOIN users u ON u.id=cm.user_id WHERE ${where}`, p);
  const rows = await query(`${select} WHERE ${where} ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  const counts = await query("SELECT status, COUNT(*) n FROM comments WHERE deleted_at IS NULL GROUP BY status");
  ok(res, rows, 'OK', 200, { ...pageMeta(page, limit, total), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

const moderate = asyncHandler(async (req, res) => {
  const ids = (req.body.ids || [req.params.id]).map(Number).filter(Boolean);
  const status = req.body.status;
  if (!['approved', 'rejected', 'spam', 'pending'].includes(status)) throw ApiError.badRequest('Invalid status');
  if (!ids.length) throw ApiError.badRequest('No comments selected');
  await query('UPDATE comments SET status=?, moderated_by=?, moderated_at=NOW() WHERE id IN (?)', [status, req.user.id, ids]);
  await audit(req, `comment.${status}`, 'comment', ids.join(','));
  ok(res, null, `${ids.length} comment(s) marked as ${status}`);
});

const remove = asyncHandler(async (req, res) => {
  const ids = (req.body?.ids || [req.params.id]).map(Number).filter(Boolean);
  await query('UPDATE comments SET deleted_at=NOW() WHERE id IN (?)', [ids]);
  await audit(req, 'comment.deleted', 'comment', ids.join(','));
  ok(res, null, `${ids.length} comment(s) deleted`);
});

/** Block / unblock a user from commenting (and optionally mark all their comments as spam). */
const blockUser = asyncHandler(async (req, res) => {
  const u = await one('SELECT id, role_id FROM users WHERE id=?', [req.params.userId]);
  if (!u) throw ApiError.notFound('User not found');
  if (u.role_id) throw ApiError.badRequest('Admin users cannot be blocked from here');
  const block = req.body.block !== false;
  await query('UPDATE users SET can_comment=? WHERE id=?', [block ? 0 : 1, u.id]);
  if (block && req.body.mark_spam) await query("UPDATE comments SET status='spam', moderated_by=?, moderated_at=NOW() WHERE user_id=? AND status<>'approved'", [req.user.id, u.id]);
  await audit(req, block ? 'comment.user_blocked' : 'comment.user_unblocked', 'user', u.id);
  ok(res, null, block ? 'User blocked from commenting' : 'User can comment again');
});

const blockedUsers = asyncHandler(async (req, res) => {
  ok(res, await query('SELECT id, name, email, updated_at FROM users WHERE can_comment=0 AND deleted_at IS NULL ORDER BY updated_at DESC'));
});

/** Toggle comments for a single edition. */
const toggleEdition = asyncHandler(async (req, res) => {
  await query('UPDATE editions SET comments_enabled=? WHERE id=?', [req.body.enabled ? 1 : 0, req.params.editionId]);
  await audit(req, 'comment.edition_toggle', 'edition', req.params.editionId, { enabled: !!req.body.enabled });
  require('../services/cache').invalidate('public:');
  ok(res, null, `Comments ${req.body.enabled ? 'enabled' : 'disabled'} for this edition`);
});

module.exports = { publicList, create, list, moderate, remove, blockUser, blockedUsers, toggleEdition };
