import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, runAction } from '../../components/admin';
import { Spinner, ErrorState, Field, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { get, post, put, del, mediaUrl } from '../../services/api';
import { formatDate } from '../../utils/format';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HANDLES = ['nw', 'ne', 'sw', 'se'];

/** Draw / move / resize article areas on one newspaper page. */
function AreaCanvas({ page, areas, selectedId, onSelect, onCreate, onChangeGeom, editable }) {
  const ref = useRef(null);
  const g = useRef(null);
  const [draft, setDraft] = useState(null);
  const [live, setLive] = useState(null); // geometry of the area being moved/resized

  const frac = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { fx: clamp((e.clientX - r.left) / r.width, 0, 1), fy: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };

  const down = (e) => {
    if (!editable || e.button > 0) return;
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    const p = frac(e);
    const handle = e.target.dataset.handle;
    const id = Number(e.target.closest('[data-area]')?.dataset.area);
    if (id) {
      const a = areas.find((x) => x.id === id);
      onSelect(id);
      g.current = { type: handle ? 'resize' : 'move', handle, start: p, orig: { ...a }, id, moved: false };
      return;
    }
    onSelect(null);
    g.current = { type: 'draw', start: p };
    setDraft({ x: p.fx, y: p.fy, w: 0, h: 0 });
  };

  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const p = frac(e);
    if (s.type === 'draw') {
      setDraft({ x: Math.min(s.start.fx, p.fx), y: Math.min(s.start.fy, p.fy), w: Math.abs(p.fx - s.start.fx), h: Math.abs(p.fy - s.start.fy) });
      return;
    }
    const dx = p.fx - s.start.fx; const dy = p.fy - s.start.fy;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) s.moved = true;
    let { x, y, w, h } = s.orig;
    if (s.type === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h); }
    else {
      let l = x; let t = y; let r = x + w; let b = y + h;
      if (s.handle.includes('w')) l = clamp(p.fx, 0, r - 0.01);
      if (s.handle.includes('e')) r = clamp(p.fx, l + 0.01, 1);
      if (s.handle.includes('n')) t = clamp(p.fy, 0, b - 0.005);
      if (s.handle.includes('s')) b = clamp(p.fy, t + 0.005, 1);
      x = l; y = t; w = r - l; h = b - t;
    }
    setLive({ id: s.id, x, y, w, h });
  };

  const up = () => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    if (s.type === 'draw') {
      const d = draft; setDraft(null);
      if (d && d.w > 0.015 && d.h > 0.008) onCreate(d);
      return;
    }
    if (s.moved && live) onChangeGeom(s.id, { x: live.x, y: live.y, w: live.w, h: live.h });
    setLive(null);
  };

  const box = (a) => (live && live.id === a.id ? { ...a, ...live } : a);
  const pct = (a) => ({ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` });
  const img = page.images.large || page.images.medium;

  return (
    <div ref={ref} className={`am-canvas ${editable ? 'editable' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ aspectRatio: `${img?.width || 1000} / ${img?.height || 1414}` }}>
      <img src={mediaUrl(img?.url)} alt={`Page ${page.page_number}`} draggable={false} />
      {areas.map((a, i) => {
        const b = box(a);
        return (
          <div key={a.id} data-area={a.id} className={`am-box ${selectedId === a.id ? 'selected' : ''}`} style={pct(b)} title={a.title || `Area ${i + 1}`}>
            <span className="am-num">{i + 1}</span>
            {selectedId === a.id && editable && HANDLES.map((h) => <span key={h} data-handle={h} className={`am-handle h-${h}`} />)}
          </div>
        );
      })}
      {draft && <div className="am-box draft" style={pct(draft)} />}
    </div>
  );
}

export default function AreaMapping() {
  const { id } = useParams();
  const { can } = useAuth();
  const editable = can('pages.edit');
  const [params, setParams] = useSearchParams();
  const { data: ed, loading, error, reload } = useFetch(`/editions/${id}`, null, [id]);
  const [areas, setAreas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [copyFrom, setCopyFrom] = useState('');

  const loadAreas = () => get(`/page-areas/edition/${id}`).then((r) => setAreas(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { loadAreas(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = ed?.pages || [];
  const pageId = Number(params.get('page')) || pages[0]?.id;
  const page = pages.find((p) => p.id === pageId) || pages[0];
  const pageAreas = useMemo(() => areas.filter((a) => a.page_id === page?.id).sort((a, b) => a.y - b.y || a.x - b.x), [areas, page?.id]);
  const selected = areas.find((a) => a.id === selectedId) || null;

  useEffect(() => { setForm(selected ? { title: selected.title || '', description: selected.description || '', link_url: selected.link_url || '' } : null); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedId(null); }, [page?.id]);

  // Keyboard: Delete removes the selected area, Esc deselects
  useEffect(() => {
    const k = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'Escape') setSelectedId(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && editable) { e.preventDefault(); removeArea(selectedId); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const createArea = async (g) => {
    try {
      const r = await post('/page-areas', { page_id: page.id, ...g, title: '' });
      setAreas((list) => [...list, r.data]);
      setSelectedId(r.data.id);
      toast.success('Area added — give it a title');
    } catch (e) { toast.error(e.message); }
  };
  const changeGeom = async (aid, g) => {
    setAreas((list) => list.map((a) => (a.id === aid ? { ...a, ...g } : a)));
    try { await put(`/page-areas/${aid}`, g); } catch (e) { toast.error(e.message); loadAreas(); }
  };
  const saveForm = async () => {
    try { const r = await put(`/page-areas/${selected.id}`, form); setAreas((list) => list.map((a) => (a.id === r.data.id ? r.data : a))); toast.success('Area saved'); } catch (e) { toast.error(e.message); }
  };
  const removeArea = (aid) => runAction(() => del(`/page-areas/${aid}`), { onDone: () => { setAreas((list) => list.filter((a) => a.id !== aid)); setSelectedId(null); } });

  if (loading && !ed) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const countFor = (pid) => areas.filter((a) => a.page_id === pid).length;

  return (
    <>
      <PageHeader title="Area Mapping" crumbs={[{ label: 'Editions', to: '/admin/editions' }, { label: ed.title, to: `/admin/editions/${ed.id}` }]}
        subtitle={`${ed.title} · ${formatDate(ed.edition_date)} · ${areas.length} mapped article(s)`}
        actions={ed.status === 'published' && page && <a className="btn btn-light border" href={`/edition/${ed.slug}${page.position > 1 ? `/page/${page.position}` : ''}`} target="_blank" rel="noreferrer"><i className="bi bi-box-arrow-up-right me-1" />View on website</a>} />
      {!pages.length ? <Panel><EmptyState icon="images" title="This edition has no pages yet" action={<Link to={`/admin/publish/${ed.id}`} className="btn btn-primary btn-sm">Upload pages</Link>} /></Panel> : (
        <div className="row g-3">
          <div className="col-xl-2 col-lg-3">
            <Panel title="Pages" bodyClass="p-2">
              <div className="am-pages">
                {pages.map((p) => (
                  <button key={p.id} type="button" className={`am-page ${p.id === page.id ? 'active' : ''}`} onClick={() => setParams({ page: p.id })}>
                    <img src={mediaUrl(p.images.thumb?.url)} alt="" loading="lazy" />
                    <span>Page {p.page_number}</span>
                    {countFor(p.id) > 0 && <span className="badge text-bg-primary am-count">{countFor(p.id)}</span>}
                  </button>
                ))}
              </div>
            </Panel>
          </div>
          <div className="col-xl-7 col-lg-9">
            <Panel title={`Page ${page.page_number}${page.title && page.title !== `Page ${page.page_number}` ? ` – ${page.title}` : ''}`}
              actions={editable && <span className="small text-muted"><i className="bi bi-mouse me-1" />Drag on the page to draw an article area</span>} bodyClass="p-2">
              <AreaCanvas page={page} areas={pageAreas} selectedId={selectedId} onSelect={setSelectedId} onCreate={createArea} onChangeGeom={changeGeom} editable={editable} />
            </Panel>
          </div>
          <div className="col-xl-3">
            <Panel title={selected ? `Area ${pageAreas.findIndex((a) => a.id === selected.id) + 1}` : 'Article details'} className="mb-3 am-side">
              {!form ? <p className="small text-muted mb-0">Select an area on the page to edit it, or drag on the page to draw a new one. Readers can click mapped areas to open the article.</p> : (
                <>
                  <Field label="Article title"><input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Headline of this article" disabled={!editable} autoFocus /></Field>
                  <Field label="Description"><textarea className="form-control" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!editable} /></Field>
                  <Field label="Link (optional)" help="Opens this link instead of the article view, e.g. /edition/…/page/5 for a continued story"><input className="form-control" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://… or /edition/…" disabled={!editable} /></Field>
                  {editable && (
                    <div className="d-flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={saveForm}><i className="bi bi-check2 me-1" />Save</button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => removeArea(selected.id)}><i className="bi bi-trash me-1" />Delete</button>
                      <button className="btn btn-light btn-sm ms-auto" onClick={() => setSelectedId(null)}>Close</button>
                    </div>
                  )}
                </>
              )}
            </Panel>
            <Panel title={`Areas on this page (${pageAreas.length})`} bodyClass="p-2" className="mb-3">
              {!pageAreas.length ? <p className="small text-muted mb-0 p-2">No areas yet.</p> : (
                <div className="list-group list-group-flush small">
                  {pageAreas.map((a, i) => (
                    <button key={a.id} className={`list-group-item list-group-item-action d-flex gap-2 align-items-center ${a.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(a.id)}>
                      <span className="badge text-bg-dark">{i + 1}</span><span className="text-truncate">{a.title || <i className="opacity-75">Untitled area</i>}</span>
                      {a.link_url && <i className="bi bi-link-45deg ms-auto" title="Has link" />}
                    </button>
                  ))}
                </div>
              )}
            </Panel>
            {editable && pages.length > 1 && (
              <Panel title="Copy areas">
                <div className="input-group input-group-sm">
                  <select className="form-select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                    <option value="">From page…</option>
                    {pages.filter((p) => p.id !== page.id && countFor(p.id)).map((p) => <option key={p.id} value={p.id}>Page {p.page_number} ({countFor(p.id)})</option>)}
                  </select>
                  <button className="btn btn-outline-primary" disabled={!copyFrom} onClick={() => runAction(() => post('/page-areas/copy', { from_page_id: Number(copyFrom), to_page_id: page.id }), { onDone: () => { setCopyFrom(''); loadAreas(); } })}>Copy here</button>
                </div>
                <div className="form-text">Useful when pages share the same layout.</div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
