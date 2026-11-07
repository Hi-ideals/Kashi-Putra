import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, ImageInput, Switch, SearchBox } from '../../components/admin';
import { Modal, Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, put, patch, del, toForm, mediaUrl } from '../../services/api';

const EMPTY = { name: '', slug: '', description: '', status: 'active', sort_order: 0, is_main: false };

export default function Categories() {
  const { can } = useAuth();
  const list = useAdminList('/categories', { limit: 50 });
  const [edit, setEdit] = useState(null);
  const [img, setImg] = useState({ file: null, remove: false });
  const [assign, setAssign] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const { data: editions } = useFetch(edit ? '/editions' : null, { limit: 100 }, [!!edit]);

  const open = (c) => { setEdit(c ? { ...c, slug: c.slug, description: c.description || '' } : { ...EMPTY }); setImg({ file: null, remove: false }); setAssign([]); setErrors({}); };
  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const body = toForm({ name: edit.name, slug: edit.slug, description: edit.description, status: edit.status, sort_order: edit.sort_order, is_main: edit.is_main, image: img.file || undefined, remove_image: img.remove ? 'true' : undefined });
      assign.forEach((id) => body.append('assign_edition_ids[]', id));
      const r = edit.id ? await put(`/categories/${edit.id}`, body) : await post('/categories', body);
      toast.success(r.message); setEdit(null); list.reload();
    } catch (e) { setErrors(e.errors || {}); toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'img', label: '', width: 56, render: (c) => c.image_url ? <img src={mediaUrl(c.image_url)} alt="" className="rounded" style={{ width: 44, height: 44, objectFit: 'cover' }} /> : <div className="rounded bg-light d-flex align-items-center justify-content-center" style={{ width: 44, height: 44 }}><i className="bi bi-tag text-muted" /></div> },
    { key: 'name', label: 'Name', render: (c) => <><b>{c.name}</b>{c.is_main && <span className="badge text-bg-primary ms-2">Main</span>}<div className="small text-muted">/{c.slug}</div></> },
    { key: 'description', label: 'Description', render: (c) => <span className="small text-muted">{c.description || '—'}</span> },
    { key: 'edition_count', label: 'Editions', render: (c) => <Link to={`/admin/editions?category_id=${c.id}`}>{c.edition_count}</Link> },
    { key: 'sort_order', label: 'Order' },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (c) => (<>
      {can('categories.edit') && <button className="btn btn-sm btn-light btn-icon me-1" title={c.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => runAction(() => patch(`/categories/${c.id}/toggle`), { onDone: list.reload })}><i className={`bi bi-toggle-${c.status === 'active' ? 'on text-success' : 'off'}`} /></button>}
      {can('categories.edit') && <button className="btn btn-sm btn-light btn-icon me-1" title="Edit" onClick={() => open(c)}><i className="bi bi-pencil" /></button>}
      {can('categories.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" title="Delete" onClick={() => runAction(() => del(`/categories/${c.id}`), { confirmText: `Delete category “${c.name}”?`, button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ];

  return (
    <>
      <PageHeader title="Edition Categories" actions={can('categories.add') && <button className="btn btn-primary" onClick={() => open(null)}><i className="bi bi-plus-lg me-1" />Add category</button>} />
      <Panel bodyClass="" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} />
        <select className="form-select form-select-sm" value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>}>
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="tags" title="No categories" />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <Modal show={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'Add category'} size="lg"
        footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Save</button></>}>
        {edit && (
          <div className="row g-3">
            <div className="col-md-7">
              <Field label="Category name" error={errors.name} required><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Kalaburagi Edition" /></Field>
              <Field label="URL slug" help="Leave empty to generate from the name"><input className="form-control" value={edit.slug || ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
              <Field label="Description"><textarea className="form-control" rows="3" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <div className="row g-2">
                <div className="col-6"><Field label="Status"><select className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div>
                <div className="col-6"><Field label="Sort order"><input type="number" className="form-control" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field></div>
              </div>
              <Switch label="Main edition (shown first)" checked={edit.is_main} onChange={(v) => setEdit({ ...edit, is_main: v })} />
            </div>
            <div className="col-md-5">
              <label className="form-label">Category image</label>
              <ImageInput url={img.remove ? null : edit.image_url} file={img.file} onFile={(f) => setImg({ file: f, remove: !f })} />
              <label className="form-label mt-3">Assign editions to this category</label>
              <select multiple className="form-select" size="6" value={assign.map(String)} onChange={(e) => setAssign([...e.target.selectedOptions].map((o) => Number(o.value)))}>
                {(editions || []).filter((e) => e.category_id !== edit.id).map((e) => <option key={e.id} value={e.id}>{e.title} ({e.edition_date}) – {e.category_name}</option>)}
              </select>
              <div className="form-text">Ctrl/Cmd-click to select multiple.</div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
