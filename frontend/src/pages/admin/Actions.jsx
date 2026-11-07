import { useEffect, useState } from 'react';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, Switch, SearchBox } from '../../components/admin';
import { StatusBadge, Spinner } from '../../components/common';
import { EditionActions, STATUSES } from './Editions';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { get, post, put, toForm } from '../../services/api';
import { formatDate } from '../../utils/format';

const VIEWER_ACTIONS = [
  ['action_crop', 'Crop / clip articles', 'scissors'], ['action_share', 'Share buttons', 'share'], ['action_download', 'Download page', 'download'],
  ['action_print', 'Print page', 'printer'], ['action_zoom', 'Zoom controls', 'zoom-in'], ['action_fullscreen', 'Full screen', 'arrows-fullscreen'],
  ['action_thumbnails', 'Page thumbnails', 'grid-3x3-gap'], ['action_page_select', 'Page number selector', 'list-ol'], ['action_archive', 'Archive / previous editions', 'calendar3'],
];

/** Action Management: (1) which reader actions are available on the website, (2) bulk edition actions. */
export default function Actions() {
  const { can } = useAuth();
  const { reload: reloadSite } = useSettings();
  const [cfg, setCfg] = useState(null);
  const list = useAdminList(can('editions.view') ? '/editions' : null, { limit: 15 });
  const [selected, setSelected] = useState([]);
  useEffect(() => { if (can('settings.view')) get('/settings/website').then((r) => setCfg(r.data)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k, v) => runAction(async () => { const r = await put('/settings/website', toForm({ [k]: v })); setCfg(r.data); reloadSite(); return r; }, { success: 'Action updated' });
  const bulk = (action, opts) => runAction(() => post('/editions/bulk', { ids: selected, action }), { ...opts, onDone: () => { setSelected([]); list.reload(); } });

  return (
    <>
      <PageHeader title="Action Management" subtitle="Control reader actions on the website and run actions on editions." />
      {can('settings.view') && (
        <Panel title="Reader toolbar actions" className="mb-3">
          {!cfg ? <Spinner size="sm" /> : (
            <div className="row">
              {VIEWER_ACTIONS.map(([k, label, icon]) => (
                <div key={k} className="col-sm-6 col-lg-4">
                  <div className="d-flex align-items-center gap-2 border rounded p-2 mb-2">
                    <i className={`bi bi-${icon} fs-5 text-primary`} />
                    <div className="flex-grow-1 small fw-semibold">{label}</div>
                    <div className="form-check form-switch m-0"><input className="form-check-input" type="checkbox" role="switch" checked={!!cfg[k]} disabled={!can('settings.manage')} onChange={(e) => toggle(k, e.target.checked)} aria-label={label} /></div>
                  </div>
                </div>
              ))}
              <div className="col-12 small text-muted">Download and print can also be switched off per edition (Edit edition → Reader options).</div>
            </div>
          )}
        </Panel>
      )}
      {can('editions.view') && (
        <Panel bodyClass="" title={<div className="toolbar-filters"><b className="me-2">Edition actions</b><SearchBox value={list.q} onChange={list.setQ} />
          <select className="form-select form-select-sm" value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}>
          <div className="d-flex gap-2 align-items-center flex-wrap px-3 py-2 bg-light border-bottom">
            <b className="small">{selected.length} selected</b>
            {can('editions.publish') && <><button disabled={!selected.length} className="btn btn-sm btn-success" onClick={() => bulk('publish', { confirmText: `Publish ${selected.length} edition(s)?`, variant: 'success', button: 'Publish' })}><i className="bi bi-send-check me-1" />Publish</button>
              <button disabled={!selected.length} className="btn btn-sm btn-warning" onClick={() => bulk('unpublish', { confirmText: `Unpublish ${selected.length} edition(s)?`, variant: 'warning', button: 'Unpublish' })}><i className="bi bi-eye-slash me-1" />Unpublish</button></>}
            {can('editions.edit') && <><button disabled={!selected.length} className="btn btn-sm btn-light border" onClick={() => bulk('activate')}><i className="bi bi-toggle-on me-1" />Activate</button>
              <button disabled={!selected.length} className="btn btn-sm btn-light border" onClick={() => bulk('deactivate')}><i className="bi bi-toggle-off me-1" />Deactivate</button>
              <button disabled={!selected.length} className="btn btn-sm btn-light border" onClick={() => bulk('archive')}><i className="bi bi-archive me-1" />Archive</button></>}
            {can('editions.add') && <button disabled={!selected.length} className="btn btn-sm btn-light border" onClick={() => bulk('duplicate', { confirmText: `Duplicate ${selected.length} edition(s) as drafts?`, variant: 'primary', button: 'Duplicate' })}><i className="bi bi-copy me-1" />Duplicate</button>}
            {can('editions.delete') && <button disabled={!selected.length} className="btn btn-sm btn-danger" onClick={() => bulk('delete', { confirmText: `Delete ${selected.length} edition(s)?`, button: 'Delete' })}><i className="bi bi-trash me-1" />Delete</button>}
          </div>
          <DataTable selectable selected={selected} onSelect={setSelected} rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload}
            columns={[
              { key: 'title', label: 'Edition', render: (e) => <><b>{e.title}</b><div className="small text-muted">{e.category_name}</div></> },
              { key: 'date', label: 'Date', render: (e) => formatDate(e.edition_date) },
              { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} /> },
              { key: 'active', label: 'Active', render: (e) => can('editions.edit') ? <Switch checked={e.is_active} onChange={(v) => runAction(() => post(`/editions/${e.id}/actions/${v ? 'activate' : 'deactivate'}`), { onDone: list.reload })} id={`act-${e.id}`} /> : (e.is_active ? 'Yes' : 'No') },
              { key: 'a', label: '', className: 'text-end', render: (e) => <EditionActions e={e} onDone={list.reload} /> },
            ]} />
          <Pagination meta={list.meta} onPage={list.setPage} />
        </Panel>
      )}
    </>
  );
}
