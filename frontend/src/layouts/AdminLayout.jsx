import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { get } from '../services/api';
import { AdminBrandMark } from '../components/admin';

const NAV = [
  { section: 'Main' },
  { to: '/admin/dashboard', icon: 'speedometer2', label: 'Dashboard', perm: 'dashboard.view' },
  { section: 'ePaper' },
  { to: '/admin/editions', icon: 'journal-richtext', label: 'Manage Editions', perm: 'editions.view' },
  { to: '/admin/publish', icon: 'cloud-upload', label: 'Publish Edition', perm: ['editions.publish', 'pages.add'] },
  { to: '/admin/categories', icon: 'tags', label: 'Edition Categories', perm: 'categories.view' },
  { to: '/admin/areas', icon: 'geo-alt', label: 'Location Mapping', perm: 'areas.view' },
  { to: '/admin/schedules', icon: 'calendar-check', label: 'Scheduling', perm: 'schedules.view' },
  { to: '/admin/actions', icon: 'ui-checks-grid', label: 'Action Management', perm: ['editions.view', 'settings.view'] },
  { to: '/admin/clippings', icon: 'scissors', label: 'Shared Clippings', perm: 'editions.view' },
  { section: 'Audience' },
  { to: '/admin/comments', icon: 'chat-square-text', label: 'Comments', perm: 'comments.view', badge: 'comments' },
  { to: '/admin/subscribers', icon: 'people', label: 'Subscribers', perm: 'subscribers.view' },
  { to: '/admin/notifications', icon: 'bell', label: 'Push Notifications', perm: 'notifications.view' },
  { to: '/admin/messages', icon: 'envelope', label: 'Contact Messages', perm: 'cms.view', badge: 'messages' },
  { section: 'Content & SEO' },
  { to: '/admin/cms', icon: 'file-earmark-text', label: 'CMS Pages', perm: 'cms.view' },
  { to: '/admin/seo', icon: 'search', label: 'SEO Settings', perm: 'seo.view' },
  { section: 'Settings' },
  { to: '/admin/settings/epaper', icon: 'gear', label: 'ePaper Settings', perm: 'settings.view' },
  { to: '/admin/settings/theme', icon: 'palette', label: 'Theme Settings', perm: 'settings.view' },
  { to: '/admin/settings/watermark', icon: 'droplet-half', label: 'Watermark', perm: 'settings.view' },
  { to: '/admin/settings/comments', icon: 'chat-dots', label: 'Comment Settings', perm: 'settings.view' },
  { to: '/admin/settings/social', icon: 'share', label: 'Social Pages', perm: 'settings.view' },
  { to: '/admin/settings/recaptcha', icon: 'shield-check', label: 'Google reCAPTCHA', perm: 'settings.view' },
  { to: '/admin/settings/pwa', icon: 'phone', label: 'PWA Settings', perm: 'settings.view' },
  { section: 'Administration' },
  { to: '/admin/users', icon: 'person-gear', label: 'Users', perm: 'users.view' },
  { to: '/admin/roles', icon: 'shield-lock', label: 'Roles & Permissions', perm: 'roles.view' },
  { to: '/admin/audit-logs', icon: 'clock-history', label: 'Audit Logs', perm: 'audit_logs.view' },
  { to: '/admin/backups', icon: 'database-down', label: 'Backups', perm: 'backups.view' },
  { to: '/admin/change-password', icon: 'key', label: 'Change Password' },
];

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const { site } = useSettings();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState({ total: 0, items: [] });
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const bellRef = useRef(null);

  useEffect(() => { setOpen(false); setBell(false); setMenu(false); }, [location.pathname]);
  useEffect(() => {
    const load = () => get('/admin/alerts').then((r) => setAlerts(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [location.pathname]);
  useEffect(() => {
    const h = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) { setBell(false); setMenu(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const visible = NAV.filter((n) => n.section || !n.perm || can(...[].concat(n.perm)));
  const nav = visible.filter((n, i) => !n.section || (visible[i + 1] && !visible[i + 1].section));
  const badgeOf = (k) => alerts.items.find((a) => a.type === k)?.count;

  return (
    <div className="admin">
      <aside className={`admin-sidebar ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="brand-row"><AdminBrandMark /><div className="min-w-0"><div className="text-truncate">{site.site_name || 'ePaper'}</div><div className="small fw-normal" style={{ color: '#6b7a92' }}>{site.admin_panel_title || 'Admin Panel'}</div></div></div>
        <nav>
          {nav.map((n, i) => n.section ? <div key={i} className="nav-section">{n.section}</div> : (
            <NavLink key={n.to} to={n.to} end={n.to === '/admin/publish'}>
              <i className={`bi bi-${n.icon}`} /><span className="flex-grow-1">{n.label}</span>
              {n.badge && badgeOf(n.badge) > 0 && <span className="badge rounded-pill text-bg-danger">{badgeOf(n.badge)}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={`admin-backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-light d-lg-none" onClick={() => setOpen(true)} aria-label="Open menu"><i className="bi bi-list" /></button>
            <a href="/" target="_blank" rel="noreferrer" className="btn btn-sm btn-light"><i className="bi bi-box-arrow-up-right me-1" /><span className="d-none d-sm-inline">View website</span></a>
          </div>
          <div className="d-flex align-items-center gap-2" ref={bellRef}>
            <div className="position-relative">
              <button className="btn btn-light position-relative" onClick={() => { setBell((b) => !b); setMenu(false); }} aria-label="Notifications">
                <i className="bi bi-bell" />
                {alerts.total > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{alerts.total > 99 ? '99+' : alerts.total}</span>}
              </button>
              {bell && (
                <div className="dropdown-menu dropdown-menu-end show notif-dropdown p-0" style={{ right: 0, left: 'auto' }}>
                  <div className="px-3 py-2 border-bottom fw-semibold">Notifications</div>
                  {alerts.items.length ? alerts.items.map((a) => (
                    <button key={a.type} className="dropdown-item py-2 small" onClick={() => navigate(a.link)}><i className="bi bi-dot text-danger" />{a.text}</button>
                  )) : <div className="px-3 py-3 small text-muted">You're all caught up.</div>}
                </div>
              )}
            </div>
            <div className="position-relative">
              <button className="btn btn-light d-flex align-items-center gap-2" onClick={() => { setMenu((m) => !m); setBell(false); }}>
                <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{user.name?.[0]?.toUpperCase()}</span>
                <span className="d-none d-md-inline text-start lh-sm"><span className="d-block small fw-semibold">{user.name}</span><span className="d-block" style={{ fontSize: 11, color: '#64748b' }}>{user.role_name}</span></span>
                <i className="bi bi-chevron-down small" />
              </button>
              {menu && (
                <div className="dropdown-menu dropdown-menu-end show" style={{ right: 0, left: 'auto' }}>
                  <Link className="dropdown-item" to="/admin/account"><i className="bi bi-person me-2" />My profile</Link>
                  <Link className="dropdown-item" to="/admin/change-password"><i className="bi bi-key me-2" />Change password</Link>
                  <hr className="dropdown-divider" />
                  <button className="dropdown-item text-danger" onClick={async () => { await logout(); navigate('/admin/login'); }}><i className="bi bi-box-arrow-right me-2" />Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}
