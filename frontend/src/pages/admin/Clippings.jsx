import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction } from '../../components/admin';
import { EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { del, mediaUrl } from '../../services/api';
import { formatDateTime } from '../../utils/format';

export default function Clippings() {
  const { can } = useAuth();
  const list = useAdminList('/clippings', { limit: 20 });
  return (
    <>
      <PageHeader title="Shared Clippings" subtitle="Articles readers have cropped and shared." />
      <Panel bodyClass="">
        <DataTable rowKey="code" rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="scissors" title="No clippings yet" />} columns={[
          { key: 'img', label: 'Clip', render: (c) => <img src={mediaUrl(c.image_url)} alt="" style={{ maxWidth: 140, maxHeight: 90, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4 }} loading="lazy" /> },
          { key: 'edition', label: 'Edition', render: (c) => <>{c.edition_title}<div className="small text-muted">Page {c.page_number}</div></> },
          { key: 'views', label: 'Views', render: (c) => c.view_count },
          { key: 'date', label: 'Created', render: (c) => <span className="small">{formatDateTime(c.created_at)}</span> },
          { key: 'a', label: '', className: 'text-end text-nowrap', render: (c) => (<>
            <a href={`/clip/${c.code}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-light btn-icon me-1"><i className="bi bi-box-arrow-up-right" /></a>
            {can('editions.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/clippings/${c.code}`), { confirmText: 'Delete this clipping? Shared links will stop working.', button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>}
          </>) },
        ]} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
    </>
  );
}
