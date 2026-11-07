const router = require('express').Router();
const c = require('../controllers/schedulesController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { can } = require('../middleware/auth');

router.get('/', can('schedules.view'), c.list);
router.post('/', can('schedules.add'), validate(S.schedule), c.create);
router.post('/run-now', can('schedules.edit'), c.runNow);
router.put('/:id', can('schedules.edit'), c.update);
router.post('/:id/cancel', can('schedules.edit'), c.cancel);
router.delete('/:id', can('schedules.delete'), c.remove);
module.exports = router;
