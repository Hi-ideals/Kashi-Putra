import { Link } from 'react-router-dom';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, SearchBox } from '../../components/admin';
import { StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { patch, del } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function CmsList() {
  const { can } = useAuth();
  const list = useAdminList('/cms', { limit: 50 });
  return (
    <>
      <PageHeader title="CMS Pages" actions={can('cms.add') && <Link to="/admin/cms/new" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />Create page</Link>} />
      <Panel bodyClass="" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} />
        <select className="form-select form-select-sm" value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option></select></div>}>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="file-earmark-text" title="No pages" />} columns={[
          { key: 'title', label: 'Title', render: (p) => <><Link to={`/admin/cms/${p.id}`} className="fw-semibold">{p.title}</Link><div className="small text-muted">/page/{p.slug}</div></> },
          { key: 'menus', label: 'Shown in', render: (p) => <span className="small">{[p.show_in_header && 'Header', p.show_in_footer && 'Footer'].filter(Boolean).join(', ') || '—'}</span> },
          { key: 'sort_order', label: 'Order' },
          { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status === 'published' ? 'published' : 'draft'} /> },
          { key: 'updated_at', label: 'Updated', render: (p) => <span className="small">{formatDateTime(p.updated_at)}</span> },
          { key: 'a', label: '', className: 'text-end text-nowrap', render: (p) => (<>
            <a href={`/page/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-light btn-icon me-1" title="View"><i className="bi bi-box-arrow-up-right" /></a>
            {can('cms.edit') && <button className="btn btn-sm btn-light me-1" onClick={() => runAction(() => patch(`/cms/${p.id}/toggle`), { onDone: list.reload })}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
            {can('cms.edit') && <Link to={`/admin/cms/${p.id}`} className="btn btn-sm btn-light btn-icon me-1"><i className="bi bi-pencil" /></Link>}
            {can('cms.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/cms/${p.id}`), { confirmText: `Delete “${p.title}”?`, button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
          </>) },
        ]} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
    </>
  );
}
