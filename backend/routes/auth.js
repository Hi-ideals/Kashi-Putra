const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireRecaptcha } = require('../services/recaptcha');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' } });

router.post('/register', authLimiter, validate(S.register), requireRecaptcha('register'), c.register);
router.post('/login', authLimiter, validate(S.login), requireRecaptcha('login'), c.login);
router.post('/admin/login', authLimiter, validate(S.login), c.adminLogin);
router.post('/google', authLimiter, validate(S.google), c.googleLogin);
router.post('/forgot-password', authLimiter, validate(S.forgot), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(S.reset), c.resetPassword);
router.get('/me', authenticate(true), c.me);
router.put('/profile', authenticate(true), validate(S.profile), c.updateProfile);
router.put('/change-password', authenticate(true), validate(S.changePassword), c.changePassword);
router.post('/logout', authenticate(false), c.logout);
router.post('/logout-all', authenticate(true), c.logoutAll);
module.exports = router;
