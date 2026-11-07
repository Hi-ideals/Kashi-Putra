const router = require('express').Router();
const c = require('../controllers/areasController');
const { can } = require('../middleware/auth');

router.get('/public', c.publicTree);
router.get('/mappings', can('areas.view'), c.listMappings);
router.post('/mappings', can('areas.add'), c.createMapping);
router.put('/mappings/:id', can('areas.edit'), c.updateMapping);
router.patch('/mappings/:id/toggle', can('areas.edit'), c.toggleMapping);
router.delete('/mappings/:id', can('areas.delete'), c.removeMapping);
router.get('/:entity', can('areas.view', 'editions.view'), c.list);
router.post('/:entity', can('areas.add'), c.create);
router.put('/:entity/:id', can('areas.edit'), c.update);
router.patch('/:entity/:id/toggle', can('areas.edit'), c.toggle);
router.delete('/:entity/:id', can('areas.delete'), c.remove);
module.exports = router;
