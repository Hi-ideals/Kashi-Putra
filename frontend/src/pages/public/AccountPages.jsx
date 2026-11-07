import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { Field, GoogleButton, Spinner, useRecaptcha } from '../../components/common';
import { post, put, get } from '../../services/api';
import { enablePush, disablePush, pushSupported, currentSubscription } from '../../services/push';
import { useTitle } from '../../hooks';
import { formatDateTime } from '../../utils/format';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="h4 mb-1">{title}</h1>
        {subtitle && <p className="text-muted small mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

const nextUrl = (params) => { const n = params.get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'; };

export function LoginPage() {
  const { login, googleLogin, user } = useAuth();
  const { t, site } = useSettings();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const rc = useRecaptcha('login');
  useTitle(`${t('login')} | ${site.site_name}`);
  if (user) return <Navigate to={nextUrl(params)} replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try {
      await login({ ...form, recaptchaToken: await rc.getToken() });
      toast.success('Welcome back!');
      navigate(nextUrl(params), { replace: true });
    } catch (err) { setErrors(err.errors || {}); toast.error(err.message); rc.reset(); } finally { setBusy(false); }
  };
  return (
    <AuthCard title={t('login')} subtitle={`Log in to comment, manage your subscription and more.`}>
      <form onSubmit={submit} noValidate>
        <Field label="Email" error={errors.email}><input type="email" className="form-control" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" error={errors.password}><input type="password" className="form-control" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div className="d-flex justify-content-end mb-3"><Link to="/forgot-password" className="small">Forgot password?</Link></div>
        {rc.element}
        <button className="btn btn-primary w-100" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}{t('login')}</button>
      </form>
      <GoogleButton onCredential={async (c) => { try { await googleLogin(c); navigate(nextUrl(params), { replace: true }); } catch (e) { toast.error(e.message); } }} />
      {site.allow_registration && <p className="text-center small mt-4 mb-0">No account? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>{t('register')}</Link></p>}
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register, googleLogin, user } = useAuth();
  const { t, site } = useSettings();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', subscribe: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const rc = useRecaptcha('register');
  useTitle(`${t('register')} | ${site.site_name}`);
  if (user) return <Navigate to="/" replace />;
  if (!site.allow_registration) return <AuthCard title={t('register')}><p className="mb-0">Registration is currently closed.</p></AuthCard>;
  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setErrors({ confirm: 'Passwords do not match' }); return; }
    setBusy(true); setErrors({});
    try {
      await register({ name: form.name, email: form.email, phone: form.phone, password: form.password, subscribe: form.subscribe && site.enable_subscriptions, recaptchaToken: await rc.getToken() });
      toast.success('Account created');
      navigate(nextUrl(params), { replace: true });
    } catch (err) { setErrors(err.errors || {}); toast.error(err.message); rc.reset(); } finally { setBusy(false); }
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <AuthCard title={t('register')} subtitle="Create a free reader account.">
      <form onSubmit={submit} noValidate>
        <Field label="Full name" error={errors.name}><input className="form-control" autoComplete="name" required {...f('name')} /></Field>
        <Field label="Email" error={errors.email}><input type="email" className="form-control" autoComplete="email" required {...f('email')} /></Field>
        <Field label="Phone (optional)" error={errors.phone}><input className="form-control" autoComplete="tel" {...f('phone')} /></Field>
        <div className="row g-2">
          <div className="col-sm-6"><Field label="Password" error={errors.password} help="Min 8 characters with a letter and a number"><input type="password" className="form-control" autoComplete="new-password" required {...f('password')} /></Field></div>
          <div className="col-sm-6"><Field label="Confirm password" error={errors.confirm}><input type="password" className="form-control" autoComplete="new-password" required {...f('confirm')} /></Field></div>
        </div>
        {site.enable_subscriptions && (
          <div className="form-check mb-3"><input id="sub" type="checkbox" className="form-check-input" checked={form.subscribe} onChange={(e) => setForm({ ...form, subscribe: e.target.checked })} /><label htmlFor="sub" className="form-check-label small">Email me when new editions are published</label></div>
        )}
        {rc.element}
        <button className="btn btn-primary w-100" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}{t('register')}</button>
      </form>
      <GoogleButton text="signup_with" onCredential={async (c) => { try { await googleLogin(c); navigate('/', { replace: true }); } catch (e) { toast.error(e.message); } }} />
      <p className="text-center small mt-4 mb-0">Already registered? <Link to="/login">{t('login')}</Link></p>
    </AuthCard>
  );
}

export function ForgotPasswordPage({ admin = false }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await post('/auth/forgot-password', { email, admin }); toast.success(r.message); setSent(true); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const body = (
    <AuthCard title="Forgot password" subtitle="Enter your email and we will send you a reset link.">
      {sent ? <div className="alert alert-success small">If an account exists for <b>{email}</b>, a reset link has been sent. Check your inbox.</div> : (
        <form onSubmit={submit}>
          <Field label="Email"><input type="email" className="form-control" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn btn-primary w-100" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Send reset link</button>
        </form>
      )}
      <p className="text-center small mt-4 mb-0"><Link to={admin ? '/admin/login' : '/login'}>Back to login</Link></p>
    </AuthCard>
  );
  return admin ? <div className="admin-auth-bg">{body}</div> : body;
}

export function ResetPasswordPage({ admin = false }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const r = await post('/auth/reset-password', { token, ...form }); toast.success(r.message); navigate(admin ? '/admin/login' : '/login'); } catch (err) { setErrors(err.errors || {}); toast.error(err.message); } finally { setBusy(false); }
  };
  const body = (
    <AuthCard title="Set a new password">
      {!token ? <div className="alert alert-danger small">Invalid reset link.</div> : (
        <form onSubmit={submit}>
          <Field label="New password" error={errors.password} help="Min 8 characters with a letter and a number"><input type="password" className="form-control" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Confirm password" error={errors.confirm_password}><input type="password" className="form-control" required value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} /></Field>
          <button className="btn btn-primary w-100" disabled={busy}>Reset password</button>
        </form>
      )}
    </AuthCard>
  );
  return admin ? <div className="admin-auth-bg">{body}</div> : body;
}

/** Shared by reader account page and admin "Change password". */
export function ChangePasswordForm({ hasPassword = true }) {
  const { setToken } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '', logout_other_sessions: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try {
      const r = await put('/auth/change-password', form);
      if (r.data?.token) setToken(r.data.token);
      toast.success(r.message);
      setForm({ current_password: '', new_password: '', confirm_password: '', logout_other_sessions: true });
    } catch (err) { setErrors(err.errors || {}); toast.error(err.message); } finally { setBusy(false); }
  };
  const strength = (() => { const p = form.new_password; let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; })();
  return (
    <form onSubmit={submit} style={{ maxWidth: 460 }}>
      {hasPassword && <Field label="Current password" error={errors.current_password} required><input type="password" className="form-control" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} /></Field>}
      <Field label="New password" error={errors.new_password} required help="At least 8 characters, including a letter and a number.">
        <input type="password" className="form-control" autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        {form.new_password && <div className="progress mt-2" style={{ height: 5 }}><div className={`progress-bar bg-${['danger', 'danger', 'warning', 'info', 'success', 'success'][strength]}`} style={{ width: `${(strength / 5) * 100}%` }} /></div>}
      </Field>
      <Field label="Confirm new password" error={errors.confirm_password} required><input type="password" className="form-control" autoComplete="new-password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} /></Field>
      <div className="form-check mb-3"><input id="lo" type="checkbox" className="form-check-input" checked={form.logout_other_sessions} onChange={(e) => setForm({ ...form, logout_other_sessions: e.target.checked })} /><label htmlFor="lo" className="form-check-label">Log out from all other devices</label></div>
      <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Update password</button>
    </form>
  );
}

export function AccountPage() {
  const { user, ready, refresh, logout, setUser } = useAuth();
  const { site, t } = useSettings();
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [sub, setSub] = useState(undefined);
  const [push, setPush] = useState('unknown');
  useTitle(`${t('profile')} | ${site.site_name}`);
  useEffect(() => { if (user) setProfile({ name: user.name, phone: user.phone || '' }); }, [user]);
  useEffect(() => { if (user) get('/subscribers/me').then((r) => setSub(r.data)).catch(() => setSub(null)); }, [user]);
  useEffect(() => { if (pushSupported()) currentSubscription().then((s) => setPush(s ? 'on' : 'off')); else setPush('unsupported'); }, []);
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  const saveProfile = async (e) => {
    e.preventDefault();
    try { const r = await put('/auth/profile', profile); setUser({ ...user, ...r.data }); toast.success(r.message); } catch (err) { toast.error(err.message); }
  };
  const toggleSub = async () => {
    try {
      if (sub?.status === 'active') { const r = await post('/subscribers/unsubscribe', { email: user.email }); toast.success(r.message); }
      else { const r = await post('/subscribers/subscribe', { email: user.email, name: user.name }); toast.success(r.message); }
      const r2 = await get('/subscribers/me'); setSub(r2.data); refresh();
    } catch (err) { toast.error(err.message); }
  };
  const togglePush = async () => {
    try { if (push === 'on') { await disablePush(); setPush('off'); } else { await enablePush(site.vapid_public_key); setPush('on'); } } catch (e) { toast.error(e.message); }
  };
  const tabs = [['profile', 'person', 'Profile'], ['subscription', 'envelope-paper', 'Subscription'], ['security', 'shield-lock', 'Password & security']];
  return (
    <div className="container py-4 py-md-5" style={{ maxWidth: 960 }}>
      <h1 className="page-title">{t('profile')}</h1>
      <div className="row g-4">
        <div className="col-md-3">
          <div className="list-group">
            {tabs.map(([k, i, l]) => <button key={k} className={`list-group-item list-group-item-action ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}><i className={`bi bi-${i} me-2`} />{l}</button>)}
            <button className="list-group-item list-group-item-action text-danger" onClick={logout}><i className="bi bi-box-arrow-right me-2" />{t('logout')}</button>
          </div>
        </div>
        <div className="col-md-9">
          <div className="ep-card p-4">
            {tab === 'profile' && (
              <form onSubmit={saveProfile} style={{ maxWidth: 460 }}>
                <Field label="Email"><input className="form-control" value={user.email} disabled /></Field>
                <Field label="Name"><input className="form-control" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
                <Field label="Phone"><input className="form-control" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
                <p className="small text-muted">Member since {formatDateTime(user.created_at)}</p>
                <button className="btn btn-primary">Save</button>
              </form>
            )}
            {tab === 'subscription' && (
              <div>
                <h2 className="h5">Email subscription</h2>
                {sub === undefined ? <Spinner size="sm" /> : (
                  <p>Status: <span className={`badge text-bg-${sub?.status === 'active' ? 'success' : 'secondary'} text-capitalize`}>{sub?.status || 'Not subscribed'}</span>
                    {sub?.subscribed_at && sub.status === 'active' && <span className="small text-muted ms-2">since {formatDateTime(sub.subscribed_at)}</span>}</p>
                )}
                {site.enable_subscriptions && <button className={`btn ${sub?.status === 'active' ? 'btn-outline-danger' : 'btn-primary'}`} onClick={toggleSub}>{sub?.status === 'active' ? 'Unsubscribe' : t('subscribe')}</button>}
                <hr />
                <h2 className="h5">Browser notifications</h2>
                {push === 'unsupported' ? <p className="text-muted small">Not supported in this browser.</p> : (
                  <button className="btn btn-outline-primary" onClick={togglePush}><i className={`bi ${push === 'on' ? 'bi-bell-slash' : 'bi-bell'} me-2`} />{push === 'on' ? 'Turn off notifications' : 'Turn on notifications'}</button>
                )}
              </div>
            )}
            {tab === 'security' && (<><h2 className="h5 mb-3">Change password</h2><ChangePasswordForm hasPassword={user.has_password !== false} />
              <hr /><button className="btn btn-outline-danger btn-sm" onClick={async () => { await post('/auth/logout-all'); toast.success('Logged out everywhere'); logout(); }}>Log out from all devices</button></>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState('confirm');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const go = async (e) => {
    e?.preventDefault();
    setState('busy');
    try { const r = await post('/subscribers/unsubscribe', token ? { token, reason } : { email, reason }); setState(token ? 'done' : 'requested'); toast.success(r.message); } catch (err) { toast.error(err.message); setState('confirm'); }
  };
  return (
    <AuthCard title="Unsubscribe">
      {state === 'done' ? <div className="alert alert-success mb-0">You have been unsubscribed. We're sorry to see you go.</div>
        : state === 'requested' ? <div className="alert alert-info mb-0">Your request has been received and will be processed shortly.</div> : (
          <form onSubmit={go}>
            {!token && <Field label="Email"><input type="email" required className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
            <Field label="Reason (optional)"><select className="form-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">—</option><option>Too many emails</option><option>No longer interested</option><option>I read the ePaper directly</option><option>Other</option>
            </select></Field>
            <button className="btn btn-danger w-100" disabled={state === 'busy'}>Unsubscribe</button>
          </form>
        )}
    </AuthCard>
  );
}
