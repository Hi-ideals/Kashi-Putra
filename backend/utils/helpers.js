const crypto = require('crypto');
const slugifyLib = require('slugify');
const sanitizeHtml = require('sanitize-html');
const config = require('../config');

/** Slug that also keeps non-latin (e.g. Kannada) titles usable. */
function slugify(text) {
  const s = slugifyLib(String(text || ''), { lower: true, strict: true, trim: true }).slice(0, 160).replace(/-+$/, '');
  return s || crypto.randomBytes(4).toString('hex');
}

const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function randomCode(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** AES-256-GCM encryption for secrets stored in DB. */
function keyBuf() { return crypto.createHash('sha256').update(config.encryptionKey).digest(); }
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(val) {
  if (!val || !String(val).startsWith('enc:')) return val || '';
  try {
    const raw = Buffer.from(String(val).slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', keyBuf(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

const cleanText = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();

const cleanRichHtml = (html) =>
  sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'u', 's', 'iframe']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
      '*': ['style', 'class'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'frameborder'],
      a: ['href', 'name', 'target', 'rel'],
    },
    allowedIframeHostnames: ['www.youtube.com', 'www.google.com', 'maps.google.com'],
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/], color: [/.*/], 'font-weight': [/.*/] } },
  });

/** Public URL for a file under /uploads */
const fileUrl = (rel) => (rel ? (/^https?:/.test(rel) ? rel : `/uploads/${String(rel).replace(/^\/?(uploads\/)?/, '')}`) : null);

const toBool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

function todayISO(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

module.exports = { slugify, randomToken, sha256, randomCode, encrypt, decrypt, cleanText, cleanRichHtml, fileUrl, toBool, clientIp, todayISO };
