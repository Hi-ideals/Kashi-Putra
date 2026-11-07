const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler } = require('../utils/http');
const { cleanText, fileUrl } = require('../utils/helpers');
const settings = require('../services/settings');
const images = require('../services/images');
const cache = require('../services/cache');
const push = require('../services/push');
const { verifyToken } = require('../services/recaptcha');
const { audit } = require('../services/audit');
const { cleanupFiles } = require('../middleware/upload');

const GROUPS = { website: 'website_settings', theme: 'theme_settings', watermark: 'watermark_settings', pwa: 'pwa_settings', recaptcha: 'recaptcha_settings' };
const tableOf = (g) => { const t = GROUPS[g]; if (!t) throw ApiError.notFound('Unknown settings group'); return t; };

/** Everything the public website needs, in one cached request. */
const publicSettings = asyncHandler(async (req, res) => {
  const data = await cache.remember('public:settings', 120, async () => {
    const site = await settings.getPublicGroup('website_settings');
    const theme = await settings.getPublicGroup('theme_settings');
    const pwa = await settings.getPublicGroup('pwa_settings');
    const rcFull = await settings.getGroup('recaptcha_settings');
    const social = await query("SELECT platform, label, url, icon FROM social_links WHERE status='active' ORDER BY sort_order, id");
    const pages = await query("SELECT title, slug, show_in_footer, show_in_header FROM cms_pages WHERE status='published' AND deleted_at IS NULL ORDER BY sort_order, title");
    const seo = await one("SELECT meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url, robots FROM seo_settings WHERE entity_type='home' AND entity_id=0");
    let vapid = site.vapid_public_key;
    if (site.push_enabled && !vapid) vapid = await push.ensureVapid().catch(() => '');
    return {
      site: { ...site, vapid_public_key: vapid, copyright_text: String(site.copyright_text || '').replace('{year}', new Date().getFullYear()) },
      theme, pwa, social, pages, seo,
      recaptcha: rcFull.enabled && rcFull.site_key && rcFull.secret_key ? {
        enabled: true, version: rcFull.version, site_key: rcFull.site_key,
        on: { login: rcFull.on_login, register: rcFull.on_register, comment: rcFull.on_comment, subscribe: rcFull.on_subscribe, contact: rcFull.on_contact },
      } : { enabled: false },
    };
  });
  ok(res, data);
});

const getGroup = asyncHandler(async (req, res) => {
  const table = tableOf(req.params.group);
  ok(res, await settings.getGroupForAdmin(table));
});

const updateGroup = asyncHandler(async (req, res) => {
  try {
    const table = tableOf(req.params.group);
    const schema = settings.schema[table];
    const values = {};
    for (const [k, def] of Object.entries(schema)) {
      if (def.type === 'image') continue;
      if (req.body[k] !== undefined) values[k] = typeof req.body[k] === 'string' && def.type === 'string' ? req.body[k].trim() : req.body[k];
    }
    // basic validation
    for (const k of ['primary_color', 'secondary_color', 'header_bg', 'footer_bg', 'header_text', 'footer_text', 'theme_color', 'background_color', 'color']) {
      if (values[k] !== undefined && values[k] !== '' && !/^#[0-9a-fA-F]{3,8}$/.test(values[k])) throw ApiError.badRequest(`Invalid colour value for ${k}`);
    }
    if (values.contact_email && !/^\S+@\S+\.\S+$/.test(values.contact_email)) throw ApiError.badRequest('Invalid contact email');
    if (values.opacity !== undefined && (values.opacity < 0 || values.opacity > 1)) throw ApiError.badRequest('Opacity must be between 0 and 1');
    if (values.important_links !== undefined && typeof values.important_links === 'string') {
      try { values.important_links = JSON.parse(values.important_links); } catch { throw ApiError.badRequest('Important links must be valid JSON'); }
    }
    if (values.timezone) { try { Intl.DateTimeFormat('en', { timeZone: values.timezone }); } catch { throw ApiError.badRequest('Invalid time zone'); } }
    // image fields: uploaded file OR "remove_<key>"
    const current = await settings.getGroup(table);
    const files = Object.fromEntries((req.files || []).map((f) => [f.fieldname, f]));
    for (const [k, def] of Object.entries(schema)) {
      if (def.type !== 'image') continue;
      if (files[k]) {
        values[k] = await images.storeImage(files[k].path, 'branding', { maxWidth: k === 'favicon' ? 256 : 1200, keepFormat: true, originalName: files[k].originalname });
        if (current[k]) images.safeUnlink(images.absUpload(current[k]));
      } else if (req.body[`remove_${k}`] === 'true' || req.body[`remove_${k}`] === true) {
        values[k] = '';
        if (current[k]) images.safeUnlink(images.absUpload(current[k]));
      }
    }
    const result = await settings.updateGroup(table, values);
    await audit(req, `settings.${req.params.group}.updated`, 'settings', req.params.group, { keys: Object.keys(values).filter((k) => !/secret|private/.test(k)) });
    ok(res, result, 'Settings saved successfully');
  } finally { cleanupFiles(req); }
});

/** Returns a JPEG preview of the watermark (using posted values merged over saved ones). */
const watermarkPreview = asyncHandler(async (req, res) => {
  try {
    const saved = await settings.getGroup('watermark_settings');
    const wm = { ...saved };
    for (const k of Object.keys(saved)) if (req.body[k] !== undefined && k !== 'logo') wm[k] = req.body[k];
    wm.opacity = Number(wm.opacity); wm.size = Number(wm.size); wm.rotation = Number(wm.rotation);
    if (req.file) wm.logo = await images.storeImage(req.file.path, 'tmp-preview', { keepFormat: true });
    const sample = await one(`SELECT pi.path FROM page_images pi JOIN edition_pages p ON p.id=pi.page_id JOIN editions e ON e.id=p.edition_id AND e.deleted_at IS NULL
      WHERE pi.variant='medium' ORDER BY pi.id DESC LIMIT 1`);
    // use un-watermarked sample if possible
    const buf = await images.watermarkPreview(wm, sample && !saved.enabled ? sample.path : null);
    if (req.file) images.safeUnlink(images.absUpload(wm.logo));
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } finally { cleanupFiles(req); }
});

const recaptchaTest = asyncHandler(async (req, res) => {
  const rc = await settings.getGroup('recaptcha_settings');
  const secret = req.body.secret_key || rc.secret_key;
  if (!secret) throw ApiError.badRequest('Save a secret key first');
  if (!req.body.token) throw ApiError.badRequest('Complete the reCAPTCHA challenge in the test box first');
  let result;
  try { result = await verifyToken(req.body.token, secret); } catch (e) { throw ApiError.badRequest('Could not reach Google: ' + e.message); }
  await audit(req, 'settings.recaptcha.tested', 'settings', 'recaptcha', { success: !!result.success });
  ok(res, result, result.success ? 'reCAPTCHA is configured correctly' : `Verification failed: ${(result['error-codes'] || []).join(', ')}`);
});

/* ---- Social links ---- */
const socialList = asyncHandler(async (req, res) => ok(res, await query('SELECT * FROM social_links ORDER BY sort_order, id')));
const socialSave = (isNew) => asyncHandler(async (req, res) => {
  const b = req.body;
  const vals = { platform: cleanText(b.platform).toLowerCase(), label: cleanText(b.label), url: b.url, icon: b.icon || cleanText(b.platform).toLowerCase(), sort_order: b.sort_order, status: b.status };
  let id = req.params.id;
  if (isNew) id = (await query('INSERT INTO social_links SET ?', [vals])).insertId;
  else if (!(await query('UPDATE social_links SET ? WHERE id=?', [vals, id])).affectedRows) throw ApiError.notFound();
  await audit(req, isNew ? 'social.created' : 'social.updated', 'social_link', id, vals);
  cache.invalidate('public:');
  (isNew ? created : ok)(res, await one('SELECT * FROM social_links WHERE id=?', [id]), 'Social link saved');
});
const socialRemove = asyncHandler(async (req, res) => {
  if (!(await query('DELETE FROM social_links WHERE id=?', [req.params.id])).affectedRows) throw ApiError.notFound();
  await audit(req, 'social.deleted', 'social_link', req.params.id);
  cache.invalidate('public:');
  ok(res, null, 'Social link deleted');
});

/* ---- PWA manifest + icons (public) ---- */
const manifest = asyncHandler(async (req, res) => {
  const p = await settings.getGroup('pwa_settings');
  const icons = p.icon || p.logo
    ? [{ src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
    : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(JSON.stringify({
    name: p.app_name, short_name: p.short_name, description: p.description, start_url: p.start_url || '/', scope: '/',
    display: p.display, orientation: p.orientation, theme_color: p.theme_color, background_color: p.background_color, icons,
  }));
});

const pwaIcon = (size) => asyncHandler(async (req, res, next) => {
  const p = await settings.getGroup('pwa_settings');
  const src = p.icon || p.logo;
  if (!src) return next(); // fall through to static default icons
  const buf = await cache.remember(`pwaicon:${src}:${size}`, 3600, () => images.squareIcon(src, size));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buf);
});

module.exports = { publicSettings, getGroup, updateGroup, watermarkPreview, recaptchaTest, socialList, socialCreate: socialSave(true), socialUpdate: socialSave(false), socialRemove, manifest, pwaIcon, fileUrl };
