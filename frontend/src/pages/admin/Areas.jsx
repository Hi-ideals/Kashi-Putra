import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, runAction, SearchBox } from '../../components/admin';
import { Modal, Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useDebounce, useFetch } from '../../hooks';
import { post, put, patch, del } from '../../services/api';

const TABS = [
  { key: 'mappings', label: 'Location mappings', icon: 'diagram-3' },
  { key: 'states', label: 'States', icon: 'map' },
  { key: 'districts', label: 'Districts', icon: 'pin-map' },
  { key: 'cities', label: 'Cities', icon: 'buildings' },
  { key: 'regions', label: 'Regions', icon: 'bounding-box' },
];

function EntityTab({ entity }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [parent, setParent] = useState('');
  const { data: states } = useFetch('/areas/states');
  const { data: districts } = useFetch(['cities'].includes(entity) ? '/areas/districts' : null);
  const params = { q: dq, ...(entity === 'districts' || entity === 'regions' ? { state_id: parent } : {}), ...(entity === 'cities' ? { district_id: parent } : {}) };
  const { data, loading, error, reload } = useFetch(`/areas/${entity}`, params);
  const [edit, setEdit] = useState(null);
  const [errors, setErrors] = useState({});
  const save = async () => {
    setErrors({});
    try { const r = edit.id ? await put(`/areas/${entity}/${edit.id}`, edit) : await post(`/areas/${entity}`, edit); toast.success(r.message); setEdit(null); reload(); }
    catch (e) { setErrors(e.errors || {}); toast.error(e.message); }
  };
  const label = TABS.find((t) => t.key === entity).label.replace(/s$/, '');
  const cols = [
    { key: 'name', label: 'Name', render: (r) => <b>{r.name}</b> },
    entity === 'states' && { key: 'code', label: 'Code' },
    (entity === 'districts' || entity === 'regions') && { key: 'state_name', label: 'State', render: (r) => r.state_name || '—' },
    entity === 'cities' && { key: 'district_name', label: 'District', render: (r) => `${r.district_name}, ${r.state_name}` },
    entity === 'regions' && { key: 'description', label: 'Description', render: (r) => <span className="small text-muted">{r.description}</span> },
    r0(entity) && { key: 'child_count', label: entity === 'states' ? 'Districts' : 'Cities' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (r) => (<>
      {can('areas.edit') && <button className="btn btn-sm btn-light btn-icon me-1" title="Enable / disable" onClick={() => runAction(() => patch(`/areas/${entity}/${r.id}/toggle`), { onDone: reload })}><i className={`bi bi-toggle-${r.status === 'active' ? 'on text-success' : 'off'}`} /></button>}
      {can('areas.edit') && <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => { setEdit({ ...r }); setErrors({}); }}><i className="bi bi-pencil" /></button>}
      {can('areas.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/areas/${entity}/${r.id}`), { confirmText: `Delete ${r.name}? Child locations and mappings will also be removed.`, button: 'Delete', onDone: reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ].filter(Boolean);
  return (
    <Panel bodyClass="" title={<div className="toolbar-filters">
      <SearchBox value={q} onChange={setQ} />
      {(entity === 'districts' || entity === 'regions') && <select className="form-select form-select-sm" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">All states</option>{(states || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      {entity === 'cities' && <select className="form-select form-select-sm" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">All districts</option>{(districts || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
    </div>} actions={can('areas.add') && <button className="btn btn-sm btn-primary" onClick={() => { setEdit({ name: '', status: 'active', state_id: entity === 'districts' || entity === 'regions' ? parent : '', district_id: entity === 'cities' ? parent : '' }); setErrors({}); }}><i className="bi bi-plus-lg me-1" />Add {label.toLowerCase()}</button>}>
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon="geo" title={`No ${entity}`} />} />
      <Modal show={!!edit} onClose={() => setEdit(null)} title={`${edit?.id ? 'Edit' : 'Add'} ${label.toLowerCase()}`} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {edit && (<>
          <Field label="Name" error={errors.name} required><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
          {entity === 'states' && <Field label="Code"><input className="form-control" value={edit.code || ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} maxLength={10} /></Field>}
          {(entity === 'districts' || entity === 'regions') && <Field label="State" required={entity === 'districts'}><select className="form-select" value={edit.state_id || ''} onChange={(e) => setEdit({ ...edit, state_id: e.target.value })}><option value="">{entity === 'regions' ? '— Any —' : 'Select…'}</option>{(states || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
          {entity === 'cities' && <Field label="District" required><select className="form-select" value={edit.district_id || ''} onChange={(e) => setEdit({ ...edit, district_id: e.target.value })}><option value="">Select…</option>{(districts || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
          {entity === 'regions' && <Field label="Description"><input className="form-control" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
          <Field label="Status"><select className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Enabled</option><option value="inactive">Disabled</option></select></Field>
        </>)}
      </Modal>
    </Panel>
  );
}
const r0 = (e) => e === 'states' || e === 'districts';

function MappingsTab() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const { data, loading, error, reload } = useFetch('/areas/mappings', { q: dq });
  const { data: states } = useFetch('/areas/states');
  const { data: districts } = useFetch('/areas/districts');
  const { data: cities } = useFetch('/areas/cities');
  const { data: regions } = useFetch('/areas/regions');
  const { data: cats } = useFetch('/categories', { limit: 200 });
  const { data: eds } = useFetch('/editions', { limit: 100 });
  const [edit, setEdit] = useState(null);
  const save = async () => {
    try { const r = edit.id ? await put(`/areas/mappings/${edit.id}`, edit) : await post('/areas/mappings', edit); toast.success(r.message); setEdit(null); reload(); } catch (e) { toast.error(e.message); }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value, ...(k === 'state_id' ? { district_id: '', city_id: '' } : {}), ...(k === 'district_id' ? { city_id: '' } : {}) });
  const cols = [
    { key: 'location_name', label: 'Location', render: (m) => <b>{m.location_name}</b> },
    { key: 'where', label: 'State / District / City', render: (m) => <span className="small">{[m.state_name, m.district_name, m.city_name].filter(Boolean).join(' › ') || '—'}</span> },
    { key: 'region_name', label: 'Region', render: (m) => m.region_name || '—' },
    { key: 'category_name', label: 'Category', render: (m) => m.category_name || '—' },
    { key: 'edition_title', label: 'Edition', render: (m) => m.edition_title ? <span className="small">{m.edition_title} ({m.edition_date})</span> : '—' },
    { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (m) => (<>
      {can('areas.edit') && <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => runAction(() => patch(`/areas/mappings/${m.id}/toggle`), { onDone: reload })}><i className={`bi bi-toggle-${m.status === 'active' ? 'on text-success' : 'off'}`} /></button>}
      {can('areas.edit') && <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => setEdit({ ...m })}><i className="bi bi-pencil" /></button>}
      {can('areas.delete') && <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/areas/mappings/${m.id}`), { confirmText: 'Delete this mapping?', button: 'Delete', onDone: reload })}><i className="bi bi-trash" /></button>}
    </>) },
  ];
  return (
    <Panel bodyClass="" title={<SearchBox value={q} onChange={setQ} placeholder="Search locations…" />} actions={can('areas.add') && <button className="btn btn-sm btn-primary" onClick={() => setEdit({ location_name: '', status: 'active', sort_order: 0 })}><i className="bi bi-plus-lg me-1" />Add mapping</button>}>
      <div className="px-3 pt-3 small text-muted">Map a location to an edition category (e.g. “Kalaburagi” → “Kalaburagi Edition”). Readers can then pick their district on the website to open the right edition.</div>
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon="diagram-3" title="No mappings yet" />} />
      <Modal show={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Edit mapping' : 'Add mapping'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {edit && (
          <div className="row g-2">
            <div className="col-md-8"><Field label="Location name" required><input className="form-control" value={edit.location_name} onChange={set('location_name')} /></Field></div>
            <div className="col-md-4"><Field label="Sort order"><input type="number" className="form-control" value={edit.sort_order} onChange={set('sort_order')} /></Field></div>
            <div className="col-md-4"><Field label="State"><select className="form-select" value={edit.state_id || ''} onChange={set('state_id')}><option value="">—</option>{(states || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="District"><select className="form-select" value={edit.district_id || ''} onChange={set('district_id')}><option value="">—</option>{(districts || []).filter((d) => !edit.state_id || String(d.state_id) === String(edit.state_id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="City"><select className="form-select" value={edit.city_id || ''} onChange={set('city_id')}><option value="">—</option>{(cities || []).filter((c) => !edit.district_id || String(c.district_id) === String(edit.district_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="Region"><select className="form-select" value={edit.region_id || ''} onChange={set('region_id')}><option value="">—</option>{(regions || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="Edition category"><select className="form-select" value={edit.category_id || ''} onChange={set('category_id')}><option value="">—</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="Specific edition"><select className="form-select" value={edit.edition_id || ''} onChange={set('edition_id')}><option value="">—</option>{(eds || []).map((e) => <option key={e.id} value={e.id}>{e.title} ({e.edition_date})</option>)}</select></Field></div>
            <div className="col-md-4"><Field label="Status"><select className="form-select" value={edit.status} onChange={set('status')}><option value="active">Enabled</option><option value="inactive">Disabled</option></select></Field></div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

export default function Areas() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'mappings';
  return (
    <>
      <PageHeader title="Location Mapping" subtitle="States, districts, cities and regions used to pick regional editions. To map articles on newspaper pages, use Actions → Area Mapping on an edition." />
      <ul className="nav nav-pills mb-3 gap-1">
        {TABS.map((t) => <li key={t.key} className="nav-item"><button className={`nav-link ${tab === t.key ? 'active' : 'bg-white border'}`} onClick={() => setParams({ tab: t.key })}><i className={`bi bi-${t.icon} me-1`} />{t.label}</button></li>)}
      </ul>
      {tab === 'mappings' ? <MappingsTab /> : <EntityTab key={tab} entity={tab} />}
    </>
  );
}
