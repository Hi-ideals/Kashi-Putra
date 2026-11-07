/** Shared edition helpers: publish logic, page serialisation, subscriber mailing. */
const { query, one } = require('../config/db');
const cache = require('./cache');
const settings = require('./settings');
const push = require('./push');
const { sendMail } = require('./mail');
const { fileUrl } = require('../utils/helpers');
const config = require('../config');

/** Publish an edition now. Validates that it has visible pages. */
async function publishEdition(editionId, userId = null, { notify = true } = {}) {
  const ed = await one('SELECT * FROM editions WHERE id=? AND deleted_at IS NULL', [editionId]);
  if (!ed) throw Object.assign(new Error('Edition not found'), { status: 404 });
  const cnt = await one('SELECT COUNT(*) c FROM edition_pages WHERE edition_id=? AND is_visible=1', [editionId]);
  if (!cnt.c) throw Object.assign(new Error('Cannot publish an edition without any visible pages. Upload pages first.'), { status: 400 });
  const wasPublished = ed.status === 'published';
  await query("UPDATE editions SET status='published', is_active=1, published_at=COALESCE(published_at, NOW()), publish_at=NULL, updated_by=? WHERE id=?", [userId, editionId]);
  await query("UPDATE edition_schedules SET status='completed', executed_at=NOW() WHERE edition_id=? AND status='pending'", [editionId]);
  // Use the first page as cover if no cover set
  if (!ed.cover_image) {
    const thumb = await one(`SELECT pi.path FROM edition_pages p JOIN page_images pi ON pi.page_id=p.id AND pi.variant='medium'
      WHERE p.edition_id=? AND p.is_visible=1 ORDER BY p.page_number LIMIT 1`, [editionId]);
    if (thumb) await query('UPDATE editions SET cover_image=? WHERE id=?', [thumb.path, editionId]);
  }
  cache.invalidate('public:');
  const fresh = await one('SELECT * FROM editions WHERE id=?', [editionId]);
  if (!wasPublished && notify) {
    push.notifyEditionPublished(fresh, userId).catch(() => {});
    mailSubscribers(fresh).catch((e) => console.error('subscriber mail failed', e.message));
  }
  return fresh;
}

async function mailSubscribers(edition) {
  const s = await settings.getGroup('website_settings');
  if (!s.subscriber_email_on_publish) return;
  const subs = await query("SELECT email, name, unsubscribe_token FROM subscribers WHERE status='active' AND deleted_at IS NULL");
  for (const sub of subs) {
    const link = `${config.appUrl}/edition/${edition.slug}`;
    const unsub = `${config.appUrl}/unsubscribe?token=${sub.unsubscribe_token}`;
    await sendMail({
      to: sub.email,
      subject: `${s.site_name} – ${edition.title} (${edition.edition_date})`,
      html: `<p>Hello ${sub.name || 'reader'},</p><p>The new edition <b>${edition.title}</b> is now available.</p><p><a href="${link}">Read now</a></p><hr><p style="font-size:12px"><a href="${unsub}">Unsubscribe</a></p>`,
    }).catch(() => {});
  }
}

/** Pages with their image variant URLs. */
async function pagesWithImages(editionId, { onlyVisible = false, withAreas = false } = {}) {
  const pages = await query(
    `SELECT id, edition_id, page_number, title, description, is_visible, width, height, original_name, view_count, created_at, updated_at
       FROM edition_pages WHERE edition_id=? ${onlyVisible ? 'AND is_visible=1' : ''} ORDER BY page_number`, [editionId]);
  if (!pages.length) return [];
  const imgs = await query(`SELECT page_id, variant, path, width, height, size_bytes, is_watermarked FROM page_images WHERE page_id IN (?) AND variant <> 'original'`, [pages.map((p) => p.id)]);
  const map = {};
  for (const i of imgs) (map[i.page_id] ||= {})[i.variant] = { url: fileUrl(i.path), width: i.width, height: i.height, size: i.size_bytes, watermarked: !!i.is_watermarked };
  let areas = {};
  if (withAreas) {
    const rows = await query('SELECT id, page_id, x, y, w, h, title, description, link_url FROM page_areas WHERE page_id IN (?) ORDER BY sort_order, y, x', [pages.map((p) => p.id)]).catch(() => []);
    for (const a of rows) (areas[a.page_id] ||= []).push({ ...a, x: Number(a.x), y: Number(a.y), w: Number(a.w), h: Number(a.h) });
  }
  return pages.map((p, idx) => ({ ...p, is_visible: !!p.is_visible, position: idx + 1, images: map[p.id] || {}, ...(withAreas ? { areas: areas[p.id] || [] } : {}) }));
}

/** Re-number pages 1..n in the given order (array of page ids). */
async function renumberPages(conn, editionId, orderedIds) {
  // two-phase to avoid collisions
  await conn.query('UPDATE edition_pages SET page_number = page_number + 100000 WHERE edition_id=?', [editionId]);
  for (let i = 0; i < orderedIds.length; i++) {
    await conn.query('UPDATE edition_pages SET page_number=? WHERE id=? AND edition_id=?', [i + 1, orderedIds[i], editionId]);
  }
  // any page not in list gets appended
  const rest = await conn.query('SELECT id FROM edition_pages WHERE edition_id=? AND page_number > 100000 ORDER BY page_number', [editionId]);
  let n = orderedIds.length;
  for (const r of rest[0]) await conn.query('UPDATE edition_pages SET page_number=? WHERE id=?', [++n, r.id]);
}

const serializeEdition = (e) => e && ({
  ...e,
  cover_url: fileUrl(e.cover_image),
  comments_enabled: !!e.comments_enabled,
  allow_download: !!e.allow_download,
  allow_print: !!e.allow_print,
  is_active: !!e.is_active,
});

module.exports = { publishEdition, pagesWithImages, renumberPages, serializeEdition };
