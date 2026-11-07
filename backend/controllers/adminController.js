/** Dashboard, admin users, readers, roles & permissions, audit logs. */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { query, one, transaction } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { cleanText, fileUrl, slugify } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { MODULES } = require('../config/permissions');

/* ---------------- Dashboard ---------------- */
const dashboard = asyncHandler(async (req, res) => {
  const [ed] = await query(`SELECT COUNT(*) total, SUM(status='published') published, SUM(status='draft') draft, SUM(status='scheduled') scheduled,
    SUM(status='unpublished') unpublished, SUM(status='archived') archived, COALESCE(SUM(view_count),0) views FROM editions WHERE deleted_at IS NULL`);
  const [pages] = await query('SELECT COUNT(*) n FROM edition_pages p JOIN editions e ON e.id=p.edition_id AND e.deleted_at IS NULL');
  const [subs] = await query("SELECT COUNT(*) total, SUM(status='active') active FROM subscribers WHERE deleted_at IS NULL");
  const [users] = await query('SELECT COUNT(*) total, SUM(role_id IS NULL) readers, SUM(role_id IS NOT NULL) admins FROM users WHERE deleted_at IS NULL');
  const [cm] = await query("SELECT COUNT(*) total, SUM(status='pending') pending FROM comments WHERE deleted_at IS NULL");
  const [clips] = await query('SELECT COUNT(*) n FROM shared_clippings');
  const [pushSubs] = await query("SELECT COUNT(*) n FROM notification_subscriptions WHERE status='active'");
  const [msgs] = await query('SELECT COUNT(*) n FROM contact_messages WHERE is_read=0');
  const latest = await query(`SELECT e.id, e.title, e.slug, e.edition_date, e.status, e.published_at, e.view_count, c.name AS category_name,
    (SELECT COUNT(*) FROM edition_pages p WHERE p.edition_id=e.id) AS page_count FROM editions e JOIN edition_categories c ON c.id=e.category_id
    WHERE e.deleted_at IS NULL AND e.status='published' ORDER BY e.published_at DESC LIMIT 6`);
  const upcoming = await query(`SELECT s.id, s.publish_at, e.id AS edition_id, e.title FROM edition_schedules s JOIN editions e ON e.id=s.edition_id AND e.deleted_at IS NULL
    WHERE s.status='pending' ORDER BY s.publish_at LIMIT 5`);
  const activity = await query(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    ORDER BY a.id DESC LIMIT 10`);
  const trend = await query(`SELECT DATE(published_at) d, COUNT(*) n FROM editions WHERE deleted_at IS NULL AND published_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY DATE(published_at) ORDER BY d`);
  const subTrend = await query(`SELECT DATE(subscribed_at) d, COUNT(*) n FROM subscribers WHERE deleted_at IS NULL AND subscribed_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY DATE(subscribed_at) ORDER BY d`);
  const n = (v) => Number(v || 0);
  ok(res, {
    stats: {
      total_editions: n(ed.total), published_editions: n(ed.published), draft_editions: n(ed.draft), scheduled_editions: n(ed.scheduled),
      unpublished_editions: n(ed.unpublished), archived_editions: n(ed.archived), total_views: n(ed.views), total_pages: n(pages.n),
      total_subscribers: n(subs.total), active_subscribers: n(subs.active), total_users: n(users.total), readers: n(users.readers), admins: n(users.admins),
      total_comments: n(cm.total), pending_comments: n(cm.pending), clippings: n(clips.n), push_subscribers: n(pushSubs.n), unread_messages: n(msgs.n),
    },
    latest, upcoming, activity, trend, subscriber_trend: subTrend,
  });
});

/** Small payload for the top-bar notification bell. */
const alerts = asyncHandler(async (req, res) => {
  const [cm] = await query("SELECT COUNT(*) n FROM comments WHERE status='pending' AND deleted_at IS NULL");
  const [unsub] = await query('SELECT COUNT(*) n FROM subscribers WHERE unsubscribe_requested=1 AND deleted_at IS NULL');
  const [msgs] = await query('SELECT COUNT(*) n FROM contact_messages WHERE is_read=0');
  const [failed] = await query("SELECT COUNT(*) n FROM edition_schedules WHERE status='failed' AND executed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const items = [];
  if (cm.n) items.push({ type: 'comments', count: cm.n, text: `${cm.n} comment(s) awaiting moderation`, link: '/admin/comments?status=pending' });
  if (unsub.n) items.push({ type: 'unsubscribe', count: unsub.n, text: `${unsub.n} unsubscribe request(s)`, link: '/admin/subscribers?requested=1' });
  if (msgs.n) items.push({ type: 'messages', count: msgs.n, text: `${msgs.n} unread contact message(s)`, link: '/admin/messages' });
  if (failed.n) items.push({ type: 'schedules', count: failed.n, text: `${failed.n} scheduled publication(s) failed`, link: '/admin/schedules?tab=cancelled' });
  ok(res, { total: items.reduce((a, b) => a + b.count, 0), items });
});

/* ---------------- Users ---------------- */
const userSelect = `SELECT u.id, u.name, u.email, u.phone, u.avatar, u.status, u.role_id, u.can_comment, u.last_login_at, u.created_at, u.google_id IS NOT NULL AS google_linked,
  r.name AS role_name, r.slug AS role_slug FROM users u LEFT JOIN roles r ON r.id=u.role_id`;

const usersList = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const w = ['u.deleted_at IS NULL']; const p = [];
  if (req.query.type === 'admins') w.push('u.role_id IS NOT NULL');
  if (req.query.type === 'readers') w.push('u.role_id IS NULL');
  if (req.query.role_id) { w.push('u.role_id=?'); p.push(req.query.role_id); }
  if (req.query.status) { w.push('u.status=?'); p.push(req.query.status); }
  if (req.query.q) { w.push('(u.name LIKE ? OR u.email LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const [{ total }] = await query(`SELECT COUNT(*) total FROM users u WHERE ${w.join(' AND ')}`, p);
  const rows = await query(`${userSelect} WHERE ${w.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  ok(res, rows.map((r) => ({ ...r, google_linked: !!r.google_linked, can_comment: !!r.can_comment })), 'OK', 200, pageMeta(page, limit, total));
});

async function guardSuper(req, targetRoleId, targetUser) {
  const sa = await one("SELECT id FROM roles WHERE slug='super-admin'");
  const touchingSuper = Number(targetRoleId) === sa.id || (targetUser && targetUser.role_id === sa.id);
  if (touchingSuper && !req.user.is_super) throw ApiError.forbidden('Only a Super Admin can manage Super Admin accounts');
  return sa.id;
}

const userSave = (isNew) => asyncHandler(async (req, res) => {
  const b = req.body;
  let cur = null;
  if (!isNew) { cur = await one('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [req.params.id]); if (!cur) throw ApiError.notFound('User not found'); }
  const saId = await guardSuper(req, b.role_id, cur);
  if (b.role_id && !(await one('SELECT id FROM roles WHERE id=?', [b.role_id]))) throw ApiError.badRequest('Role not found');
  if (await one('SELECT id FROM users WHERE email=? AND id<>?', [b.email, cur?.id || 0])) throw ApiError.conflict('Email already in use');
  if (cur && cur.id === req.user.id && (b.status !== 'active' || Number(b.role_id) !== cur.role_id)) throw ApiError.badRequest('You cannot change your own role or status');
  if (cur && cur.role_id === saId && Number(b.role_id) !== saId) {
    const [{ n }] = await query('SELECT COUNT(*) n FROM users WHERE role_id=? AND deleted_at IS NULL AND status="active"', [saId]);
    if (n <= 1) throw ApiError.badRequest('At least one active Super Admin is required');
  }
  const vals = { name: cleanText(b.name), email: b.email, phone: b.phone, role_id: b.role_id, status: b.status, can_comment: b.can_comment ? 1 : 0 };
  if (b.password) vals.password_hash = await bcrypt.hash(b.password, config.bcryptRounds);
  else if (isNew) throw ApiError.badRequest('Password is required for new users', { password: 'Password is required' });
  let id = cur?.id;
  if (isNew) id = (await query('INSERT INTO users SET ?', [vals])).insertId;
  else {
    if (b.password || b.status !== cur.status || vals.role_id !== cur.role_id) vals.token_version = cur.token_version + 1; // force re-login
    await query('UPDATE users SET ? WHERE id=?', [vals, id]);
  }
  await audit(req, isNew ? 'user.created' : 'user.updated', 'user', id, { email: b.email, role_id: b.role_id, status: b.status });
  (isNew ? created : ok)(res, await one(`${userSelect} WHERE u.id=?`, [id]), isNew ? 'User created' : 'User updated');
});

const userStatus = asyncHandler(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!u) throw ApiError.notFound();
  if (u.id === req.user.id) throw ApiError.badRequest('You cannot change your own status');
  await guardSuper(req, null, u);
  const st = ['active', 'blocked', 'inactive'].includes(req.body.status) ? req.body.status : 'active';
  await query('UPDATE users SET status=?, token_version=token_version+1 WHERE id=?', [st, u.id]);
  await audit(req, `user.${st}`, 'user', u.id);
  ok(res, await one(`${userSelect} WHERE u.id=?`, [u.id]), `User ${st}`);
});

const userRemove = asyncHandler(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [req.params.id]);
  if (!u) throw ApiError.notFound();
  if (u.id === req.user.id) throw ApiError.badRequest('You cannot delete your own account');
  await guardSuper(req, null, u);
  await query("UPDATE users SET deleted_at=NOW(), status='inactive', email=CONCAT('deleted-',id,'-',email), google_id=NULL, token_version=token_version+1 WHERE id=?", [u.id]);
  await audit(req, 'user.deleted', 'user', u.id, { email: u.email });
  ok(res, null, 'User deleted');
});

/* ---------------- Roles ---------------- */
const permissionsCatalog = asyncHandler(async (req, res) => {
  ok(res, { modules: MODULES, list: await query('SELECT id, module, action, slug, description FROM permissions ORDER BY module, id') });
});

const rolesList = asyncHandler(async (req, res) => {
  const roles = await query('SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id AND u.deleted_at IS NULL) AS user_count FROM roles r ORDER BY r.id');
  const rp = await query('SELECT rp.role_id, p.slug FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id');
  ok(res, roles.map((r) => ({ ...r, is_system: !!r.is_system, permissions: rp.filter((x) => x.role_id === r.id).map((x) => x.slug) })));
});

const roleSave = (isNew) => asyncHandler(async (req, res) => {
  const b = req.body;
  let cur = null;
  if (!isNew) { cur = await one('SELECT * FROM roles WHERE id=?', [req.params.id]); if (!cur) throw ApiError.notFound('Role not found'); }
  if (cur?.slug === 'super-admin') throw ApiError.badRequest('The Super Admin role always has every permission and cannot be edited');
  const perms = b.permissions.length ? await query('SELECT id FROM permissions WHERE slug IN (?)', [b.permissions]) : [];
  const id = await transaction(async (conn) => {
    let rid = cur?.id;
    if (isNew) {
      let slug = slugify(b.name); if ((await conn.query('SELECT id FROM roles WHERE slug=?', [slug]))[0].length) slug += '-' + Date.now().toString(36);
      rid = (await conn.query('INSERT INTO roles (name, slug, description) VALUES (?,?,?)', [cleanText(b.name), slug, b.description]))[0].insertId;
    } else await conn.query('UPDATE roles SET name=?, description=? WHERE id=?', [cleanText(b.name), b.description, rid]);
    await conn.query('DELETE FROM role_permissions WHERE role_id=?', [rid]);
    for (const p of perms) await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)', [rid, p.id]);
    return rid;
  });
  await audit(req, isNew ? 'role.created' : 'role.updated', 'role', id, { name: b.name, permissions: b.permissions.length });
  (isNew ? created : ok)(res, await one('SELECT * FROM roles WHERE id=?', [id]), isNew ? 'Role created' : 'Role updated');
});

const roleRemove = asyncHandler(async (req, res) => {
  const r = await one('SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id AND u.deleted_at IS NULL) n FROM roles r WHERE r.id=?', [req.params.id]);
  if (!r) throw ApiError.notFound();
  if (r.slug === 'super-admin') throw ApiError.badRequest('The Super Admin role cannot be deleted');
  if (r.n) throw ApiError.conflict(`${r.n} user(s) have this role. Reassign them first.`);
  await query('DELETE FROM roles WHERE id=?', [r.id]);
  await audit(req, 'role.deleted', 'role', r.id, { name: r.name });
  ok(res, null, 'Role deleted');
});

/* ---------------- Audit logs ---------------- */
const auditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query, 30);
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push('(a.action LIKE ? OR a.entity_type LIKE ? OR u.name LIKE ? OR a.ip_address LIKE ?)'); p.push(...Array(4).fill(`%${req.query.q}%`)); }
  if (req.query.user_id) { w.push('a.user_id=?'); p.push(req.query.user_id); }
  if (req.query.entity_type) { w.push('a.entity_type=?'); p.push(req.query.entity_type); }
  if (req.query.date_from) { w.push('DATE(a.created_at)>=?'); p.push(req.query.date_from); }
  if (req.query.date_to) { w.push('DATE(a.created_at)<=?'); p.push(req.query.date_to); }
  const [{ total }] = await query(`SELECT COUNT(*) total FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${w.join(' AND ')}`, p);
  const rows = await query(`SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE ${w.join(' AND ')} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  const types = await query('SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type');
  ok(res, rows.map((r) => ({ ...r, details: typeof r.details === 'string' ? safeJson(r.details) : r.details })), 'OK', 200, { ...pageMeta(page, limit, total), entity_types: types.map((t) => t.entity_type) });
});
const safeJson = (s) => { try { return JSON.parse(s); } catch { return s; } };

module.exports = { dashboard, alerts, usersList, userCreate: userSave(true), userUpdate: userSave(false), userStatus, userRemove, permissionsCatalog, rolesList, roleCreate: roleSave(true), roleUpdate: roleSave(false), roleRemove, auditLogs, fileUrl };
