const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, one } = require('../config/db');
const { ApiError } = require('../utils/http');

function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version || 0 }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

async function loadUser(id) {
  const user = await one(
    `SELECT u.id, u.name, u.email, u.phone, u.avatar, u.status, u.role_id, u.token_version, u.can_comment, u.google_id,
            u.created_at, r.slug AS role_slug, r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL`, [id]);
  if (!user) return null;
  user.permissions = user.role_id
    ? (await query('SELECT p.slug FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?', [user.role_id])).map((r) => r.slug)
    : [];
  user.is_admin = !!user.role_id;
  user.is_super = user.role_slug === 'super-admin';
  return user;
}

/** Attaches req.user if a valid token is present. `required` → 401 otherwise. */
const authenticate = (required = true) => async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) { if (required) throw ApiError.unauthorized(); return next(); }
    let payload;
    try { payload = jwt.verify(token, config.jwt.secret); } catch {
      if (required) throw ApiError.unauthorized('Session expired. Please log in again.');
      return next();
    }
    const user = await loadUser(payload.sub);
    if (!user || user.status !== 'active' || user.token_version !== payload.tv) {
      if (required) throw ApiError.unauthorized('Session is no longer valid. Please log in again.');
      return next();
    }
    req.user = user;
    next();
  } catch (e) { next(e); }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.is_admin) return next(ApiError.forbidden('Admin access required'));
  next();
};

/** Require ANY of the listed permission slugs (super admin always passes). */
const can = (...slugs) => [authenticate(true), requireAdmin, (req, res, next) => {
  if (req.user.is_super || slugs.some((s) => req.user.permissions.includes(s))) return next();
  next(ApiError.forbidden());
}];

const hasPerm = (user, slug) => !!user && (user.is_super || user.permissions.includes(slug));

module.exports = { signToken, loadUser, authenticate, requireAdmin, can, hasPerm };
