const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { query, one } = require('../config/db');
const { ApiError, ok, created, asyncHandler } = require('../utils/http');
const { signToken, loadUser } = require('../middleware/auth');
const { randomToken, sha256, clientIp, cleanText } = require('../utils/helpers');
const settings = require('../services/settings');
const { sendMail } = require('../services/mail');
const { audit, asUser } = require('../services/audit');

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, avatar: u.avatar, role: u.role_slug || null, role_name: u.role_name || null,
  is_admin: !!u.is_admin, is_super: !!u.is_super, permissions: u.permissions || [], can_comment: !!u.can_comment, has_password: undefined, created_at: u.created_at,
});

async function issue(res, userId, message) {
  const user = await loadUser(userId);
  const sub = await one("SELECT status FROM subscribers WHERE email=? AND deleted_at IS NULL", [user.email]);
  return ok(res, { token: signToken(user), user: { ...publicUser(user), subscription: sub ? sub.status : null } }, message);
}

const register = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.allow_registration) throw ApiError.forbidden('Registration is currently disabled.');
  const { name, email, password, phone, subscribe } = req.body;
  if (await one('SELECT id FROM users WHERE email=?', [email])) throw ApiError.conflict('An account with this email already exists.');
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const r = await query('INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)', [cleanText(name), email, phone || null, hash]);
  if (subscribe && s.enable_subscriptions) {
    await query(`INSERT INTO subscribers (email, name, user_id, status, unsubscribe_token, source) VALUES (?,?,?,'active',?, 'registration')
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), status='active', deleted_at=NULL`, [email, cleanText(name), r.insertId, randomToken(24)]);
  }
  await audit(asUser(req, r.insertId), 'auth.register', 'user', r.insertId);
  res.status(201);
  return issue(res, r.insertId, 'Account created successfully');
});

/** Shared login for readers and admins. `adminOnly` rejects non-admin accounts. */
const loginFactory = (adminOnly) => asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const u = await one('SELECT id, password_hash, status, role_id, failed_logins, locked_until FROM users WHERE email=? AND deleted_at IS NULL', [email]);
  const fail = async () => {
    if (u) {
      const attempts = u.failed_logins + 1;
      const lock = attempts >= config.maxLoginAttempts ? new Date(Date.now() + config.lockMinutes * 60000) : null;
      await query('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?', [lock ? 0 : attempts, lock, u.id]);
      await audit(asUser(req, u.id), 'auth.login_failed', 'user', u.id, { attempts });
    }
    throw ApiError.unauthorized('Invalid email or password.');
  };
  if (!u) return fail();
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - Date.now()) / 60000);
    throw new ApiError(423, `Too many failed attempts. Account locked for ${mins} more minute(s).`);
  }
  if (!u.password_hash || !(await bcrypt.compare(password, u.password_hash))) return fail();
  if (u.status !== 'active') throw ApiError.forbidden('Your account has been disabled. Please contact support.');
  if (adminOnly && !u.role_id) throw ApiError.forbidden('This account does not have admin access.');
  await query('UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=NOW(), last_login_ip=? WHERE id=?', [clientIp(req), u.id]);
  await audit(asUser(req, u.id), adminOnly ? 'auth.admin_login' : 'auth.login', 'user', u.id);
  return issue(res, u.id, 'Logged in successfully');
});

const googleLogin = asyncHandler(async (req, res) => {
  const s = await settings.getGroup('website_settings');
  if (!s.google_client_id) throw ApiError.badRequest('Google login is not configured.');
  const client = new OAuth2Client(s.google_client_id);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: req.body.credential, audience: s.google_client_id });
    payload = ticket.getPayload();
  } catch { throw ApiError.unauthorized('Google sign-in failed.'); }
  if (!payload.email_verified) throw ApiError.unauthorized('Google email is not verified.');
  let u = await one('SELECT id, status FROM users WHERE google_id=? OR email=? ORDER BY google_id IS NULL LIMIT 1', [payload.sub, payload.email]);
  if (!u) {
    if (!s.allow_registration) throw ApiError.forbidden('Registration is currently disabled.');
    const r = await query('INSERT INTO users (name, email, google_id, avatar) VALUES (?,?,?,?)', [payload.name || payload.email, payload.email, payload.sub, payload.picture || null]);
    u = { id: r.insertId, status: 'active' };
  } else {
    await query('UPDATE users SET google_id=COALESCE(google_id, ?), avatar=COALESCE(avatar, ?), last_login_at=NOW() WHERE id=?', [payload.sub, payload.picture || null, u.id]);
  }
  if (u.status !== 'active') throw ApiError.forbidden('Your account has been disabled.');
  await audit(asUser(req, u.id), 'auth.google_login', 'user', u.id);
  return issue(res, u.id, 'Logged in with Google');
});

const me = asyncHandler(async (req, res) => {
  const sub = await one('SELECT status, plan, subscribed_at FROM subscribers WHERE email=? AND deleted_at IS NULL', [req.user.email]);
  const hasPw = await one('SELECT password_hash IS NOT NULL AS h FROM users WHERE id=?', [req.user.id]);
  ok(res, { ...publicUser(req.user), has_password: !!hasPw.h, subscription: sub ? sub.status : null, subscription_info: sub });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  await query('UPDATE users SET name=?, phone=? WHERE id=?', [cleanText(name), phone || null, req.user.id]);
  await audit(req, 'auth.profile_updated', 'user', req.user.id);
  const user = await loadUser(req.user.id);
  ok(res, publicUser(user), 'Profile updated');
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password, logout_other_sessions } = req.body;
  const u = await one('SELECT password_hash, token_version FROM users WHERE id=?', [req.user.id]);
  if (u.password_hash && !(await bcrypt.compare(current_password || '', u.password_hash))) throw ApiError.badRequest('Current password is incorrect.', { current_password: 'Current password is incorrect.' });
  if (u.password_hash && (await bcrypt.compare(new_password, u.password_hash))) throw ApiError.badRequest('New password must be different from the current password.');
  const hash = await bcrypt.hash(new_password, config.bcryptRounds);
  const tv = logout_other_sessions ? u.token_version + 1 : u.token_version;
  await query('UPDATE users SET password_hash=?, token_version=? WHERE id=?', [hash, tv, req.user.id]);
  await audit(req, 'auth.password_changed', 'user', req.user.id, { logout_other_sessions: !!logout_other_sessions });
  const user = await loadUser(req.user.id);
  ok(res, { token: signToken(user) }, 'Password changed successfully');
});

const logoutAll = asyncHandler(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id=?', [req.user.id]);
  await audit(req, 'auth.logout_all', 'user', req.user.id);
  ok(res, null, 'Logged out from all devices');
});

const logout = asyncHandler(async (req, res) => {
  if (req.user) await audit(req, 'auth.logout', 'user', req.user.id);
  ok(res, null, 'Logged out');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const u = await one('SELECT id, name, email FROM users WHERE email=? AND deleted_at IS NULL AND status="active"', [req.body.email]);
  if (u) {
    const token = randomToken(32);
    await query('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [u.id]);
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL 60 MINUTE))', [u.id, sha256(token)]);
    const s = await settings.getGroup('website_settings');
    const path = req.body.admin ? '/admin/reset-password' : '/reset-password';
    const link = `${config.appUrl}${path}?token=${token}`;
    await sendMail({ to: u.email, subject: `${s.site_name} – Password reset`,
      html: `<p>Hello ${u.name},</p><p>Click the link below to reset your password. The link is valid for 60 minutes.</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>` });
    await audit(asUser(req, u.id), 'auth.password_reset_requested', 'user', u.id);
  }
  ok(res, null, 'If an account exists for this email, a password reset link has been sent.');
});

const resetPassword = asyncHandler(async (req, res) => {
  const row = await one('SELECT id, user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at > NOW()', [sha256(req.body.token)]);
  if (!row) throw ApiError.badRequest('This reset link is invalid or has expired.');
  const hash = await bcrypt.hash(req.body.password, config.bcryptRounds);
  await query('UPDATE users SET password_hash=?, token_version=token_version+1, failed_logins=0, locked_until=NULL WHERE id=?', [hash, row.user_id]);
  await query('UPDATE password_resets SET used_at=NOW() WHERE id=?', [row.id]);
  await audit(asUser(req, row.user_id), 'auth.password_reset', 'user', row.user_id);
  ok(res, null, 'Password has been reset. You can now log in.');
});

module.exports = { register, login: loginFactory(false), adminLogin: loginFactory(true), googleLogin, me, updateProfile, changePassword, logoutAll, logout, forgotPassword, resetPassword, publicUser };
