/**
 * Small, safe schema upgrades applied automatically on start-up
 * (so an existing database never needs a manual migration for these).
 */
const { query, one } = require('../config/db');

async function columnExists(table, column) {
  const r = await one('SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
  return r.n > 0;
}

async function run() {
  // Comments on a mapped article (page area) inside the article popup
  if (!(await columnExists('comments', 'area_id'))) {
    await query('ALTER TABLE comments ADD COLUMN area_id INT UNSIGNED NULL AFTER page_id, ADD INDEX idx_cm_area (area_id, status)');
    console.log('[upgrade] comments.area_id added');
  }
}

module.exports = { run };
