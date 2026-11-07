/**
 * Backups: a ZIP containing a full SQL dump of the database (database.sql) and,
 * optionally, the uploads folder (page images, logos, clips) and storage/originals.
 * Written in pure Node (no mysqldump needed). Files live in storage/backups (private).
 */
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const { pool, query, one } = require('../config/db');
const config = require('../config');
const settings = require('./settings');

const DIR = path.join(config.paths.root, 'storage', 'backups');
const AUTO_TYPES = ['daily', 'weekly', 'monthly'];
let running = false;

/** Tables + permissions needed by the backup module (idempotent; runs on start-up). */
async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS backups (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(191) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'manual',
    includes_media TINYINT(1) NOT NULL DEFAULT 1,
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tables_count INT UNSIGNED NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    error_message VARCHAR(500) NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    KEY idx_backups_created (created_at)
  ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS backup_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(191) NOT NULL UNIQUE,
    setting_value LONGTEXT NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4`);
  for (const action of ['view', 'manage']) {
    await query('INSERT IGNORE INTO permissions (module, action, slug, description) VALUES (?,?,?,?)', ['backups', action, `backups.${action}`, `${action} backups`]);
  }
  // Administrators get backup access too (Super Admin always has everything)
  await query(`INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r JOIN permissions p ON p.module='backups' WHERE r.slug IN ('super-admin','administrator')`);
  fs.mkdirSync(DIR, { recursive: true });
  // Anything left "running" from a crash/restart is failed
  await query("UPDATE backups SET status='failed', error_message='Interrupted (server restarted)', completed_at=NOW() WHERE status='running'");
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

/** JSON columns come back from mysql2 as objects; store them as JSON text. */
const sqlValue = (v) => (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);

/** Write a full SQL dump of the current database to `file`. Returns the table count. */
async function dumpDatabase(file) {
  const out = fs.createWriteStream(file, { encoding: 'utf8' });
  const write = (s) => new Promise((res) => (out.write(s) ? res() : out.once('drain', res)));
  const conn = await pool.getConnection();
  try {
    const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
    await write(`-- ePaper database backup\n-- Database: ${db}\n-- Created: ${new Date().toString()}\n\n`);
    await write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n\n');
    const [tables] = await conn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name");
    for (const { t } of tables) {
      const [[ct]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      await write(`-- ----------------------------\n-- Table ${t}\n-- ----------------------------\nDROP TABLE IF EXISTS \`${t}\`;\n${ct['Create Table']};\n\n`);
      const BATCH = 500;
      for (let offset = 0; ; offset += BATCH) {
        const [rows] = await conn.query(`SELECT * FROM \`${t}\` LIMIT ? OFFSET ?`, [BATCH, offset]);
        if (!rows.length) break;
        const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(',');
        const values = rows.map((r) => '(' + Object.values(r).map((v) => conn.escape(sqlValue(v))).join(',') + ')').join(',\n');
        await write(`INSERT INTO \`${t}\` (${cols}) VALUES\n${values};\n`);
        if (rows.length < BATCH) break;
      }
      await write('\n');
    }
    await write('SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n');
    return tables.length;
  } finally {
    conn.release();
    await new Promise((res) => out.end(res));
  }
}

function zip(target, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    output.on('close', () => resolve(archive.pointer()));
    archive.on('warning', (e) => { if (e.code !== 'ENOENT') reject(e); });
    archive.on('error', reject);
    archive.pipe(output);
    for (const e of entries) {
      if (e.dir) { if (fs.existsSync(e.dir)) archive.directory(e.dir, e.name); } else archive.file(e.file, { name: e.name });
    }
    archive.finalize();
  });
}

/**
 * Create a backup. type: manual | daily | weekly | monthly.
 * Returns the backup row id immediately; `done` resolves when the file is written.
 */
async function createBackup({ type = 'manual', includeMedia = true, userId = null } = {}) {
  if (running) { const e = new Error('A backup is already running. Please wait for it to finish.'); e.status = 409; throw e; }
  running = true;
  const fileName = `backup_${type}_${stamp()}.zip`;
  const r = await query('INSERT INTO backups (file_name, type, includes_media, status, created_by) VALUES (?,?,?,?,?)', [fileName, type, includeMedia ? 1 : 0, 'running', userId]);
  const id = r.insertId;
  const sqlFile = path.join(config.paths.tmp, `db_${id}_${Date.now()}.sql`);
  const done = (async () => {
    try {
      fs.mkdirSync(config.paths.tmp, { recursive: true });
      const tables = await dumpDatabase(sqlFile);
      const entries = [{ file: sqlFile, name: 'database.sql' }];
      if (includeMedia) entries.push({ dir: config.paths.uploads, name: 'uploads' }, { dir: config.paths.originals, name: 'storage/originals' });
      entries.push({ file: writeReadme(id, type, includeMedia), name: 'README.txt' });
      const size = await zip(path.join(DIR, fileName), entries);
      await query("UPDATE backups SET status='completed', size_bytes=?, tables_count=?, completed_at=NOW() WHERE id=?", [size, tables, id]);
      console.log(`[backup] ${fileName} (${(size / 1048576).toFixed(1)} MB)`);
      if (AUTO_TYPES.includes(type)) await applyRetention();
    } catch (e) {
      console.error('[backup] failed:', e.message);
      await query("UPDATE backups SET status='failed', error_message=?, completed_at=NOW() WHERE id=?", [String(e.message).slice(0, 490), id]).catch(() => {});
      fs.rm(path.join(DIR, fileName), { force: true }, () => {});
    } finally {
      fs.rm(sqlFile, { force: true }, () => {});
      fs.rm(path.join(config.paths.tmp, `readme_${id}.txt`), { force: true }, () => {});
      running = false;
    }
  })();
  return { id, fileName, done };
}

function writeReadme(id, type, includeMedia) {
  const f = path.join(config.paths.tmp, `readme_${id}.txt`);
  fs.writeFileSync(f, [
    'ePaper backup', `Created: ${new Date().toString()}`, `Type: ${type}`, '',
    'Contents:', '  database.sql        Full MySQL dump (structure + data)',
    includeMedia ? '  uploads/            Page images, logos, clips (copy into backend/uploads)\n  storage/originals/  Original uploaded files (copy into backend/storage/originals)' : '  (media files not included)',
    '', 'Restore the database:', '  mysql -u root -p <database_name> < database.sql',
    '  or in MySQL Workbench: Server > Data Import > Import from Self-Contained File', '',
  ].join('\r\n'));
  return f;
}

/** Keep only the newest `keep_count` automatic backups. Manual backups are never auto-deleted. */
async function applyRetention() {
  const s = await settings.getGroup('backup_settings');
  const keep = Math.max(1, Number(s.keep_count) || 7);
  const old = await query(`SELECT id, file_name FROM backups WHERE type IN ('daily','weekly','monthly') AND status='completed' ORDER BY created_at DESC, id DESC LIMIT 100000 OFFSET ?`, [keep]);
  for (const b of old) await removeBackup(b.id);
}

async function removeBackup(id) {
  const b = await one('SELECT * FROM backups WHERE id=?', [id]);
  if (!b) return false;
  if (b.status === 'running') { const e = new Error('This backup is still running.'); e.status = 409; throw e; }
  fs.rmSync(filePath(b.file_name), { force: true });
  await query('DELETE FROM backups WHERE id=?', [id]);
  return true;
}

function filePath(name) {
  const p = path.join(DIR, path.basename(name));
  return p;
}

/* ------------------------------ Automatic schedule ------------------------------ */

/** Most recent moment the automatic backup was due (local server time), or null. */
function lastDueSlot(s, now = new Date()) {
  const [hh, mm] = String(s.time || '02:00').split(':').map((n) => parseInt(n, 10) || 0);
  const at = (d) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
  if (s.frequency === 'weekly') {
    const wd = Math.min(6, Math.max(0, Number(s.weekday) || 0));
    const d = at(now);
    d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7));
    if (d > now) d.setDate(d.getDate() - 7);
    return d;
  }
  if (s.frequency === 'monthly') {
    const md = Math.min(31, Math.max(1, Number(s.month_day) || 1));
    const slot = (y, m) => { const last = new Date(y, m + 1, 0).getDate(); return at(new Date(y, m, Math.min(md, last))); };
    let d = slot(now.getFullYear(), now.getMonth());
    if (d > now) d = slot(now.getFullYear(), now.getMonth() - 1);
    return d;
  }
  const d = at(now);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

function nextDueSlot(s, now = new Date()) {
  if (!s.auto_enabled) return null;
  // Step forward from "now" until the last-due slot moves past now
  const probe = new Date(now);
  for (let i = 0; i < 400; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000 * (s.frequency === 'daily' ? 1 : 6));
    const slot = lastDueSlot(s, probe);
    if (slot > now) return slot;
  }
  return null;
}

/** Called every minute by the scheduler. */
async function runAutoBackupIfDue() {
  if (running) return;
  const s = await settings.getGroup('backup_settings');
  if (!s.auto_enabled) return;
  const slot = lastDueSlot(s);
  const last = s.last_auto_at ? new Date(s.last_auto_at) : null;
  if (last && !Number.isNaN(last.getTime()) && last >= slot) return;
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('epaper_backup', 0) AS l");
    if (!lock.l) return;
    try {
      // Mark first so a slow/failed backup isn't retried every minute
      await settings.updateGroup('backup_settings', { last_auto_at: new Date().toISOString() });
      const { done } = await createBackup({ type: s.frequency || 'daily', includeMedia: !!s.include_media });
      await done;
    } finally { await conn.query("SELECT RELEASE_LOCK('epaper_backup')"); }
  } catch (e) {
    console.error('[backup] auto backup error:', e.message);
  } finally { conn.release(); }
}

const isRunning = () => running;

module.exports = { DIR, ensureTables, createBackup, removeBackup, filePath, runAutoBackupIfDue, lastDueSlot, nextDueSlot, isRunning };
