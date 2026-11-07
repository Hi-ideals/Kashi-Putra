const router = require('express').Router();
const c = require('../controllers/editionsController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { can } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');

// Public
router.get('/public', c.publicList);
router.get('/public/latest', c.publicLatest);
router.get('/public/dates', c.publicDates);
router.get('/public/resolve', c.publicResolve);
router.get('/public/:slug', c.publicGet);
router.post('/public/pages/:pageId/view', c.pageView);

// Admin
router.get('/', can('editions.view'), c.list);
router.post('/bulk', can('editions.view'), c.bulk);
router.get('/:id', can('editions.view'), c.get);
router.post('/', can('editions.add'), imageUpload.single('cover_image'), validate(S.edition), c.create);
router.put('/:id', can('editions.edit'), imageUpload.single('cover_image'), validate(S.edition), c.update);
router.delete('/:id', can('editions.delete'), c.remove);
router.post('/:id/duplicate', can('editions.add'), c.duplicate);
router.post('/:id/actions/:action', can('editions.view'), c.action);
module.exports = router;
