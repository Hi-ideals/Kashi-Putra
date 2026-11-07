const fs = require('fs');
const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler } = require('../utils/http');
const { audit } = require('../services/audit');
const settings = require('../services/settings');
const backup = require('../services/backup');

const FREQS = ['daily', 'weekly', 'monthly'];

async function settingsPayload() {
  const s = await settings.getGroup('backup_settings');
  const next = backup.nextDueSlot(s);
  return { ...s, next_run_at: next ? next.toISOString() : null };
}

const list = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT b.*, u.name AS created_by_name FROM backups b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC, b.id DESC LIMIT 200`);
  for (const r of rows) r.file_exists = r.status !== 'completed' || fs.existsSync(backup.filePath(r.file_name));
  const [{ total_size }] = await query("SELECT COALESCE(SUM(size_bytes),0) total_size FROM backups WHERE status='completed'");
  ok(res, { items: rows, settings: await settingsPayload(), running: backup.isRunning(), total_size: Number(total_size), folder: backup.DIR });
});

const create = asyncHandler(async (req, res) => {
  const includeMedia = req.body?.include_media !== false && req.body?.include_media !== 'false';
  try {
    const b = await backup.createBackup({ type: 'manual', includeMedia, userId: req.user.id });
    await audit(req, 'backup.created', 'backup', b.id, { file: b.fileName, include_media: includeMedia });
    created(res, { id: b.id, file_name: b.fileName }, 'Backup started. It will appear as completed in a moment.');
  } catch (e) {
    if (e.status === 409) throw ApiError.conflict(e.message);
    throw e;
  }
});

const download = asyncHandler(async (req, res) => {
  const b = await one('SELECT * FROM backups WHERE id=?', [req.params.id]);
  if (!b || b.status !== 'completed') throw ApiError.notFound('Backup not found');
  const p = backup.filePath(b.file_name);
  if (!fs.existsSync(p)) throw ApiError.notFound('The backup file is missing from the server.');
  await audit(req, 'backup.downloaded', 'backup', b.id, { file: b.file_name });
  res.download(p, b.file_name);
});

const remove = asyncHandler(async (req, res) => {
  try {
    if (!(await backup.removeBackup(req.params.id))) throw ApiError.notFound('Backup not found');
  } catch (e) {
    if (e.status === 409) throw ApiError.conflict(e.message);
    throw e;
  }
  await audit(req, 'backup.deleted', 'backup', Number(req.params.id));
  ok(res, null, 'Backup deleted');
});

const updateSettings = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const errors = {};
  if (b.frequency !== undefined && !FREQS.includes(b.frequency)) errors.frequency = 'Choose daily, weekly or monthly';
  if (b.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time))) errors.time = 'Use HH:mm (24-hour)';
  if (b.weekday !== undefined && !(Number(b.weekday) >= 0 && Number(b.weekday) <= 6)) errors.weekday = 'Invalid weekday';
  if (b.month_day !== undefined && !(Number(b.month_day) >= 1 && Number(b.month_day) <= 31)) errors.month_day = 'Day must be 1–31';
  if (b.keep_count !== undefined && !(Number(b.keep_count) >= 1 && Number(b.keep_count) <= 365)) errors.keep_count = 'Keep between 1 and 365 backups';
  if (Object.keys(errors).length) throw ApiError.badRequest('Please fix the highlighted fields', errors);
  const prev = await settings.getGroup('backup_settings');
  const values = {};
  for (const k of ['auto_enabled', 'frequency', 'time', 'weekday', 'month_day', 'include_media', 'keep_count']) if (b[k] !== undefined) values[k] = b[k];
  // Start counting from now when the schedule is switched on or changed, so it doesn't fire for a slot already in the past
  const turnedOn = (values.auto_enabled === true || values.auto_enabled === 'true') && !prev.auto_enabled;
  const changed = ['frequency', 'time', 'weekday', 'month_day'].some((k) => values[k] !== undefined && String(values[k]) !== String(prev[k]));
  if (turnedOn || changed) values.last_auto_at = new Date().toISOString();
  await settings.updateGroup('backup_settings', values);
  await audit(req, 'backup.settings_updated', 'settings', 0, values);
  ok(res, await settingsPayload(), 'Backup settings saved');
});

module.exports = { list, create, download, remove, updateSettings };
