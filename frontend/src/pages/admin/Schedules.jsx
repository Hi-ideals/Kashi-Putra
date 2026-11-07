import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, Switch, SearchBox } from '../../components/admin';
import { Modal, Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, put, del } from '../../services/api';
import { formatDate, formatDateTime, toLocalInput, fromLocalInput } from '../../utils/format';

export default function Schedules() {
  const { can } = useAuth();
  const list = useAdminList('/schedules', { tab: 'upcoming' });
  const tab = list.filters.tab || 'upcoming';
  const [edit, setEdit] = useState(null);
  const { data: eds } = useFetch(edit && !edit.id ? '/editions' : null, { limit: 100 }, [!!edit]);
  const save = async () => {
    try {
      const body = { edition_id: edit.edition_id, publish_at: fromLocalInput(edit.publish_at), notify_on_publish: edit.notify_on_publish, notes: edit.notes };
      const r = edit.id ? await put(`/schedules/${edit.id}`, body) : await post('/schedules', body);
      toast.success(r.message); setEdit(null); list.reload();
    } catch (e) { toast.error(e.message); }
  };
  const cols = [
    { key: 'edition', label: 'Edition', render: (s) => <><Link to={`/admin/editions/${s.edition_id}`} className="fw-semibold">{s.edition_title}</Link><div className="small text-muted">{s.category_name} · {formatDate(s.edition_date)} · {s.page_count} pages</div></> },
    { key: 'publish_at', label: 'Publish at', render: (s) => <><div>{formatDateTime(s.publish_at)}</div>{s.status === 'pending' && <div className="small text-muted">{countdown(s.publish_at)}</div>}</> },
    { key: 'status', label: 'Status', render: (s) => <><StatusBadge status={s.status} />{s.error_message && <div className="small text-danger mt-1">{s.error_message}</div>}</> },
    { key: 'notify', label: 'Notify', render: (s) => (s.notify_on_publish ? <i className="bi bi-bell-fill text-primary" title="Push notification" /> : <i className="bi bi-bell-slash text-muted" />) },
    { key: 'by', label: 'Created by', render: (s) => <span className="small">{s.created_by_name || '—'}</span> },
    { key: 'executed', label: 'Executed', render: (s) => <span className="small">{s.executed_at ? formatDateTime(s.executed_at) : '—'}</span> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (s) => (<>
      {can('schedules.edit') && s.status !== 'completed' && <button className="btn btn-sm btn-light me-1" onClick={() => setEdit({ ...s, publish_at: toLocalInput(s.status === 'pending' ? s.publish_at : new Date(Date.now() + 3600e3)) })}><i className="bi bi-calendar-event me-1" />{s.status === 'pending' ? 'Reschedule' : 'Schedule again'}</button>}
      {can('schedules.edit') && s.status === 'pending' && <button className="btn btn-sm btn-light text-warning me-1" onClick={() => runAction(() => post(`/schedules/${s.id}/cancel`), { confirmText: 'Cancel this scheduled publication? The edition returns to drafts.', variant: 'warning', button: 'Cancel schedule', onDone: list.reload })}>Cancel</button>}
      {can('schedules.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/schedules/${s.id}`), { confirmText: 'Delete this schedule record?', button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ];
  return (
    <>
      <PageHeader title="Scheduling Management" actions={<>
        {can('schedules.edit') && <button className="btn btn-light border" onClick={() => runAction(() => post('/schedules/run-now'), { onDone: list.reload })} title="Publish all due schedules now"><i className="bi bi-play-circle me-1" />Run scheduler now</button>}
        {can('schedules.add') && <button className="btn btn-primary" onClick={() => setEdit({ edition_id: '', publish_at: toLocalInput(new Date(Date.now() + 3600e3)), notify_on_publish: true, notes: '' })}><i className="bi bi-plus-lg me-1" />Schedule edition</button>}
      </>} />
      <ul className="nav nav-tabs mb-0">
        {[['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled / failed'], ['all', 'All']].map(([k, l]) => <li key={k} className="nav-item"><button className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => list.setFilter('tab', k)}>{l}</button></li>)}
      </ul>
      <Panel bodyClass="" className="rounded-top-0" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} placeholder="Search edition…" />
        <input type="date" className="form-control form-control-sm" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} title="From" />
        <input type="date" className="form-control form-control-sm" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} title="To" /></div>}>
        <DataTable columns={cols} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="calendar" title={tab === 'upcoming' ? 'No upcoming publications' : 'Nothing here'} />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <div className="small text-muted mt-2"><i className="bi bi-info-circle me-1" />The server checks every minute and publishes due editions automatically.</div>
      <Modal show={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Reschedule edition' : 'Schedule edition'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Close</button><button className="btn btn-primary" onClick={save}>Save schedule</button></>}>
        {edit && (<>
          {edit.id ? <p className="mb-3"><b>{edit.edition_title}</b> · {formatDate(edit.edition_date)}</p> : (
            <Field label="Edition" required><select className="form-select" value={edit.edition_id} onChange={(e) => setEdit({ ...edit, edition_id: e.target.value })}>
              <option value="">Select an unpublished edition…</option>{(eds || []).filter((e) => e.status !== 'published').map((e) => <option key={e.id} value={e.id}>{e.title} – {e.edition_date} ({e.page_count} pages, {e.status})</option>)}
            </select></Field>
          )}
          <Field label="Publication date & time" required><input type="datetime-local" className="form-control" value={edit.publish_at} min={toLocalInput(new Date())} onChange={(e) => setEdit({ ...edit, publish_at: e.target.value })} /></Field>
          <Field label="Notes"><input className="form-control" value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          <Switch label="Send push notification when published" checked={edit.notify_on_publish} onChange={(v) => setEdit({ ...edit, notify_on_publish: v })} />
        </>)}
      </Modal>
    </>
  );
}

function countdown(at) {
  const ms = new Date(at) - Date.now();
  if (ms <= 0) return 'Due now';
  const h = Math.floor(ms / 3600e3); const m = Math.floor((ms % 3600e3) / 60e3);
  return h > 48 ? `in ${Math.floor(h / 24)} days` : `in ${h}h ${m}m`;
}
