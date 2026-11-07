const settings = require('./settings');
const { ApiError } = require('../utils/http');

async function verifyToken(token, secret, remoteip) {
  const body = new URLSearchParams({ secret, response: token || '' });
  if (remoteip) body.append('remoteip', remoteip);
  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  return r.json();
}

/**
 * Express middleware factory: verify the reCAPTCHA token sent as body.recaptchaToken
 * when reCAPTCHA is enabled for `action` (login/register/comment/subscribe/contact).
 */
const requireRecaptcha = (action) => async (req, res, next) => {
  try {
    const rc = await settings.getGroup('recaptcha_settings');
    if (!rc.enabled || !rc[`on_${action}`] || !rc.secret_key) return next();
    const token = req.body?.recaptchaToken || req.headers['x-recaptcha-token'];
    if (!token) throw ApiError.badRequest('Please complete the reCAPTCHA verification.');
    const result = await verifyToken(token, rc.secret_key, req.ip);
    if (!result.success) throw ApiError.badRequest('reCAPTCHA verification failed. Please try again.');
    if (rc.version === 'v3' && typeof result.score === 'number' && result.score < rc.min_score) {
      throw ApiError.badRequest('Suspicious activity detected. Please try again later.');
    }
    next();
  } catch (e) { next(e); }
};

module.exports = { verifyToken, requireRecaptcha };
