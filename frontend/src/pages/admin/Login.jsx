import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { Field } from '../../components/common';
import { useTitle } from '../../hooks';
import { AdminBrandMark } from '../../components/admin';

export default function AdminLogin() {
  const { adminLogin, user } = useAuth();
  const { site } = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useTitle(`Admin login | ${site.site_name || 'ePaper'}`);
  const next = params.get('next')?.startsWith('/admin') ? params.get('next') : '/admin/dashboard';
  if (user?.is_admin) return <Navigate to={next} replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await adminLogin(form); toast.success('Welcome back'); navigate(next, { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="admin admin-auth-bg">
      <div className="auth-card">
        <div className="text-center mb-4">
          <AdminBrandMark className="login-mark mb-2" />
          <h1 className="h5 mb-0">{site.site_name || 'ePaper'} Admin</h1>
          <div className="text-muted small">Sign in to manage the ePaper</div>
        </div>
        {error && <div className="alert alert-danger small py-2">{error}</div>}
        <form onSubmit={submit}>
          <Field label="Email"><input type="email" className="form-control" autoComplete="username" required autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password">
            <div className="input-group">
              <input type={show ? 'text' : 'password'} className="form-control" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" className="btn btn-outline-secondary" onClick={() => setShow((s) => !s)} aria-label="Show password"><i className={`bi bi-eye${show ? '-slash' : ''}`} /></button>
            </div>
          </Field>
          <div className="d-flex justify-content-end mb-3"><Link to="/admin/forgot-password" className="small">Forgot password?</Link></div>
          <button className="btn btn-primary w-100" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Sign in</button>
        </form>
        <p className="text-center small mt-4 mb-0"><a href="/">← Back to website</a></p>
      </div>
    </div>
  );
}
