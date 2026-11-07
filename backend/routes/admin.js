const router = require('express').Router();
const c = require('../controllers/adminController');
const S = require('../validators/schemas');
const { validate } = require('../middleware/validate');
const { can, authenticate, requireAdmin } = require('../middleware/auth');

router.get('/dashboard', can('dashboard.view'), c.dashboard);
router.get('/alerts', authenticate(true), requireAdmin, c.alerts);

router.get('/users', can('users.view'), c.usersList);
router.post('/users', can('users.manage'), validate(S.adminUser), c.userCreate);
router.put('/users/:id', can('users.manage'), validate(S.adminUser), c.userUpdate);
router.patch('/users/:id/status', can('users.manage'), c.userStatus);
router.delete('/users/:id', can('users.manage'), c.userRemove);

router.get('/permissions', can('roles.view', 'users.view'), c.permissionsCatalog);
router.get('/roles', can('roles.view', 'users.view'), c.rolesList);
router.post('/roles', can('roles.manage'), validate(S.role), c.roleCreate);
router.put('/roles/:id', can('roles.manage'), validate(S.role), c.roleUpdate);
router.delete('/roles/:id', can('roles.manage'), c.roleRemove);

router.get('/audit-logs', can('audit_logs.view'), c.auditLogs);
module.exports = router;
