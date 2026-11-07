/** Permission catalogue: module -> actions. Slug = `${module}.${action}` */
const MODULES = {
  dashboard: ['view'],
  editions: ['view', 'add', 'edit', 'delete', 'publish'],
  pages: ['view', 'add', 'edit', 'delete'],
  categories: ['view', 'add', 'edit', 'delete'],
  areas: ['view', 'add', 'edit', 'delete'],
  schedules: ['view', 'add', 'edit', 'delete'],
  comments: ['view', 'edit', 'delete'],
  subscribers: ['view', 'add', 'edit', 'delete', 'manage'],
  settings: ['view', 'manage'],
  seo: ['view', 'manage'],
  notifications: ['view', 'add'],
  cms: ['view', 'add', 'edit', 'delete'],
  users: ['view', 'manage'],
  roles: ['view', 'manage'],
  audit_logs: ['view'],
  backups: ['view', 'manage'],
};

const ALL = Object.entries(MODULES).flatMap(([m, acts]) => acts.map((a) => `${m}.${a}`));
const pick = (...mods) => ALL.filter((p) => mods.some((m) => (m.includes('.') ? p === m : p.startsWith(m + '.'))));

const ROLES = [
  { slug: 'super-admin', name: 'Super Admin', description: 'Complete control over the system', perms: ALL },
  { slug: 'administrator', name: 'Administrator', description: 'Manages everything except roles', perms: ALL.filter((p) => p !== 'roles.manage') },
  { slug: 'editor', name: 'Editor', description: 'Creates editions and uploads pages',
    perms: pick('dashboard', 'editions.view', 'editions.add', 'editions.edit', 'pages', 'categories.view', 'areas.view', 'schedules.view', 'comments.view', 'comments.edit', 'cms.view', 'cms.edit') },
  { slug: 'publisher', name: 'Publisher', description: 'Publishes and schedules editions',
    perms: pick('dashboard', 'editions.view', 'editions.publish', 'editions.edit', 'pages.view', 'schedules', 'notifications', 'categories.view') },
  { slug: 'content-manager', name: 'Content Manager', description: 'Manages CMS pages, SEO, comments and subscribers',
    perms: pick('dashboard', 'cms', 'seo', 'comments', 'subscribers', 'editions.view', 'settings.view') },
  { slug: 'regional-manager', name: 'Regional Manager', description: 'Manages regional editions and area mapping',
    perms: pick('dashboard', 'editions.view', 'editions.add', 'editions.edit', 'pages', 'areas', 'categories.view', 'schedules.view') },
];

module.exports = { MODULES, ALL, ROLES };
