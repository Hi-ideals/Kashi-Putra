const router = require('express').Router();
const c = require('../controllers/notificationsController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { authenticate, can } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');

router.get('/vapid-key', c.vapidKey);
router.post('/subscribe', authenticate(false), validate(S.pushSubscribe), c.subscribe);
router.post('/unsubscribe', c.unsubscribe);
router.get('/', can('notifications.view'), c.list);
router.post('/', can('notifications.add'), imageUpload.single('image'), validate(S.notification), c.create);
router.post('/:id/send', can('notifications.add'), c.send);
router.delete('/:id', can('notifications.add'), c.remove);
module.exports = router;
