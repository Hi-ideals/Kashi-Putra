import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, Switch } from '../../components/admin';
import PagesManager from '../../components/admin/PagesManager';
import { Spinner, StatusBadge } from '../../components/common';
import { useFetch } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { get, post, mediaUrl } from '../../services/api';
import { formatDate, toLocalInput, fromLocalInput } from '../../utils/format';

const STEPS = ['Select edition', 'Upload & arrange pages', 'Preview & validate', 'Publish'];

export default function Publish() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [step, setStep] = useState(id ? 1 : 0);
  const [edition, setEdition] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [validation, setValidation] = useState(null);
  const [mode, setMode] = useState('now');
  const [publishAt, setPublishAt] = useState(toLocalInput(new Date(Date.now() + 3600e3)));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const { data: candidates } = useFetch(step === 0 ? '/editions' : null, { limit: 100, sort: 'date', dir: 'desc' });

  const load = async (eid) => {
    setLoading(true);
    try { const r = await get(`/editions/${eid}`); setEdition(r.data); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { if (id) load(id); }, [id]);
  useEffect(() => {
    if (step === 2 && edition) { setValidation(null); get(`/pages/edition/${edition.id}/validate`).then((r) => setValidation(r.data)).catch((e) => toast.error(e.message)); }
  }, [step, edition?.id, edition?.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    setBusy(true);
    try {
      if (mode === 'now') {
        const r = await post(`/editions/${edition.id}/actions/publish`); toast.success('Edition published'); setDone({ type: 'published', edition: r.data });
      } else if (mode === 'schedule') {
        const r = await post('/schedules', { edition_id: edition.id, publish_at: fromLocalInput(publishAt), notify_on_publish: notify }); toast.success(r.message); setDone({ type: 'scheduled', at: publishAt });
      } else {
        await post(`/editions/${edition.id}/actions/draft`); toast.success('Saved as draft'); setDone({ type: 'draft' });
      }
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const pick = (eid) => { navigate(`/admin/publish/${eid}`); setStep(1); };
  const visible = edition?.pages?.filter((p) => p.is_visible) || [];

  return (
    <>
      <PageHeader title="Publish Edition" crumbs={[{ label: 'Editions', to: '/admin/editions' }]} subtitle={edition && <>{edition.title} · {formatDate(edition.edition_date)} · <StatusBadge status={edition.status} /></>} />
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={`st ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} disabled={!edition && i > 0} onClick={() => !done && (edition || i === 0) && setStep(i)}>
            <span className="n">{i < step ? <i className="bi bi-check" /> : i + 1}</span>{s}
          </button>
        ))}
      </div>

      {done ? (
        <Panel>
          <div className="text-center py-4">
            <i className={`bi ${done.type === 'published' ? 'bi-check-circle text-success' : done.type === 'scheduled' ? 'bi-calendar-check text-info' : 'bi-save text-secondary'} display-4`} />
            <h2 className="h4 mt-3">{done.type === 'published' ? 'Edition is live!' : done.type === 'scheduled' ? 'Edition scheduled' : 'Saved as draft'}</h2>
            <p className="text-muted">{done.type === 'published' ? 'It now appears on the public website.' : done.type === 'scheduled' ? `It will be published automatically on ${new Date(done.at).toLocaleString()}.` : 'You can publish it later.'}</p>
            <div className="d-flex gap-2 justify-content-center flex-wrap">
              {done.type === 'published' && <a href={`/edition/${edition.slug}`} target="_blank" rel="noreferrer" className="btn btn-primary"><i className="bi bi-box-arrow-up-right me-1" />View on website</a>}
              <Link to={`/admin/editions/${edition.id}`} className="btn btn-light border">Edition details</Link>
              <button className="btn btn-light border" onClick={() => { setDone(null); setEdition(null); setStep(0); navigate('/admin/publish'); }}>Publish another</button>
            </div>
          </div>
        </Panel>
      ) : step === 0 ? (
        <Panel title="1. Select an edition" actions={can('editions.add') && <Link to="/admin/editions/new" className="btn btn-sm btn-primary"><i className="bi bi-plus-lg me-1" />Create new edition</Link>}>
          {!candidates ? <Spinner /> : (
            <div className="list-group">
              {candidates.filter((e) => e.status !== 'published').map((e) => (
                <button key={e.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onClick={() => pick(e.id)}>
                  <span><b>{e.title}</b> <span className="text-muted small">· {e.category_name} · {formatDate(e.edition_date)}</span></span>
                  <span className="d-flex gap-2 align-items-center"><span className="small text-muted">{e.page_count} pages</span><StatusBadge status={e.status} /><i className="bi bi-chevron-right" /></span>
                </button>
              ))}
              {!candidates.some((e) => e.status !== 'published') && <p className="text-muted mb-0">All editions are published. Create a new edition to continue.</p>}
            </div>
          )}
        </Panel>
      ) : loading || !edition ? <Spinner /> : step === 1 ? (
        <Panel title="2. Upload & arrange pages" actions={<button className="btn btn-sm btn-primary" disabled={!edition.pages.length} onClick={() => setStep(2)}>Next: Preview <i className="bi bi-arrow-right" /></button>}>
          <PagesManager editionId={edition.id} pages={edition.pages} onChange={(pages) => setEdition((e) => ({ ...e, pages }))} />
        </Panel>
      ) : step === 2 ? (
        <Panel title="3. Preview & validate" actions={<><button className="btn btn-sm btn-light border" onClick={() => setStep(1)}><i className="bi bi-arrow-left" /> Back</button><button className="btn btn-sm btn-primary" disabled={!validation?.valid} onClick={() => setStep(3)}>Next: Publish <i className="bi bi-arrow-right" /></button></>}>
          {!validation ? <Spinner label="Validating pages…" /> : (
            <>
              <div className="row g-3 mb-3">
                <div className="col-sm-4"><div className="stat-card"><div><div className="val">{validation.page_count}</div><div className="lbl">Total pages</div></div></div></div>
                <div className="col-sm-4"><div className="stat-card"><div><div className="val">{validation.visible_count}</div><div className="lbl">Visible pages</div></div></div></div>
                <div className="col-sm-4"><div className="stat-card"><div><div className="val">{validation.valid ? <span className="text-success">Ready</span> : <span className="text-danger">Issues</span>}</div><div className="lbl">Validation</div></div></div></div>
              </div>
              {validation.issues.map((m) => <div key={m} className="alert alert-danger py-2 small mb-2"><i className="bi bi-x-circle me-2" />{m}</div>)}
              {validation.warnings.map((m) => <div key={m} className="alert alert-warning py-2 small mb-2"><i className="bi bi-exclamation-triangle me-2" />{m}</div>)}
              {validation.valid && !validation.warnings.length && <div className="alert alert-success py-2 small"><i className="bi bi-check-circle me-2" />All pages look good.</div>}
              <div className="small text-muted mb-2">First page: <b>{visible[0]?.title || 'Page 1'}</b> — change it in the previous step (preview → “Set as first page”).</div>
              <div className="d-flex gap-3 overflow-auto pb-2">
                {visible.map((p, i) => (
                  <figure key={p.id} className="text-center mb-0" style={{ flexShrink: 0 }}>
                    <img src={mediaUrl(p.images.medium?.url)} alt="" style={{ height: 360, borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,.15)' }} loading="lazy" />
                    <figcaption className="small mt-1">{i + 1}. {p.title}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </Panel>
      ) : (
        <Panel title="4. Publish" actions={<button className="btn btn-sm btn-light border" onClick={() => setStep(2)}><i className="bi bi-arrow-left" /> Back</button>}>
          <div style={{ maxWidth: 560 }}>
            {[['now', 'send-check', 'Publish immediately', 'The edition appears on the website right away.', can('editions.publish')],
              ['schedule', 'calendar-event', 'Schedule publication', 'Publish automatically at a chosen date and time.', can('schedules.add')],
              ['draft', 'save', 'Save as draft', 'Keep the edition unpublished for now.', can('editions.edit')]].filter((o) => o[4]).map(([k, icon, title, text]) => (
              <label key={k} className={`d-flex gap-3 p-3 border rounded mb-2 ${mode === k ? 'border-primary bg-light' : ''}`} style={{ cursor: 'pointer' }}>
                <input type="radio" className="form-check-input mt-1" checked={mode === k} onChange={() => setMode(k)} />
                <span><b><i className={`bi bi-${icon} me-1`} />{title}</b><br /><span className="small text-muted">{text}</span></span>
              </label>
            ))}
            {mode === 'schedule' && (
              <div className="border rounded p-3 mb-2">
                <label className="form-label">Publication date & time</label>
                <input type="datetime-local" className="form-control mb-2" value={publishAt} min={toLocalInput(new Date())} onChange={(e) => setPublishAt(e.target.value)} />
                <Switch label="Send push notification when published" checked={notify} onChange={setNotify} />
              </div>
            )}
            <button className="btn btn-primary btn-lg mt-2" disabled={busy || (mode === 'schedule' && !publishAt)} onClick={finish}>
              {busy && <span className="spinner-border spinner-border-sm me-2" />}{mode === 'now' ? 'Publish now' : mode === 'schedule' ? 'Schedule' : 'Save draft'}
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}
