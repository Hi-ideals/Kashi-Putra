/* DANGER: drops and recreates the database from .env, then runs migrations + seed.
   Usage: npm run db:reset */
const mysql = require('mysql2/promise');
const config = require('../config');
const { execSync } = require('child_process');
const path = require('path');

(async () => {
  const conn = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password });
  console.log(`→ Dropping and recreating database "${config.db.database}"`);
  await conn.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
  await conn.query(`CREATE DATABASE \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  const root = path.join(__dirname, '..');
  execSync('node migrations/run.js', { cwd: root, stdio: 'inherit' });
  execSync('node seeders/run.js', { cwd: root, stdio: 'inherit' });
})().catch((e) => { console.error('Reset failed:', e.message); process.exit(1); });
