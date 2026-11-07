import { useState } from 'react';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction } from '../../components/admin';
import { Modal, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { patch, del } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function Messages() {
  const { can } = useAuth();
  const list = useAdminList('/cms/messages', { limit: 25 });
  const [open, setOpen] = useState(null);
  const view = (m) => { setOpen(m); if (!m.is_read) patch(`/cms/messages/${m.id}/read`).then(() => list.reload(true)); };
  return (
    <>
      <PageHeader title="Contact Messages" />
      <Panel bodyClass="">
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="envelope" title="No messages" />} columns={[
          { key: 'from', label: 'From', render: (m) => <span className={m.is_read ? '' : 'fw-bold'}>{m.name}<div className="small text-muted fw-normal">{m.email}</div></span> },
          { key: 'subject', label: 'Subject', render: (m) => <button className={`btn btn-link p-0 text-start ${m.is_read ? '' : 'fw-bold'}`} onClick={() => view(m)}>{m.subject || m.message.slice(0, 60)}</button> },
          { key: 'date', label: 'Received', render: (m) => <span className="small">{formatDateTime(m.created_at)}</span> },
          { key: 'a', label: '', className: 'text-end', render: (m) => (<>
            <a className="btn btn-sm btn-light btn-icon me-1" href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject || '')}`} title="Reply"><i className="bi bi-reply" /></a>
            {can('cms.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/cms/messages/${m.id}`), { confirmText: 'Delete this message?', button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
          </>) },
        ]} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
      <Modal show={!!open} onClose={() => setOpen(null)} title={open?.subject || 'Message'} footer={open && <a className="btn btn-primary" href={`mailto:${open.email}`}><i className="bi bi-reply me-1" />Reply by email</a>}>
        {open && (<><p className="small text-muted">{open.name} &lt;{open.email}&gt; · {formatDateTime(open.created_at)}</p><p style={{ whiteSpace: 'pre-wrap' }}>{open.message}</p></>)}
      </Modal>
    </>
  );
}
