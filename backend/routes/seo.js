const router = require('express').Router();
const c = require('../controllers/seoController');
const { can } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');

router.get('/overview', can('seo.view'), c.overview);
router.post('/sitemap/regenerate', can('seo.manage'), c.regenerateSitemap);
router.get('/:type/:id', can('seo.view'), c.get);
router.put('/:type/:id', can('seo.manage'), imageUpload.single('og_image'), c.save);
module.exports = router;
