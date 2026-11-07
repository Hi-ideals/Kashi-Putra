const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 15,
  charset: 'utf8mb4',
  dateStrings: ['DATE'],
  timezone: 'local',
  supportBigNumbers: true,
  multipleStatements: false,
});

/** Keep MySQL NOW() in the same time zone as Node so schedules & timestamps agree. */
function nodeOffset() {
  const m = -new Date().getTimezoneOffset();
  const s = m >= 0 ? '+' : '-';
  const a = Math.abs(m);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
pool.pool.on('connection', (conn) => { conn.query(`SET time_zone = '${nodeOffset()}'`); });

/** Run a parameterised query and return rows. */
async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/** Run fn(conn) inside a transaction. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };
