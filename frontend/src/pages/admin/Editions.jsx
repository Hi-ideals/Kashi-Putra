import { useState } from 'react';
import ActionMenu from '../../components/admin/ActionMenu';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, SearchBox } from '../../components/admin';
import { StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, del, mediaUrl } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/format';

export const STATUSES = ['draft', 'scheduled', 'published', 'unpublished', 'archived'];

/** Row action dropdown shared with Action Management. */
export function EditionActions({ e, onDone }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const act = (action, opts = {}) => runAction(() => post(`/editions/${e.id}/actions/${action}`), { ...opts, onDone });
  const items = [
    can('editions.view') && { icon: 'eye', label: 'View details', fn: () => navigate(`/admin/editions/${e.id}`) },
    e.status === 'published' && { icon: 'box-arrow-up-right', label: 'Preview on website', fn: () => window.open(`/edition/${e.slug}`, '_blank') },
    e.status !== 'published' && can('editions.view') && { icon: 'display', label: 'Preview', fn: () => navigate(`/admin/editions/${e.id}?preview=1`) },
    can('editions.edit') && { icon: 'pencil', label: 'Edit', fn: () => navigate(`/admin/editions/${e.id}/edit`) },
    can('pages.add') && { icon: 'images', label: 'Manage pages', fn: () => navigate(`/admin/editions/${e.id}#pages`) },
    can('pages.view', 'pages.edit') && { icon: 'bounding-box-circles', label: 'Area Mapping', fn: () => navigate(`/admin/editions/${e.id}/areas`) },
    { divider: true },
    e.status !== 'published' && can('editions.publish') && { icon: 'send-check', label: 'Publish now', fn: () => act('publish', { confirmText: `Publish “${e.title}” now?`, variant: 'success', button: 'Publish' }) },
    e.status === 'published' && can('editions.publish') && { icon: 'eye-slash', label: 'Unpublish', fn: () => act('unpublish', { confirmText: `Unpublish “${e.title}”? It will disappear from the website.`, variant: 'warning', button: 'Unpublish' }) },
    !['draft', 'published'].includes(e.status) && can('editions.edit') && { icon: 'pencil-square', label: 'Move to drafts', fn: () => act('draft') },
    can('editions.edit') && (e.is_active ? { icon: 'toggle-off', label: 'Deactivate', fn: () => act('deactivate') } : { icon: 'toggle-on', label: 'Activate', fn: () => act('activate') }),
    can('editions.add') && { icon: 'copy', label: 'Duplicate', fn: () => act('duplicate', { confirmText: 'Create a draft copy of this edition, including all pages?', variant: 'primary', button: 'Duplicate' }) },
    e.status !== 'archived' && can('editions.edit') && { icon: 'archive', label: 'Archive', fn: () => act('archive') },
    can('editions.delete') && { divider: true },
    can('editions.delete') && { icon: 'trash', label: 'Delete', danger: true, fn: () => runAction(() => del(`/editions/${e.id}`), { confirmText: `Delete “${e.title}”? This removes it from the website and admin lists.`, button: 'Delete', onDone }) },
  ].filter(Boolean);
  return <ActionMenu items={items} />;
}

export default function Editions() {
  const { can } = useAuth();
  const list = useAdminList('/editions', { limit: 20 });
  const { data: cats } = useFetch('/categories', { limit: 200 });
  const { data: regions } = useFetch('/areas/regions');
  const [selected, setSelected] = useState([]);
  const f = list.filters;
  const bulk = (action, opts) => runAction(() => post('/editions/bulk', { ids: selected, action }), { ...opts, onDone: () => { setSelected([]); list.reload(); } });

  const columns = [
    { key: 'cover', label: '', width: 56, render: (e) => e.cover_url ? <img className="row-thumb" src={mediaUrl(e.cover_url)} alt="" loading="lazy" /> : <div className="row-thumb d-flex align-items-center justify-content-center text-muted"><i className="bi bi-image" /></div> },
    { key: 'title', label: 'Edition', render: (e) => (<><Link to={`/admin/editions/${e.id}`} className="fw-semibold">{e.title}</Link><div className="small text-muted">{e.category_name}{e.region_name ? ` · ${e.region_name}` : ''}</div></>) },
    { key: 'edition_date', label: 'Date', render: (e) => formatDate(e.edition_date) },
    { key: 'pages', label: 'Pages', render: (e) => <span className={e.page_count ? '' : 'text-danger'}>{e.visible_page_count}/{e.page_count}</span> },
    { key: 'status', label: 'Status', render: (e) => (<><StatusBadge status={e.status} />{!e.is_active && <span className="badge text-bg-light ms-1">inactive</span>}{e.scheduled_for && <div className="small text-muted mt-1"><i className="bi bi-clock me-1" />{formatDateTime(e.scheduled_for)}</div>}</>) },
    { key: 'views', label: 'Views', render: (e) => e.view_count },
    { key: 'updated', label: 'Updated', render: (e) => <span className="small">{formatDateTime(e.updated_at)}</span> },
    { key: 'a', label: '', className: 'text-end', render: (e) => <EditionActions e={e} onDone={list.reload} /> },
  ];

  return (
    <>
      <PageHeader title="Manage Editions" actions={can('editions.add') && <Link to="/admin/editions/new" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />Add edition</Link>} />
      <div className="d-flex gap-2 flex-wrap mb-3">
        {['', ...STATUSES].map((s) => <button key={s} className={`btn btn-sm ${(f.status || '') === s ? 'btn-primary' : 'btn-light border'}`} onClick={() => list.setFilter('status', s)}>{s ? s[0].toUpperCase() + s.slice(1) : 'All'}</button>)}
      </div>
      <Panel bodyClass="" title={<div className="toolbar-filters">
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Search title or slug…" />
        <select className="form-select form-select-sm" value={f.category_id || ''} onChange={(e) => list.setFilter('category_id', e.target.value)} aria-label="Category">
          <option value="">All categories</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {regions?.length > 0 && <select className="form-select form-select-sm" value={f.region_id || ''} onChange={(e) => list.setFilter('region_id', e.target.value)} aria-label="Region"><option value="">All regions</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        <input type="date" className="form-control form-control-sm" value={f.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} aria-label="From date" title="From" />
        <input type="date" className="form-control form-control-sm" value={f.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} aria-label="To date" title="To" />
        <select className="form-select form-select-sm" value={`${f.sort || 'date'}:${f.dir || 'desc'}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); list.setFilters({ sort: s, dir: d }); }} aria-label="Sort">
          <option value="date:desc">Newest date</option><option value="date:asc">Oldest date</option><option value="created:desc">Recently created</option><option value="title:asc">Title A–Z</option><option value="views:desc">Most viewed</option>
        </select>
        <button className="btn btn-sm btn-link" onClick={list.clear}>Reset</button>
      </div>}>
        {selected.length > 0 && (
          <div className="d-flex gap-2 align-items-center flex-wrap px-3 py-2 bg-light border-bottom">
            <b className="small">{selected.length} selected</b>
            {can('editions.publish') && <><button className="btn btn-sm btn-success" onClick={() => bulk('publish', { confirmText: `Publish ${selected.length} edition(s)?`, variant: 'success', button: 'Publish' })}>Publish</button>
              <button className="btn btn-sm btn-warning" onClick={() => bulk('unpublish', { confirmText: `Unpublish ${selected.length} edition(s)?`, variant: 'warning' })}>Unpublish</button></>}
            {can('editions.edit') && <><button className="btn btn-sm btn-light border" onClick={() => bulk('activate')}>Activate</button><button className="btn btn-sm btn-light border" onClick={() => bulk('deactivate')}>Deactivate</button><button className="btn btn-sm btn-light border" onClick={() => bulk('archive')}>Archive</button></>}
            {can('editions.delete') && <button className="btn btn-sm btn-danger" onClick={() => bulk('delete', { confirmText: `Delete ${selected.length} edition(s)?`, button: 'Delete' })}>Delete</button>}
            <button className="btn btn-sm btn-link" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}
        <DataTable columns={columns} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} selectable selected={selected} onSelect={setSelected}
          empty={<EmptyState icon="journal-richtext" title="No editions found" text="Adjust the filters or create a new edition." action={can('editions.add') && <Link to="/admin/editions/new" className="btn btn-sm btn-primary">Add edition</Link>} />} />
        <Pagination meta={list.meta} onPage={list.setPage} />
      </Panel>
    </>
  );
}
