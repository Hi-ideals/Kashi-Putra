const router = require('express').Router();
const c = require('../controllers/settingsController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { can } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');

router.get('/public', c.publicSettings);
router.post('/watermark/preview', can('settings.view'), imageUpload.single('logo'), c.watermarkPreview);
router.post('/recaptcha/test', can('settings.manage'), c.recaptchaTest);
router.get('/social', can('settings.view'), c.socialList);
router.post('/social', can('settings.manage'), validate(S.social), c.socialCreate);
router.put('/social/:id', can('settings.manage'), validate(S.social), c.socialUpdate);
router.delete('/social/:id', can('settings.manage'), c.socialRemove);
router.get('/:group', can('settings.view', 'seo.view'), c.getGroup);
router.put('/:group', can('settings.manage'), imageUpload.any(), c.updateGroup);
module.exports = router;
