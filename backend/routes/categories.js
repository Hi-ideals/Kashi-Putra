const router = require('express').Router();
const c = require('../controllers/categoriesController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { can } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');

router.get('/public', c.publicList);
router.get('/', can('categories.view', 'editions.view'), c.list);
router.get('/:id', can('categories.view'), c.get);
router.post('/', can('categories.add'), imageUpload.single('image'), validate(S.category.passthrough()), c.create);
router.put('/:id', can('categories.edit'), imageUpload.single('image'), validate(S.category.passthrough()), c.update);
router.patch('/:id/toggle', can('categories.edit'), c.toggle);
router.delete('/:id', can('categories.delete'), c.remove);
module.exports = router;
