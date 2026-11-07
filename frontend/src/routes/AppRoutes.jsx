import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common';
import { HomePage, EditionPage, ClipPage, EditionsPage, CategoryPage, MaintenanceNotice } from '../pages/public/ReaderPages';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, AccountPage, UnsubscribePage } from '../pages/public/AccountPages';
import CmsPage, { NotFoundPage } from '../pages/public/CmsPage';

const AdminLayout = lazy(() => import('../layouts/AdminLayout'));
const AdminLogin = lazy(() => import('../pages/admin/Login'));
const Dashboard = lazy(() => import('../pages/admin/Dashboard'));
const Editions = lazy(() => import('../pages/admin/Editions'));
const EditionForm = lazy(() => import('../pages/admin/EditionForm'));
const EditionDetail = lazy(() => import('../pages/admin/EditionDetail'));
const Publish = lazy(() => import('../pages/admin/Publish'));
const Categories = lazy(() => import('../pages/admin/Categories'));
const Areas = lazy(() => import('../pages/admin/Areas'));
const AreaMapping = lazy(() => import('../pages/admin/AreaMapping'));
const Schedules = lazy(() => import('../pages/admin/Schedules'));
const Backups = lazy(() => import('../pages/admin/Backups'));
const Actions = lazy(() => import('../pages/admin/Actions'));
const Comments = lazy(() => import('../pages/admin/Comments'));
const Subscribers = lazy(() => import('../pages/admin/Subscribers'));
const Settings = lazy(() => import('../pages/admin/Settings'));
const Seo = lazy(() => import('../pages/admin/Seo'));
const Notifications = lazy(() => import('../pages/admin/Notifications'));
const CmsList = lazy(() => import('../pages/admin/Cms'));
const CmsForm = lazy(() => import('../pages/admin/CmsForm'));
const Messages = lazy(() => import('../pages/admin/Messages'));
const Clippings = lazy(() => import('../pages/admin/Clippings'));
const Users = lazy(() => import('../pages/admin/Users'));
const Roles = lazy(() => import('../pages/admin/Roles'));
const AuditLogs = lazy(() => import('../pages/admin/AuditLogs'));
const AdminAccount = lazy(() => import('../pages/admin/Account'));

const Loading = () => <Spinner className="py-5 my-5" />;

/** Public site wrapper that respects maintenance mode (admins can still browse). */
function PublicGate() {
  const { site, loaded, error } = useSettings();
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!loaded && !error) return <Spinner className="vh-100" />;
  if (error && !loaded) return <div className="container py-5 text-center"><h1 className="h4">Unable to load the website</h1><p className="text-muted">{error.message}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button></div>;
  const open = ['/login', '/forgot-password', '/reset-password'].includes(pathname);
  if (site.maintenance_mode && !user?.is_admin && !open) return <MaintenanceNotice message={site.maintenance_message} />;
  return <Outlet />;
}

/** Admin guard: requires an admin account (and optional permission). */
export function RequireAdmin({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!user.is_admin) return <div className="container py-5 text-center"><h1 className="h4">Access denied</h1><p>Your account does not have admin access.</p><a href="/">Go to website</a></div>;
  return children;
}

export function RequirePerm({ perm, children }) {
  const { can } = useAuth();
  const perms = [].concat(perm);
  if (!can(...perms)) return <div className="p-5 text-center"><i className="bi bi-shield-lock display-5 text-muted" /><h2 className="h5 mt-3">You don't have permission to view this page</h2><p className="text-muted small">Required: {perms.join(' or ')}</p></div>;
  return children;
}

const P = (perm, el) => <RequirePerm perm={perm}>{el}</RequirePerm>;

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route element={<PublicGate />}>
            <Route index element={<HomePage />} />
            <Route path="edition/:slug" element={<EditionPage />} />
            <Route path="edition/:slug/page/:page" element={<EditionPage />} />
            <Route path="editions" element={<EditionsPage />} />
            <Route path="category/:slug" element={<CategoryPage />} />
            <Route path="clip/:code" element={<ClipPage />} />
            <Route path="page/:slug" element={<CmsPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="unsubscribe" element={<UnsubscribePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin/forgot-password" element={<ForgotPasswordPage admin />} />
        <Route path="admin/reset-password" element={<ResetPasswordPage admin />} />
        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={P('dashboard.view', <Dashboard />)} />
          <Route path="editions" element={P('editions.view', <Editions />)} />
          <Route path="editions/new" element={P('editions.add', <EditionForm />)} />
          <Route path="editions/:id/edit" element={P('editions.edit', <EditionForm />)} />
          <Route path="editions/:id" element={P('editions.view', <EditionDetail />)} />
          <Route path="editions/:id/areas" element={P(['pages.view', 'pages.edit'], <AreaMapping />)} />
          <Route path="publish" element={P(['editions.publish', 'pages.add'], <Publish />)} />
          <Route path="publish/:id" element={P(['editions.publish', 'pages.add'], <Publish />)} />
          <Route path="categories" element={P('categories.view', <Categories />)} />
          <Route path="areas" element={P('areas.view', <Areas />)} />
          <Route path="schedules" element={P('schedules.view', <Schedules />)} />
          <Route path="backups" element={P('backups.view', <Backups />)} />
          <Route path="actions" element={P(['editions.view', 'settings.view'], <Actions />)} />
          <Route path="comments" element={P('comments.view', <Comments />)} />
          <Route path="subscribers" element={P('subscribers.view', <Subscribers />)} />
          <Route path="settings/:group" element={P('settings.view', <Settings />)} />
          <Route path="seo" element={P('seo.view', <Seo />)} />
          <Route path="notifications" element={P('notifications.view', <Notifications />)} />
          <Route path="cms" element={P('cms.view', <CmsList />)} />
          <Route path="cms/new" element={P('cms.add', <CmsForm />)} />
          <Route path="cms/:id" element={P('cms.edit', <CmsForm />)} />
          <Route path="messages" element={P('cms.view', <Messages />)} />
          <Route path="clippings" element={P('editions.view', <Clippings />)} />
          <Route path="users" element={P('users.view', <Users />)} />
          <Route path="roles" element={P('roles.view', <Roles />)} />
          <Route path="audit-logs" element={P('audit_logs.view', <AuditLogs />)} />
          <Route path="account" element={<AdminAccount />} />
          <Route path="change-password" element={<AdminAccount tab="password" />} />
          <Route path="*" element={<div className="p-5 text-center"><h2 className="h5">Page not found</h2></div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
