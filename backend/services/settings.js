const { query } = require('../config/db');
const schema = require('../config/settingsSchema');
const cache = require('./cache');
const { encrypt, decrypt, fileUrl } = require('../utils/helpers');

const TABLES = Object.keys(schema);

function decode(def, raw) {
  if (raw === null || raw === undefined) return def.def;
  switch (def.type) {
    case 'bool': return raw === '1' || raw === 'true';
    case 'number': { const n = Number(raw); return Number.isFinite(n) ? n : def.def; }
    case 'json': try { return JSON.parse(raw); } catch { return def.def; }
    case 'secret': return decrypt(raw);
    default: return raw;
  }
}
function encode(def, val) {
  switch (def.type) {
    case 'bool': return val === true || val === 'true' || val === '1' || val === 1 ? '1' : '0';
    case 'number': return String(Number(val) || 0);
    case 'json': return JSON.stringify(typeof val === 'string' ? JSON.parse(val || 'null') : val);
    case 'secret': return encrypt(val);
    default: return val === null || val === undefined ? '' : String(val);
  }
}

/** Full group (including secrets, decrypted). For internal server use only. */
async function getGroup(table) {
  if (!TABLES.includes(table)) throw new Error('Unknown settings table ' + table);
  return cache.remember('settings:' + table, 300, async () => {
    const rows = await query(`SELECT setting_key, setting_value FROM \`${table}\``);
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    const out = {};
    for (const [k, def] of Object.entries(schema[table])) out[k] = decode(def, map[k]);
    return out;
  });
}

/** Group for the admin UI: secrets masked, images resolved. */
async function getGroupForAdmin(table) {
  const g = await getGroup(table);
  const out = {};
  for (const [k, def] of Object.entries(schema[table])) {
    if (def.type === 'secret') { out[k] = ''; out[k + '_is_set'] = !!g[k]; continue; }
    out[k] = g[k];
    if (def.type === 'image') out[k + '_url'] = fileUrl(g[k]);
  }
  return out;
}

/** Public subset of a group. */
async function getPublicGroup(table) {
  const g = await getGroup(table);
  const out = {};
  for (const [k, def] of Object.entries(schema[table])) {
    if (!def.public || def.type === 'secret') continue;
    out[k] = def.type === 'image' ? fileUrl(g[k]) : g[k];
  }
  return out;
}

/** Update only known keys. Empty secret values are ignored (keeps the existing secret). */
async function updateGroup(table, values, conn) {
  const defs = schema[table];
  const exec = conn ? (s, p) => conn.query(s, p) : (s, p) => query(s, p);
  for (const [k, v] of Object.entries(values || {})) {
    const def = defs[k];
    if (!def) continue;
    if (def.type === 'secret' && (v === '' || v === undefined || v === null)) continue;
    await exec(
      `INSERT INTO \`${table}\` (setting_key, setting_value, is_public) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [k, encode(def, v), def.public ? 1 : 0]
    );
  }
  cache.invalidate('settings:', 'public:');
  return getGroupForAdmin(table);
}

/** Seed defaults for any missing keys. */
async function ensureDefaults() {
  for (const table of TABLES) {
    for (const [k, def] of Object.entries(schema[table])) {
      await query(`INSERT IGNORE INTO \`${table}\` (setting_key, setting_value, is_public) VALUES (?,?,?)`, [k, encode(def, def.def), def.public ? 1 : 0]);
    }
  }
  cache.invalidate('settings:');
}

module.exports = { TABLES, schema, getGroup, getGroupForAdmin, getPublicGroup, updateGroup, ensureDefaults };
