/* Simple ordered SQL migration runner. Usage: npm run migrate */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

async function main() {
  // Create database if it doesn't exist
  const admin = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const conn = await mysql.createConnection({ ...config.db, multipleStatements: false });
  await conn.query(`CREATE TABLE IF NOT EXISTS migrations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(191) NOT NULL UNIQUE,
    run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4`);
  const [done] = await conn.query('SELECT name FROM migrations');
  const doneSet = new Set(done.map((r) => r.name));

  const files = fs.readdirSync(__dirname).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  let count = 0;
  for (const file of files) {
    if (doneSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
    console.log(`→ Running ${file} (${statements.length} statements)`);
    for (const st of statements) {
      try { await conn.query(st); } catch (e) {
        e.message = `${e.message}\n  in statement: ${st.slice(0, 120).replace(/\s+/g, ' ')}…`;
        throw e;
      }
    }
    await conn.query('INSERT INTO migrations (name) VALUES (?)', [file]);
    count++;
  }
  console.log(count ? `✓ ${count} migration(s) applied.` : '✓ Database already up to date.');
  await conn.end();
}

main().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
