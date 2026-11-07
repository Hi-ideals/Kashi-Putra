import { PageHeader, Panel, DataTable, Pagination, useAdminList, SearchBox } from '../../components/admin';
import { EmptyState } from '../../components/common';
import { formatDateTime } from '../../utils/format';

export default function AuditLogs() {
  const list = useAdminList('/admin/audit-logs', { limit: 30 });
  const f = list.filters;
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every important action in the system is recorded here." />
      <Panel bodyClass="" title={<div className="toolbar-filters"><SearchBox value={list.q} onChange={list.setQ} placeholder="Action, user, IP…" />
        <select className="form-select form-select-sm" value={f.entity_type || ''} onChange={(e) => list.setFilter('entity_type', e.target.value)}><option value="">All types</option>{(list.meta?.entity_types || []).map((t) => <option key={t}>{t}</option>)}</select>
        <input type="date" className="form-control form-control-sm" value={f.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" className="form-control form-control-sm" value={f.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        <button className="btn btn-sm btn-link" onClick={list.clear}>Reset</button></div>}>
        <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="clock-history" title="No log entries" />} columns={[
          { key: 'created_at', label: 'When', render: (a) => <span className="small text-nowrap">{formatDateTime(a.created_at)}</span> },
          { key: 'user', label: 'User', render: (a) => <span className="small">{a.user_name || <i className="text-muted">System</i>}<div className="text-muted">{a.user_email}</div></span> },
          { key: 'action', label: 'Action', render: (a) => <code className="small">{a.action}</code> },
          { key: 'entity', label: 'Entity', render: (a) => <span className="small">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</span> },
          { key: 'details', label: 'Details', render: (a) => a.details ? <div className="json-details">{typeof a.details === 'string' ? a.details : JSON.stringify(a.details)}</div> : '' },
          { key: 'ip', label: 'IP / device', render: (a) => <span className="small text-muted" title={a.user_agent}>{a.ip_address}</span> },
        ]} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
    </>
  );
}
