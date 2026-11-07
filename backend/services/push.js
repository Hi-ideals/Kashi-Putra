const webpush = require('web-push');
const config = require('../config');
const settings = require('./settings');
const { query } = require('../config/db');

let configuredWith = null;

/** Make sure VAPID keys exist (env first, otherwise generated once and stored encrypted in DB). */
async function ensureVapid() {
  let pub = config.vapid.publicKey;
  let priv = config.vapid.privateKey;
  if (!pub || !priv) {
    const s = await settings.getGroup('website_settings');
    pub = s.vapid_public_key; priv = s.vapid_private_key;
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey; priv = keys.privateKey;
      await settings.updateGroup('website_settings', { vapid_public_key: pub, vapid_private_key: priv });
      console.log('✓ Generated VAPID keys for web push');
    }
  } else {
    const s = await settings.getGroup('website_settings');
    if (s.vapid_public_key !== pub) await settings.updateGroup('website_settings', { vapid_public_key: pub });
  }
  if (configuredWith !== pub) {
    webpush.setVapidDetails(config.vapid.subject, pub, priv);
    configuredWith = pub;
  }
  return pub;
}

/**
 * Send a push notification row (from push_notifications) to the selected audience.
 * Expired subscriptions (404/410) are marked expired.
 */
async function sendNotification(notification) {
  await ensureVapid();
  let where = "status='active'";
  if (notification.audience === 'users') where += ' AND user_id IS NOT NULL';
  if (notification.audience === 'guests') where += ' AND user_id IS NULL';
  const subs = await query(`SELECT id, endpoint, p256dh, auth FROM notification_subscriptions WHERE ${where}`);
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.message,
    image: notification.image ? absolute(notification.image) : undefined,
    icon: '/pwa-icon-192.png',
    url: notification.url || '/',
    tag: `n-${notification.id}`,
  });
  let sent = 0; let failed = 0;
  const chunks = [];
  for (let i = 0; i < subs.length; i += 50) chunks.push(subs.slice(i, i + 50));
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) await query("UPDATE notification_subscriptions SET status='expired' WHERE id=?", [s.id]);
      }
    }));
  }
  await query("UPDATE push_notifications SET status=?, sent_count=?, failed_count=?, sent_at=NOW() WHERE id=?",
    [sent || !subs.length ? 'sent' : 'failed', sent, failed, notification.id]);
  return { sent, failed, total: subs.length };
}

function absolute(p) {
  if (/^https?:/.test(p)) return p;
  return `${config.apiUrl}${p.startsWith('/') ? '' : '/uploads/'}${p}`;
}

/** Create + send the automatic "new edition published" notification. */
async function notifyEditionPublished(edition, userId = null) {
  const s = await settings.getGroup('website_settings');
  if (!s.push_enabled || !s.push_auto_on_publish) return null;
  const res = await query(
    'INSERT INTO push_notifications (title, message, image, url, audience, edition_id, created_by) VALUES (?,?,?,?,?,?,?)',
    [`${s.site_name}: ${edition.title}`, `Today's ePaper (${edition.edition_date}) is now available. Tap to read.`,
      edition.cover_image ? `/uploads/${edition.cover_image}` : null, `/edition/${edition.slug}`, 'all', edition.id, userId]);
  const [row] = await query('SELECT * FROM push_notifications WHERE id=?', [res.insertId]);
  return sendNotification(row).catch((e) => console.error('push failed', e.message));
}

module.exports = { ensureVapid, sendNotification, notifyEditionPublished };
