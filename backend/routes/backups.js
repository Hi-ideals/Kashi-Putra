const router = require('express').Router();
const c = require('../controllers/backupsController');
const { can } = require('../middleware/auth');

router.get('/', can('backups.view'), c.list);
router.post('/', can('backups.manage'), c.create);
router.put('/settings', can('backups.manage'), c.updateSettings);
router.get('/:id/download', can('backups.view'), c.download);
router.delete('/:id', can('backups.manage'), c.remove);
module.exports = router;
