const router = require('express').Router();
const c = require('../controllers/areaMapController');
const { can } = require('../middleware/auth');

router.get('/edition/:editionId', can('pages.view', 'editions.view'), c.list);
router.post('/', can('pages.edit'), c.create);
router.post('/copy', can('pages.edit'), c.copyPage);
router.put('/:id', can('pages.edit'), c.update);
router.delete('/:id', can('pages.edit'), c.remove);
module.exports = router;
