const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/commentsController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authenticate, can } = require('../middleware/auth');
const { requireRecaptcha } = require('../services/recaptcha');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, message: { success: false, message: 'Too many comments. Please slow down.' } });

router.get('/public', authenticate(false), c.publicList);
router.post('/', limiter, authenticate(true), validate(S.comment), requireRecaptcha('comment'), c.create);

router.get('/', can('comments.view'), c.list);
router.get('/blocked-users', can('comments.view'), c.blockedUsers);
router.post('/moderate', can('comments.edit'), c.moderate);
router.patch('/:id/status', can('comments.edit'), c.moderate);
router.post('/delete', can('comments.delete'), c.remove);
router.delete('/:id', can('comments.delete'), c.remove);
router.post('/users/:userId/block', can('comments.edit'), c.blockUser);
router.put('/editions/:editionId/toggle', can('comments.edit', 'editions.edit'), c.toggleEdition);
module.exports = router;
