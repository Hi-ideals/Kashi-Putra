const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler, paginate, pageMeta } = require('../utils/http');
const { randomToken, cleanText } = require('../utils/helpers');
const settings = require('../services/settings');
const { sendMail } = require('../services/mail');
const { audit } = require('../services/audit');
const config = require('../config');

const unsubLink = (t) => `${config.appUrl}/unsubscribe?token=${t}`;

/* Public */
const subscribe = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.enable_subscriptions) throw ApiError.forbidden('Subscriptions are currently disabled.');
  const { email, name } = req.body;
  const existing = await one('SELECT * FROM subscribers WHERE email=?', [email]);
  if (existing && existing.status === 'active' && !existing.deleted_at) return ok(res, { status: 'active' }, 'You are already subscribed.');
  const token = existing?.unsubscribe_token || randomToken(24);
  const userId = req.user?.email === email ? req.user.id : null;
  await query(`INSERT INTO subscribers (email, name, user_id, status, unsubscribe_token, source) VALUES (?,?,?,'active',?,'website')
    ON DUPLICATE KEY UPDATE status='active', name=COALESCE(VALUES(name), name), user_id=COALESCE(VALUES(user_id), user_id), unsubscribe_requested=0, unsubscribed_at=NULL, deleted_at=NULL, subscribed_at=NOW()`,
  [email, name ? cleanText(name) : null, userId, token]);
  await sendMail({ to: email, subject: `Welcome to ${s.site_name} ePaper`,
    html: `<p>Thank you for subscribing to ${s.site_name}. You will receive updates when new editions are published.</p><p style="font-size:12px"><a href="${unsubLink(token)}">Unsubscribe</a></p>` }).catch(() => {});
  await audit(req, 'subscriber.subscribed', 'subscriber', email);
  created(res, { status: 'active' }, 'Thank you for subscribing!');
});

const unsubscribe = asyncHandler(async (req, res) => {
  const { token, email, reason } = req.body || {};
  let sub = null;
  if (token) sub = await one('SELECT * FROM subscribers WHERE unsubscribe_token=?', [token]);
  else if (req.user && (email || req.user.email)) sub = await one('SELECT * FROM subscribers WHERE email=?', [req.user.email]);
  else if (email) {
    // Without a token we only record a request that an admin processes.
    const s2 = await one('SELECT id FROM subscribers WHERE email=?', [String(email).toLowerCase()]);
    if (s2) await query('UPDATE subscribers SET unsubscribe_requested=1, unsubscribe_reason=? WHERE id=?', [reason ? cleanText(reason).slice(0, 255) : null, s2.id]);
    return ok(res, null, 'Your unsubscribe request has been received.');
  }
  if (!sub) throw ApiError.notFound('Subscription not found');
  await query("UPDATE subscribers SET status='unsubscribed', unsubscribed_at=NOW(), unsubscribe_requested=0, unsubscribe_reason=? WHERE id=?", [reason ? cleanText(reason).slice(0, 255) : null, sub.id]);
  await audit(req, 'subscriber.unsubscribed', 'subscriber', sub.id);
  ok(res, { email: sub.email }, 'You have been unsubscribed.');
});

const status = asyncHandler(async (req, res) => {
  const sub = await one('SELECT email, status, plan, subscribed_at, unsubscribed_at FROM subscribers WHERE email=? AND deleted_at IS NULL', [req.user.email]);
  ok(res, sub);
});

/* Admin */
function filters(q) {
  const w = ['deleted_at IS NULL']; const p = [];
  if (q.q) { w.push('(email LIKE ? OR name LIKE ? OR phone LIKE ?)'); p.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  if (q.status) { w.push('status=?'); p.push(q.status); }
  if (q.requested === '1') w.push('unsubscribe_requested=1');
  if (q.date_from) { w.push('DATE(subscribed_at)>=?'); p.push(q.date_from); }
  if (q.date_to) { w.push('DATE(subscribed_at)<=?'); p.push(q.date_to); }
  return { where: w.join(' AND '), params: p };
}

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const { where, params } = filters(req.query);
  const [{ total }] = await query(`SELECT COUNT(*) total FROM subscribers WHERE ${where}`, params);
  const rows = await query(`SELECT id, email, name, phone, status, plan, source, unsubscribe_requested, unsubscribe_reason, subscribed_at, unsubscribed_at, created_at FROM subscribers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const counts = await query('SELECT status, COUNT(*) n FROM subscribers WHERE deleted_at IS NULL GROUP BY status');
  const [{ req: requested }] = await query('SELECT COUNT(*) req FROM subscribers WHERE deleted_at IS NULL AND unsubscribe_requested=1');
  ok(res, rows, 'OK', 200, { ...pageMeta(page, limit, total), counts: { ...Object.fromEntries(counts.map((c) => [c.status, c.n])), requested } });
});

const save = (isNew) => asyncHandler(async (req, res) => {
  const b = req.body;
  let id = req.params.id;
  if (isNew) {
    if (await one('SELECT id FROM subscribers WHERE email=? AND deleted_at IS NULL', [b.email])) throw ApiError.conflict('This email is already subscribed');
    await query('DELETE FROM subscribers WHERE email=? AND deleted_at IS NOT NULL', [b.email]);
    const r = await query("INSERT INTO subscribers (email, name, phone, status, plan, source, unsubscribe_token) VALUES (?,?,?,?,?,'admin',?)",
      [b.email, b.name ? cleanText(b.name) : null, b.phone, b.status, b.plan, randomToken(24)]);
    id = r.insertId;
  } else {
    const cur = await one('SELECT * FROM subscribers WHERE id=? AND deleted_at IS NULL', [id]);
    if (!cur) throw ApiError.notFound('Subscriber not found');
    await query(`UPDATE subscribers SET email=?, name=?, phone=?, status=?, plan=?, unsubscribed_at=IF(?='unsubscribed', COALESCE(unsubscribed_at,NOW()), NULL), unsubscribe_requested=IF(?='unsubscribed',0,unsubscribe_requested) WHERE id=?`,
      [b.email, b.name ? cleanText(b.name) : null, b.phone, b.status, b.plan, b.status, b.status, id]);
  }
  await audit(req, isNew ? 'subscriber.created' : 'subscriber.updated', 'subscriber', id, { email: b.email });
  (isNew ? created : ok)(res, await one('SELECT * FROM subscribers WHERE id=?', [id]), isNew ? 'Subscriber added' : 'Subscriber updated');
});

const remove = asyncHandler(async (req, res) => {
  const ids = (req.body?.ids || [req.params.id]).map(Number).filter(Boolean);
  await query('UPDATE subscribers SET deleted_at=NOW() WHERE id IN (?)', [ids]);
  await audit(req, 'subscriber.deleted', 'subscriber', ids.join(','));
  ok(res, null, `${ids.length} subscriber(s) deleted`);
});

const setStatus = asyncHandler(async (req, res) => {
  const ids = (req.body.ids || [req.params.id]).map(Number).filter(Boolean);
  const st = req.body.status;
  if (!['active', 'pending', 'unsubscribed'].includes(st)) throw ApiError.badRequest('Invalid status');
  await query(`UPDATE subscribers SET status=?, unsubscribe_requested=0, unsubscribed_at=IF(?='unsubscribed', NOW(), NULL) WHERE id IN (?)`, [st, st, ids]);
  await audit(req, 'subscriber.status', 'subscriber', ids.join(','), { status: st });
  ok(res, null, 'Subscription status updated');
});

const exportCsv = asyncHandler(async (req, res) => {
  const { where, params } = filters(req.query);
  const rows = await query(`SELECT id, email, name, phone, status, plan, source, subscribed_at, unsubscribed_at FROM subscribers WHERE ${where} ORDER BY id`, params);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['ID', 'Email', 'Name', 'Phone', 'Status', 'Plan', 'Source', 'Subscribed At', 'Unsubscribed At'];
  const csv = [head.join(','), ...rows.map((r) => [r.id, r.email, r.name, r.phone, r.status, r.plan, r.source, r.subscribed_at, r.unsubscribed_at].map(esc).join(','))].join('\r\n');
  await audit(req, 'subscriber.exported', 'subscriber', null, { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

/** Email a notification to active subscribers. */
const notify = asyncHandler(async (req, res) => {
  const subject = cleanText(req.body.subject);
  const message = cleanText(req.body.message);
  if (!subject || !message) throw ApiError.badRequest('Subject and message are required');
  const subs = await query("SELECT email, name, unsubscribe_token FROM subscribers WHERE status='active' AND deleted_at IS NULL" + (req.body.ids?.length ? ' AND id IN (?)' : ''), req.body.ids?.length ? [req.body.ids.map(Number)] : []);
  let sent = 0;
  for (const s of subs) {
    try {
      await sendMail({ to: s.email, subject, html: `<p>Hello ${s.name || 'reader'},</p><p>${message.replace(/\n/g, '<br>')}</p><hr><p style="font-size:12px"><a href="${unsubLink(s.unsubscribe_token)}">Unsubscribe</a></p>` });
      sent++;
    } catch (e) { console.error('mail failed', e.message); }
  }
  await audit(req, 'subscriber.notified', 'subscriber', null, { subject, sent });
  ok(res, { sent, total: subs.length }, `Notification sent to ${sent} subscriber(s)`);
});

module.exports = { subscribe, unsubscribe, status, list, create: save(true), update: save(false), remove, setStatus, exportCsv, notify };
