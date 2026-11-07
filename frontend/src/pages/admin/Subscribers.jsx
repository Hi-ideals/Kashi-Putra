import { useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, SearchBox } from '../../components/admin';
import { Modal, Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { post, put, del, download } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function Subscribers() {
  const { can } = useAuth();
  const list = useAdminList('/subscribers', { limit: 25 });
  const f = list.filters;
  const counts = list.meta?.counts || {};
  const [selected, setSelected] = useState([]);
  const [edit, setEdit] = useState(null);
  const [notify, setNotify] = useState(null);
  const [errors, setErrors] = useState({});
  const save = async () => {
    setErrors({});
    try { const r = edit.id ? await put(`/subscribers/${edit.id}`, edit) : await post('/subscribers', edit); toast.success(r.message); setEdit(null); list.reload(); } catch (e) { setErrors(e.errors || {}); toast.error(e.message); }
  };
  const setStatus = (ids, status) => runAction(() => post('/subscribers/status', { ids, status }), { onDone: () => { setSelected([]); list.reload(); } });
  const cols = [
    { key: 'email', label: 'Subscriber', render: (s) => <><b>{s.email}</b><div className="small text-muted">{s.name || '—'}{s.phone ? ` · ${s.phone}` : ''}</div></> },
    { key: 'status', label: 'Status', render: (s) => <><StatusBadge status={s.status} />{s.unsubscribe_requested ? <span className="badge text-bg-warning ms-1">unsubscribe requested</span> : null}{s.unsubscribe_reason && <div className="small text-muted">“{s.unsubscribe_reason}”</div>}</> },
    { key: 'plan', label: 'Plan', render: (s) => <span className="text-capitalize">{s.plan}</span> },
    { key: 'source', label: 'Source', render: (s) => <span className="small text-capitalize">{s.source}</span> },
    { key: 'subscribed_at', label: 'Subscribed', render: (s) => <span className="small">{formatDateTime(s.subscribed_at)}</span> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (s) => (<>
      {can('subscribers.edit') && s.unsubscribe_requested ? <button className="btn btn-sm btn-warning me-1" onClick={() => setStatus([s.id], 'unsubscribed')}>Process unsubscribe</button> : null}
      {can('subscribers.edit') && <button className="btn btn-sm btn-light btn-icon me-1" title={s.status === 'active' ? 'Unsubscribe' : 'Activate'} onClick={() => setStatus([s.id], s.status === 'active' ? 'unsubscribed' : 'active')}><i className={`bi bi-toggle-${s.status === 'active' ? 'on text-success' : 'off'}`} /></button>}
      {can('subscribers.edit') && <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => { setEdit({ ...s, phone: s.phone || '', name: s.name || '' }); setErrors({}); }}><i className="bi bi-pencil" /></button>}
      {can('subscribers.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/subscribers/${s.id}`), { confirmText: `Delete ${s.email}?`, button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ];
  const exportCsv = () => download('/subscribers/export', { q: f.q, status: f.status, requested: f.requested, date_from: f.date_from, date_to: f.date_to }, 'subscribers.csv').then(() => toast.success('Export downloaded')).catch((e) => toast.error(e.message));
  return (
    <>
      <PageHeader title="Subscriber Management" actions={<>
        <button className="btn btn-light border" onClick={exportCsv}><i className="bi bi-filetype-csv me-1" />Export CSV</button>
        {can('subscribers.manage') && <button className="btn btn-light border" onClick={() => setNotify({ subject: '', message: '', ids: selected })}><i className="bi bi-envelope me-1" />Send notification</button>}
        {can('subscribers.add') && <button className="btn btn-primary" onClick={() => { setEdit({ email: '', name: '', phone: '', status: 'active', plan: 'free' }); setErrors({}); }}><i className="bi bi-plus-lg me-1" />Add subscriber</button>}
      </>} />
      <div className="d-flex gap-2 flex-wrap mb-3">
        {[['', 'All'], ['active', 'Active'], ['pending', 'Pending'], ['unsubscribed', 'Unsubscribed']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${(f.status || '') === k && !f.requested ? 'btn-primary' : 'btn-light border'}`} onClick={() => list.setFilters({ status: k, requested: '' })}>{l}{k && counts[k] ? <span className="badge text-bg-secondary ms-1">{counts[k]}</span> : null}</button>
        ))}
        <button className={`btn btn-sm ${f.requested ? 'btn-warning' : 'btn-light border'}`} onClick={() => list.setFilters({ requested: f.requested ? '' : '1', status: '' })}>Unsubscribe requests {counts.requested ? <span className="badge text-bg-danger ms-1">{counts.requested}</span> : null}</button>
      </div>
      <Panel bodyClass="" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} placeholder="Search email, name, phone…" />
        <input type="date" className="form-control form-control-sm" value={f.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} title="Subscribed from" />
        <input type="date" className="form-control form-control-sm" value={f.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} title="Subscribed to" /></div>}>
        {selected.length > 0 && (
          <div className="d-flex gap-2 px-3 py-2 bg-light border-bottom flex-wrap align-items-center">
            <b className="small">{selected.length} selected</b>
            {can('subscribers.edit') && <><button className="btn btn-sm btn-success" onClick={() => setStatus(selected, 'active')}>Activate</button><button className="btn btn-sm btn-warning" onClick={() => setStatus(selected, 'unsubscribed')}>Unsubscribe</button></>}
            {can('subscribers.delete') && <button className="btn btn-sm btn-danger" onClick={() => runAction(() => post('/subscribers/delete', { ids: selected }), { confirmText: `Delete ${selected.length} subscriber(s)?`, button: 'Delete', onDone: () => { setSelected([]); list.reload(); } })}>Delete</button>}
          </div>
        )}
        <DataTable columns={cols} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} selectable selected={selected} onSelect={setSelected} empty={<EmptyState icon="people" title="No subscribers" />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <Modal show={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit subscriber' : 'Add subscriber'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {edit && (<>
          <Field label="Email" error={errors.email} required><input type="email" className="form-control" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <div className="row g-2"><div className="col-6"><Field label="Name"><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field></div>
            <div className="col-6"><Field label="Phone"><input className="form-control" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field></div></div>
          <div className="row g-2"><div className="col-6"><Field label="Status"><select className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="pending">Pending</option><option value="unsubscribed">Unsubscribed</option></select></Field></div>
            <div className="col-6"><Field label="Plan"><input className="form-control" value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} /></Field></div></div>
        </>)}
      </Modal>
      <Modal show={!!notify} onClose={() => setNotify(null)} title="Email active subscribers" footer={<><button className="btn btn-light" onClick={() => setNotify(null)}>Cancel</button>
        <button className="btn btn-primary" onClick={() => runAction(() => post('/subscribers/notify', notify), { onDone: () => setNotify(null) })}><i className="bi bi-send me-1" />Send</button></>}>
        {notify && (<>
          <p className="small text-muted">{notify.ids?.length ? `Sends to the ${notify.ids.length} selected subscriber(s) that are active.` : 'Sends to all active subscribers.'} Each email includes an unsubscribe link.</p>
          <Field label="Subject" required><input className="form-control" value={notify.subject} onChange={(e) => setNotify({ ...notify, subject: e.target.value })} /></Field>
          <Field label="Message" required><textarea className="form-control" rows="6" value={notify.message} onChange={(e) => setNotify({ ...notify, message: e.target.value })} /></Field>
        </>)}
      </Modal>
    </>
  );
}
