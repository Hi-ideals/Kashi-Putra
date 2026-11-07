import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, ImageInput, runAction, SearchBox } from '../../components/admin';
import { Field, Spinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { get, put, post, toForm, API_ORIGIN } from '../../services/api';

const TYPES = [['home', 'Homepage'], ['edition', 'Editions'], ['page', 'Newspaper pages'], ['category', 'Categories'], ['cms', 'CMS pages'], ['global', 'Robots & sitemap']];
const ROBOTS = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'];

function SeoForm({ type, id, title }) {
  const { can } = useAuth();
  const [v, setV] = useState(null);
  const [file, setFile] = useState(null);
  const [remove, setRemove] = useState(false);
  useEffect(() => { setV(null); get(`/seo/${type}/${id}`).then((r) => setV(r.data)); }, [type, id]);
  if (!v) return <Spinner />;
  const s = (k) => ({ value: v[k] || '', onChange: (e) => setV({ ...v, [k]: e.target.value }), disabled: !can('seo.manage') });
  const save = () => runAction(async () => {
    const r = await put(`/seo/${type}/${id}`, toForm({ ...v, og_image: file || undefined, remove_og_image: remove ? 'true' : undefined, og_image_url: undefined, id: undefined, entity_type: undefined, entity_id: undefined, created_at: undefined, updated_at: undefined }));
    setV(r.data); setFile(null); setRemove(false); return r;
  });
  const len = (k, max) => <span className={`small ${(v[k] || '').length > max ? 'text-danger' : 'text-muted'}`}>{(v[k] || '').length}/{max}</span>;
  return (
    <div>
      <h3 className="h6 mb-3">{title}</h3>
      <div className="row g-3">
        <div className="col-lg-8">
          <Field label={<>Meta title {len('meta_title', 60)}</>}><input className="form-control" {...s('meta_title')} /></Field>
          <Field label={<>Meta description {len('meta_description', 160)}</>}><textarea className="form-control" rows="3" {...s('meta_description')} /></Field>
          <Field label="Meta keywords" help="Comma separated"><input className="form-control" {...s('meta_keywords')} /></Field>
          <div className="row g-2">
            <div className="col-md-6"><Field label="Open Graph title"><input className="form-control" {...s('og_title')} /></Field></div>
            <div className="col-md-6"><Field label="Robots"><select className="form-select" {...s('robots')}>{ROBOTS.map((r) => <option key={r}>{r}</option>)}</select></Field></div>
          </div>
          <Field label="Open Graph description"><textarea className="form-control" rows="2" {...s('og_description')} /></Field>
          <Field label="Canonical URL" help="Leave empty to use the page URL"><input className="form-control" {...s('canonical_url')} /></Field>
        </div>
        <div className="col-lg-4">
          <Field label="Social sharing image" help="1200×630 recommended"><ImageInput url={remove ? null : v.og_image_url} file={file} onFile={(f) => { setFile(f); setRemove(!f); }} /></Field>
          <div className="border rounded p-2 small bg-light">
            <div className="text-muted mb-1">Search preview</div>
            <div style={{ color: '#1a0dab', fontSize: 16 }}>{v.meta_title || title}</div>
            <div style={{ color: '#4d5156' }}>{(v.meta_description || 'No description').slice(0, 160)}</div>
          </div>
        </div>
      </div>
      {can('seo.manage') && <button className="btn btn-primary mt-2" onClick={save}>Save SEO</button>}
    </div>
  );
}

function GlobalSeo() {
  const { can } = useAuth();
  const [v, setV] = useState(null);
  useEffect(() => { get('/settings/website').then((r) => setV(r.data)); }, []);
  if (!v) return <Spinner />;
  return (
    <div className="row g-3">
      <div className="col-lg-7">
        <Field label="robots.txt" help="Served at /robots.txt. The sitemap line is added automatically when the sitemap is enabled."><textarea className="form-control font-monospace" rows="8" value={v.robots_txt} onChange={(e) => setV({ ...v, robots_txt: e.target.value })} disabled={!can('settings.manage')} /></Field>
        <div className="form-check form-switch mb-3"><input id="sm" className="form-check-input" type="checkbox" checked={v.sitemap_enabled} onChange={(e) => setV({ ...v, sitemap_enabled: e.target.checked })} disabled={!can('settings.manage')} /><label htmlFor="sm" className="form-check-label">Enable XML sitemap</label></div>
        {can('settings.manage') && <button className="btn btn-primary" onClick={() => runAction(() => put('/settings/website', toForm({ robots_txt: v.robots_txt, sitemap_enabled: v.sitemap_enabled })))}>Save</button>}
      </div>
      <div className="col-lg-5">
        <Panel title="XML sitemap">
          <p className="small text-muted">Includes the homepage, published editions and their pages, categories and CMS pages. It updates automatically every 10 minutes.</p>
          <div className="d-flex gap-2 flex-wrap">
            <a href={`${API_ORIGIN}/sitemap.xml`} target="_blank" rel="noreferrer" className="btn btn-sm btn-light border"><i className="bi bi-filetype-xml me-1" />View sitemap.xml</a>
            <a href={`${API_ORIGIN}/robots.txt`} target="_blank" rel="noreferrer" className="btn btn-sm btn-light border">View robots.txt</a>
            {can('seo.manage') && <button className="btn btn-sm btn-outline-primary" onClick={() => runAction(() => post('/seo/sitemap/regenerate'))}><i className="bi bi-arrow-repeat me-1" />Regenerate now</button>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function Seo() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || 'home';
  const id = Number(params.get('id')) || 0;
  const [q, setQ] = useState('');
  const { data: items, loading } = useFetch(['home', 'global'].includes(type) ? null : '/seo/overview', { type }, [type]);
  const list = (items || []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  const current = list.find((i) => i.id === id) || (items || []).find((i) => i.id === id);
  return (
    <>
      <PageHeader title="SEO Settings" />
      <ul className="nav nav-pills mb-3 gap-1">
        {TYPES.map(([k, l]) => <li key={k} className="nav-item"><button className={`nav-link ${type === k ? 'active' : 'bg-white border'}`} onClick={() => setParams({ type: k })}>{l}</button></li>)}
      </ul>
      {type === 'home' ? <Panel><SeoForm type="home" id={0} title="Homepage" /></Panel>
        : type === 'global' ? <Panel><GlobalSeo /></Panel> : (
          <div className="row g-3">
            <div className="col-lg-4">
              <Panel title={<SearchBox value={q} onChange={setQ} />} bodyClass="p-0">
                <div className="list-group list-group-flush" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {loading ? <Spinner /> : list.map((i) => (
                    <button key={i.id} className={`list-group-item list-group-item-action small d-flex justify-content-between ${i.id === id ? 'active' : ''}`} onClick={() => setParams({ type, id: i.id })}>
                      <span className="text-truncate">{i.name}</span>{i.has_seo && <i className="bi bi-check-circle-fill ms-2" title="Custom SEO set" />}
                    </button>
                  ))}
                  {!loading && !list.length && <div className="p-3 small text-muted">Nothing found.</div>}
                </div>
              </Panel>
            </div>
            <div className="col-lg-8"><Panel>{id ? <SeoForm type={type} id={id} title={current?.name || `#${id}`} /> : <p className="text-muted mb-0">Select an item on the left. Items without custom SEO use automatic titles and descriptions.</p>}</Panel></div>
          </div>
        )}
    </>
  );
}
