/**
 * Scheduled publishing. Runs every minute (and once on start-up) and publishes
 * every pending schedule whose time has come. A DB-level lock (GET_LOCK) makes it
 * safe to run several server instances.
 */
const cron = require('node-cron');
const { pool, query } = require('../config/db');
const { publishEdition } = require('../services/editions');
const { audit } = require('../services/audit');

let running = false;

async function runDueSchedules() {
  if (running) return;
  running = true;
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('epaper_scheduler', 0) AS l");
    if (!lock.l) return;
    try {
      const due = await query(
        `SELECT s.id, s.edition_id, s.notify_on_publish FROM edition_schedules s
           JOIN editions e ON e.id = s.edition_id AND e.deleted_at IS NULL
          WHERE s.status='pending' AND s.publish_at <= NOW() ORDER BY s.publish_at LIMIT 50`);
      for (const s of due) {
        try {
          await publishEdition(s.edition_id, null, { notify: !!s.notify_on_publish });
          await query("UPDATE edition_schedules SET status='completed', executed_at=NOW(), error_message=NULL WHERE id=?", [s.id]);
          await audit(null, 'edition.auto_published', 'edition', s.edition_id, { schedule_id: s.id });
          console.log(`[scheduler] Published edition #${s.edition_id}`);
        } catch (e) {
          await query("UPDATE edition_schedules SET status='failed', executed_at=NOW(), error_message=? WHERE id=?", [String(e.message).slice(0, 490), s.id]);
          await query("UPDATE editions SET status='draft' WHERE id=? AND status='scheduled'", [s.edition_id]);
          console.error(`[scheduler] Failed edition #${s.edition_id}:`, e.message);
        }
      }
      // Editions marked scheduled with publish_at but missing a schedule row (safety net)
      const orphan = await query(`SELECT e.id FROM editions e WHERE e.status='scheduled' AND e.publish_at <= NOW() AND e.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM edition_schedules s WHERE s.edition_id=e.id AND s.status IN ('pending','failed'))`);
      for (const o of orphan) await publishEdition(o.id).catch((e) => console.error('[scheduler]', e.message));
    } finally {
      await conn.query("SELECT RELEASE_LOCK('epaper_scheduler')");
    }
  } catch (e) {
    console.error('[scheduler] error', e.message);
  } finally {
    conn.release();
    running = false;
  }
}

function startScheduler() {
  cron.schedule('* * * * *', runDueSchedules);
  cron.schedule('* * * * *', () => require('../services/backup').runAutoBackupIfDue().catch((e) => console.error('[backup]', e.message)));
  setTimeout(runDueSchedules, 3000);
  console.log('✓ Edition scheduler started (checks every minute)');
}

module.exports = { startScheduler, runDueSchedules };
