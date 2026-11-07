import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, SearchBox } from '../../components/admin';
import { StatusBadge, EmptyState, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, patch, del } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function Comments() {
  const { can } = useAuth();
  const list = useAdminList('/comments', { limit: 25 });
  const [selected, setSelected] = useState([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const blocked = useFetch(showBlocked ? '/comments/blocked-users' : null, null, [showBlocked]);
  const counts = list.meta?.counts || {};
  const status = list.filters.status || '';
  const moderate = (ids, st) => runAction(() => post('/comments/moderate', { ids, status: st }), { onDone: () => { setSelected([]); list.reload(); } });
  const cols = [
    { key: 'body', label: 'Comment', render: (c) => <div style={{ maxWidth: 420 }}><div className="text-break">{c.body}</div><div className="small text-muted mt-1">{c.ip_address}</div></div> },
    { key: 'user', label: 'User', render: (c) => <><b className="small">{c.user_name}</b><div className="small text-muted">{c.user_email}</div>{!c.can_comment && <span className="badge text-bg-danger">blocked</span>}</> },
    { key: 'edition', label: 'Edition / page', render: (c) => <span className="small"><a href={`/edition/${c.edition_slug}${c.page_number > 1 ? `/page/${c.page_number}` : ''}`} target="_blank" rel="noreferrer">{c.edition_title}</a>{c.page_number ? ` · p.${c.page_number}` : ''}{c.area_title ? <div className="text-muted"><i className="bi bi-bounding-box me-1" />{c.area_title}</div> : c.area_id ? <div className="text-muted"><i className="bi bi-bounding-box me-1" />Article #{c.area_id}</div> : null}</span> },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'created_at', label: 'Date', render: (c) => <span className="small">{formatDateTime(c.created_at)}</span> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (c) => (<>
      {can('comments.edit') && c.status !== 'approved' && <button className="btn btn-sm btn-light btn-icon text-success me-1" title="Approve" onClick={() => runAction(() => patch(`/comments/${c.id}/status`, { status: 'approved' }), { onDone: list.reload })}><i className="bi bi-check-lg" /></button>}
      {can('comments.edit') && c.status !== 'rejected' && <button className="btn btn-sm btn-light btn-icon text-warning me-1" title="Reject" onClick={() => runAction(() => patch(`/comments/${c.id}/status`, { status: 'rejected' }), { onDone: list.reload })}><i className="bi bi-x-lg" /></button>}
      {can('comments.edit') && c.status !== 'spam' && <button className="btn btn-sm btn-light btn-icon me-1" title="Mark as spam" onClick={() => runAction(() => patch(`/comments/${c.id}/status`, { status: 'spam' }), { onDone: list.reload })}><i className="bi bi-bug" /></button>}
      {can('comments.edit') && <button className="btn btn-sm btn-light btn-icon me-1" title={c.can_comment ? 'Block user' : 'Unblock user'} onClick={() => runAction(() => post(`/comments/users/${c.user_id}/block`, { block: !!c.can_comment, mark_spam: true }), { confirmText: c.can_comment ? `Block ${c.user_name} from commenting? Their unapproved comments will be marked as spam.` : `Allow ${c.user_name} to comment again?`, variant: 'warning', onDone: list.reload })}><i className={`bi bi-person-${c.can_comment ? 'slash' : 'check'}`} /></button>}
      {can('comments.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" title="Delete" onClick={() => runAction(() => del(`/comments/${c.id}`), { confirmText: 'Delete this comment?', button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ];
  return (
    <>
      <PageHeader title="Comments" actions={<>
        <button className="btn btn-light border" onClick={() => setShowBlocked(true)}><i className="bi bi-person-slash me-1" />Blocked users</button>
        {can('settings.view') && <Link to="/admin/settings/comments" className="btn btn-light border"><i className="bi bi-gear me-1" />Comment settings</Link>}
      </>} />
      <div className="d-flex gap-2 flex-wrap mb-3">
        {[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['spam', 'Spam']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${status === k ? 'btn-primary' : 'btn-light border'}`} onClick={() => list.setFilter('status', k)}>{l}{k && counts[k] ? <span className="badge text-bg-secondary ms-1">{counts[k]}</span> : null}</button>
        ))}
      </div>
      <Panel bodyClass="" title={<SearchBox value={list.q} onChange={list.setQ} placeholder="Search text, name, email…" />}>
        {selected.length > 0 && can('comments.edit') && (
          <div className="d-flex gap-2 px-3 py-2 bg-light border-bottom flex-wrap align-items-center">
            <b className="small">{selected.length} selected</b>
            <button className="btn btn-sm btn-success" onClick={() => moderate(selected, 'approved')}>Approve</button>
            <button className="btn btn-sm btn-warning" onClick={() => moderate(selected, 'rejected')}>Reject</button>
            <button className="btn btn-sm btn-dark" onClick={() => moderate(selected, 'spam')}>Spam</button>
            {can('comments.delete') && <button className="btn btn-sm btn-danger" onClick={() => runAction(() => post('/comments/delete', { ids: selected }), { confirmText: `Delete ${selected.length} comment(s)?`, button: 'Delete', onDone: () => { setSelected([]); list.reload(); } })}>Delete</button>}
          </div>
        )}
        <DataTable columns={cols} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} selectable selected={selected} onSelect={setSelected} empty={<EmptyState icon="chat" title="No comments" />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <Modal show={showBlocked} onClose={() => setShowBlocked(false)} title="Users blocked from commenting">
        {!blocked.data?.length ? <p className="text-muted mb-0">No blocked users.</p> : blocked.data.map((u) => (
          <div key={u.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
            <span><b>{u.name}</b> <span className="small text-muted">{u.email}</span></span>
            {can('comments.edit') && <button className="btn btn-sm btn-outline-success" onClick={() => runAction(() => post(`/comments/users/${u.id}/block`, { block: false }), { onDone: () => { blocked.reload(); list.reload(); } })}>Unblock</button>}
          </div>
        ))}
      </Modal>
    </>
  );
}
