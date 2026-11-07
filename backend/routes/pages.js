const router = require('express').Router();
const c = require('../controllers/pagesController');
const { can } = require('../middleware/auth');
const { pageUpload } = require('../middleware/upload');
const config = require('../config');

router.get('/:pageId/download', c.publicDownload); // public (permission checked inside)

router.get('/edition/:editionId', can('pages.view'), c.list);
router.get('/edition/:editionId/validate', can('pages.view', 'editions.publish'), c.validateEdition);
router.post('/edition/:editionId/upload', can('pages.add'), pageUpload.array('files', config.upload.maxFiles), c.upload);
router.put('/edition/:editionId/reorder', can('pages.edit'), c.reorder);
router.post('/regenerate', can('pages.edit', 'settings.manage'), c.regenerateHandler);
router.put('/:pageId', can('pages.edit'), c.update);
router.post('/:pageId/replace', can('pages.edit'), pageUpload.single('file'), c.replace);
router.post('/:pageId/set-first', can('pages.edit'), c.setFirst);
router.get('/:pageId/original', can('pages.view'), c.downloadOriginal);
router.delete('/:pageId', can('pages.delete'), c.remove);
module.exports = router;
