const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/subscribersController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authenticate, can } = require('../middleware/auth');
const { requireRecaptcha } = require('../services/recaptcha');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, message: { success: false, message: 'Too many requests. Please try again later.' } });

router.post('/subscribe', limiter, authenticate(false), validate(S.subscriberPublic), requireRecaptcha('subscribe'), c.subscribe);
router.post('/unsubscribe', limiter, authenticate(false), c.unsubscribe);
router.get('/me', authenticate(true), c.status);

router.get('/', can('subscribers.view'), c.list);
router.get('/export', can('subscribers.manage', 'subscribers.view'), c.exportCsv);
router.post('/notify', can('subscribers.manage'), c.notify);
router.post('/status', can('subscribers.edit'), c.setStatus);
router.post('/delete', can('subscribers.delete'), c.remove);
router.post('/', can('subscribers.add'), validate(S.subscriberAdmin), c.create);
router.put('/:id', can('subscribers.edit'), validate(S.subscriberAdmin), c.update);
router.delete('/:id', can('subscribers.delete'), c.remove);
module.exports = router;
