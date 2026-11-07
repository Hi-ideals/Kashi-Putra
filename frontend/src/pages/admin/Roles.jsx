import { useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Panel, runAction } from '../../components/admin';
import { Field, Spinner, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, put, del } from '../../services/api';

const ACTIONS = ['view', 'add', 'edit', 'delete', 'publish', 'manage'];
const LABELS = { audit_logs: 'Audit logs', cms: 'CMS pages', seo: 'SEO' };

export default function Roles() {
  const { can } = useAuth();
  const { data: roles, reload } = useFetch('/admin/roles');
  const { data: catalog } = useFetch('/admin/permissions');
  const [edit, setEdit] = useState(null);
  if (!roles || !catalog) return <Spinner />;
  const modules = catalog.modules;
  const save = async () => {
    try { const r = edit.id ? await put(`/admin/roles/${edit.id}`, edit) : await post('/admin/roles', edit); toast.success(r.message); setEdit(null); reload(); } catch (e) { toast.error(e.message); }
  };
  const toggle = (slug) => setEdit((e) => ({ ...e, permissions: e.permissions.includes(slug) ? e.permissions.filter((p) => p !== slug) : [...e.permissions, slug] }));
  const toggleModule = (m) => setEdit((e) => { const all = modules[m].map((a) => `${m}.${a}`); const on = all.every((s) => e.permissions.includes(s)); return { ...e, permissions: on ? e.permissions.filter((p) => !all.includes(p)) : [...new Set([...e.permissions, ...all])] }; });
  const manage = can('roles.manage');
  return (
    <>
      <PageHeader title="Roles & Permissions" actions={manage && <button className="btn btn-primary" onClick={() => setEdit({ name: '', description: '', permissions: ['dashboard.view'] })}><i className="bi bi-plus-lg me-1" />Add role</button>} />
      <div className="row g-3">
        {roles.map((r) => (
          <div key={r.id} className="col-md-6 col-xl-4">
            <Panel title={<>{r.name} {r.slug === 'super-admin' && <i className="bi bi-stars text-warning" />}</>} actions={manage && r.slug !== 'super-admin' && (<>
              <button className="btn btn-sm btn-light btn-icon" onClick={() => setEdit({ ...r, description: r.description || '' })} title="Edit permissions"><i className="bi bi-pencil" /></button>
              <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/admin/roles/${r.id}`), { confirmText: `Delete role “${r.name}”?`, button: 'Delete', onDone: reload })} title="Delete"><i className="bi bi-trash" /></button>
            </>)}>
              <p className="small text-muted mb-2">{r.description}</p>
              <div className="small mb-2"><i className="bi bi-people me-1" />{r.user_count} user(s) · {r.slug === 'super-admin' ? 'All permissions' : `${r.permissions.length} permissions`}</div>
              <div className="d-flex flex-wrap gap-1">
                {Object.keys(modules).filter((m) => r.slug === 'super-admin' || r.permissions.some((p) => p.startsWith(`${m}.`))).map((m) => <span key={m} className="badge text-bg-light border text-capitalize">{LABELS[m] || m.replace('_', ' ')}</span>)}
              </div>
            </Panel>
          </div>
        ))}
      </div>
      <Modal show={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? `Edit role: ${edit.name}` : 'Add role'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save role</button></>}>
        {edit && (<>
          <div className="row g-2">
            <div className="col-md-5"><Field label="Role name" required><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field></div>
            <div className="col-md-7"><Field label="Description"><input className="form-control" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
          </div>
          <div className="table-responsive">
            <table className="table table-sm table-bordered perm-table">
              <thead className="table-light"><tr><th>Module</th>{ACTIONS.map((a) => <th key={a} className="text-capitalize">{a}</th>)}<th>All</th></tr></thead>
              <tbody>
                {Object.entries(modules).map(([m, acts]) => (
                  <tr key={m}>
                    <td className="text-capitalize fw-semibold">{LABELS[m] || m.replace('_', ' ')}</td>
                    {ACTIONS.map((a) => <td key={a}>{acts.includes(a) ? <input type="checkbox" className="form-check-input" checked={edit.permissions.includes(`${m}.${a}`)} onChange={() => toggle(`${m}.${a}`)} aria-label={`${m} ${a}`} /> : <span className="text-muted">—</span>}</td>)}
                    <td><input type="checkbox" className="form-check-input" checked={acts.every((a) => edit.permissions.includes(`${m}.${a}`))} onChange={() => toggleModule(m)} aria-label={`All ${m}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small text-muted">“Manage” on Settings allows changing settings; on Users it allows creating/editing users; on Subscribers it allows export and email notifications.</div>
        </>)}
      </Modal>
    </>
  );
}
