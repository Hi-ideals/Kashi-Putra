import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Panel, runAction } from '../../components/admin';
import { Field } from '../../components/common';
import { ChangePasswordForm } from '../public/AccountPages';
import { useAuth } from '../../context/AuthContext';
import { put, post } from '../../services/api';

export default function AdminAccount({ tab }) {
  const { user, setUser, logout } = useAuth();
  const [v, setV] = useState({ name: user.name, phone: user.phone || '' });
  useEffect(() => { setV({ name: user.name, phone: user.phone || '' }); }, [user]);
  const save = async (e) => {
    e.preventDefault();
    try { const r = await put('/auth/profile', v); setUser({ ...user, ...r.data }); toast.success(r.message); } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <PageHeader title={tab === 'password' ? 'Change Password' : 'My Profile'} />
      <div className="row g-3">
        {tab !== 'password' && (
          <div className="col-lg-6">
            <Panel title="Profile">
              <form onSubmit={save}>
                <Field label="Email"><input className="form-control" value={user.email} disabled /></Field>
                <Field label="Name"><input className="form-control" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
                <Field label="Phone"><input className="form-control" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
                <p className="small text-muted">Role: <b>{user.role_name}</b></p>
                <button className="btn btn-primary">Save profile</button>
              </form>
            </Panel>
          </div>
        )}
        <div className="col-lg-6">
          <Panel title="Change password">
            <ChangePasswordForm hasPassword={user.has_password !== false} />
          </Panel>
          <Panel title="Sessions" className="mt-3">
            <p className="small text-muted">Sign out of every device where you're logged in, including this one.</p>
            <button className="btn btn-outline-danger btn-sm" onClick={() => runAction(() => post('/auth/logout-all'), { confirmText: 'Log out from all devices?', button: 'Log out everywhere', onDone: () => logout() })}>Log out from all devices</button>
          </Panel>
        </div>
      </div>
    </>
  );
}
