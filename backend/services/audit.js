const { query } = require('../config/db');
const { clientIp } = require('../utils/helpers');

/** Record an audit log entry. Never throws. */
async function audit(req, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent) VALUES (?,?,?,?,?,?,?)',
      [req?.user?.id || null, action, entityType, entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null, req ? clientIp(req) : null, req ? String(req.headers['user-agent'] || '').slice(0, 255) : 'system']
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

module.exports = { audit };

/** A view of req with a different user (for login/register before req.user exists). */
module.exports.asUser = (req, id) => Object.create(req, { user: { value: { id } } });
