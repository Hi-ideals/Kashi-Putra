import { useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, Switch, SearchBox } from '../../components/admin';
import { Modal, Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, put, patch, del } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function Users() {
  const { can, user: me } = useAuth();
  const list = useAdminList('/admin/users', { type: 'admins', limit: 25 });
  const { data: roles } = useFetch('/admin/roles');
  const f = list.filters;
  const [edit, setEdit] = useState(null);
  const [errors, setErrors] = useState({});
  const save = async () => {
    setErrors({});
    try { const r = edit.id ? await put(`/admin/users/${edit.id}`, edit) : await post('/admin/users', edit); toast.success(r.message); setEdit(null); list.reload(); } catch (e) { setErrors(e.errors || {}); toast.error(e.message); }
  };
  const open = (u) => { setErrors({}); setEdit(u ? { ...u, phone: u.phone || '', password: '', role_id: u.role_id || '' } : { name: '', email: '', phone: '', password: '', role_id: f.type === 'readers' ? '' : (roles?.find((r) => r.slug === 'editor')?.id || ''), status: 'active', can_comment: true }); };
  const cols = [
    { key: 'name', label: 'User', render: (u) => <div className="d-flex gap-2 align-items-center"><span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{u.name[0]}</span><div><b>{u.name}</b>{u.id === me.id && <span className="badge text-bg-info ms-1">you</span>}<div className="small text-muted">{u.email}{u.google_linked && <i className="bi bi-google ms-1" title="Google linked" />}</div></div></div> },
    { key: 'role', label: 'Role', render: (u) => u.role_name ? <span className="badge text-bg-light border">{u.role_name}</span> : <span className="small text-muted">Reader</span> },
    { key: 'status', label: 'Status', render: (u) => <><StatusBadge status={u.status} />{!u.can_comment && <span className="badge text-bg-warning ms-1">no comments</span>}</> },
    { key: 'last', label: 'Last login', render: (u) => <span className="small">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</span> },
    { key: 'created', label: 'Created', render: (u) => <span className="small">{formatDateTime(u.created_at)}</span> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (u) => can('users.manage') && u.id !== me.id && (<>
      <button className="btn btn-sm btn-light me-1" onClick={() => runAction(() => patch(`/admin/users/${u.id}/status`, { status: u.status === 'active' ? 'blocked' : 'active' }), { confirmText: u.status === 'active' ? `Block ${u.name}? They will be logged out.` : undefined, variant: 'warning', onDone: list.reload })}>{u.status === 'active' ? 'Block' : 'Activate'}</button>
      <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => open(u)}><i className="bi bi-pencil" /></button>
      <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/admin/users/${u.id}`), { confirmText: `Delete ${u.name}?`, button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>
    </>) },
  ];
  return (
    <>
      <PageHeader title="Users" actions={can('users.manage') && <button className="btn btn-primary" onClick={() => open(null)}><i className="bi bi-person-plus me-1" />Add user</button>} />
      <ul className="nav nav-tabs">
        {[['admins', 'Admin users'], ['readers', 'Registered readers'], ['', 'Everyone']].map(([k, l]) => <li key={k} className="nav-item"><button className={`nav-link ${(f.type || '') === k ? 'active' : ''}`} onClick={() => list.setFilters({ type: k, role_id: '' })}>{l}</button></li>)}
      </ul>
      <Panel bodyClass="" className="rounded-top-0" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} placeholder="Name or email…" />
        {f.type !== 'readers' && <select className="form-select form-select-sm" value={f.role_id || ''} onChange={(e) => list.setFilter('role_id', e.target.value)}><option value="">All roles</option>{(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        <select className="form-select form-select-sm" value={f.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="inactive">Inactive</option></select></div>}>
        <DataTable columns={cols} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="people" title="No users" />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <Modal show={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit user' : 'Add user'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {edit && (<>
          <Field label="Full name" error={errors.name} required><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="row g-2">
            <div className="col-md-7"><Field label="Email" error={errors.email} required><input type="email" className="form-control" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field></div>
            <div className="col-md-5"><Field label="Phone"><input className="form-control" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field></div>
          </div>
          <Field label={edit.id ? 'New password' : 'Password'} error={errors.password} required={!edit.id} help={edit.id ? 'Leave empty to keep the current password' : 'At least 8 characters with a letter and a number'}><input type="password" autoComplete="new-password" className="form-control" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
          <div className="row g-2">
            <div className="col-md-7"><Field label="Role" help="No role = public reader account (no admin access)"><select className="form-select" value={edit.role_id || ''} onChange={(e) => setEdit({ ...edit, role_id: e.target.value })}><option value="">— Reader (no admin access) —</option>{(roles || []).filter((r) => r.slug !== 'super-admin' || me.is_super).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></div>
            <div className="col-md-5"><Field label="Status"><select className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="blocked">Blocked</option><option value="inactive">Inactive</option></select></Field></div>
          </div>
          <Switch label="Can post comments" checked={edit.can_comment} onChange={(v) => setEdit({ ...edit, can_comment: v })} />
        </>)}
      </Modal>
    </>
  );
}
