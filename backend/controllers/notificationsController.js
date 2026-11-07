const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { sha256, cleanText, fileUrl } = require('../utils/helpers');
const push = require('../services/push');
const settings = require('../services/settings');
const images = require('../services/images');
const { audit } = require('../services/audit');
const { cleanupFiles } = require('../middleware/upload');

/* Public: register / remove a browser push subscription */
const subscribe = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.push_enabled) throw ApiError.forbidden('Notifications are disabled');
  const { endpoint, keys } = req.body;
  await query(`INSERT INTO notification_subscriptions (endpoint_hash, endpoint, p256dh, auth, user_id, user_agent) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth), user_id=COALESCE(VALUES(user_id), user_id), status='active'`,
  [sha256(endpoint), endpoint, keys.p256dh, keys.auth, req.user?.id || null, String(req.headers['user-agent'] || '').slice(0, 255)]);
  ok(res, null, 'Notifications enabled');
});

const unsubscribe = asyncHandler(async (req, res) => {
  if (req.body.endpoint) await query("UPDATE notification_subscriptions SET status='expired' WHERE endpoint_hash=?", [sha256(req.body.endpoint)]);
  ok(res, null, 'Notifications disabled');
});

const vapidKey = asyncHandler(async (req, res) => ok(res, { publicKey: await push.ensureVapid() }));

/* Admin */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const [{ total }] = await query('SELECT COUNT(*) total FROM push_notifications');
  const rows = await query(`SELECT n.*, u.name AS created_by_name, e.title AS edition_title FROM push_notifications n LEFT JOIN users u ON u.id=n.created_by
    LEFT JOIN editions e ON e.id=n.edition_id ORDER BY n.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
  const [subs] = await query("SELECT SUM(status='active') active, SUM(status='active' AND user_id IS NOT NULL) users, SUM(status='expired') expired FROM notification_subscriptions");
  ok(res, rows.map((r) => ({ ...r, image_url: fileUrl(r.image) })), 'OK', 200, { ...pageMeta(page, limit, total), subscriptions: { active: Number(subs.active || 0), users: Number(subs.users || 0), expired: Number(subs.expired || 0) } });
});

const create = asyncHandler(async (req, res) => {
  try {
    const s = await settings.getGroup('website_settings');
    const b = req.body;
    const image = req.file ? await images.storeImage(req.file.path, 'notifications', { maxWidth: 1024 }) : null;
    let url = b.url || null;
    if (!url && b.edition_id) {
      const ed = await one('SELECT slug FROM editions WHERE id=?', [b.edition_id]);
      if (ed) url = `/edition/${ed.slug}`;
    }
    const r = await query('INSERT INTO push_notifications (title, message, image, url, audience, edition_id, created_by) VALUES (?,?,?,?,?,?,?)',
      [cleanText(b.title), cleanText(b.message), image, url, b.audience, b.edition_id, req.user.id]);
    const row = await one('SELECT * FROM push_notifications WHERE id=?', [r.insertId]);
    let result = null;
    if (b.send_now) {
      if (!s.push_enabled) throw ApiError.badRequest('Push notifications are disabled in settings. Saved as draft.');
      result = await push.sendNotification({ ...row, image: image ? `/uploads/${image}` : null });
    }
    await audit(req, b.send_now ? 'notification.sent' : 'notification.created', 'notification', r.insertId, result);
    created(res, { ...(await one('SELECT * FROM push_notifications WHERE id=?', [r.insertId])), result },
      b.send_now ? `Notification sent to ${result.sent} of ${result.total} device(s)` : 'Notification saved as draft');
  } finally { cleanupFiles(req); }
});

const send = asyncHandler(async (req, res) => {
  const row = await one('SELECT * FROM push_notifications WHERE id=?', [req.params.id]);
  if (!row) throw ApiError.notFound();
  const result = await push.sendNotification({ ...row, image: row.image ? `/uploads/${row.image}` : null });
  await audit(req, 'notification.sent', 'notification', row.id, result);
  ok(res, result, `Notification sent to ${result.sent} of ${result.total} device(s)`);
});

const remove = asyncHandler(async (req, res) => {
  const row = await one('SELECT * FROM push_notifications WHERE id=?', [req.params.id]);
  if (!row) throw ApiError.notFound();
  await query('DELETE FROM push_notifications WHERE id=?', [row.id]);
  if (row.image) images.safeUnlink(images.absUpload(row.image));
  await audit(req, 'notification.deleted', 'notification', row.id);
  ok(res, null, 'Notification deleted');
});

module.exports = { subscribe, unsubscribe, vapidKey, list, create, send, remove };
