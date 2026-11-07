const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/clippingsController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authenticate, can } = require('../middleware/auth');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, message: { success: false, message: 'Too many clippings. Please wait a moment.' } });
router.post('/', limiter, authenticate(false), validate(S.clip), c.create);
router.get('/', can('editions.view'), c.list);
router.get('/:code', c.get);
router.get('/:code/download', c.download);
router.delete('/:code', can('editions.delete'), c.remove);
module.exports = router;
