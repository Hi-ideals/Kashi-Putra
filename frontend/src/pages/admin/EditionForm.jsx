import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, ImageInput, Switch } from '../../components/admin';
import { Field, Spinner } from '../../components/common';
import { useFetch } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { get, post, put, toForm } from '../../services/api';
import { todayISO, toLocalInput, fromLocalInput } from '../../utils/format';

const EMPTY = { title: '', category_id: '', region_id: '', edition_date: todayISO(), description: '', status: 'draft', publish_at: '', comments_enabled: true, allow_download: true, allow_print: true, is_active: true, slug: '' };

export default function EditionForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: cats } = useFetch('/categories', { limit: 200 });
  const { data: regions } = useFetch('/areas/regions');
  const [form, setForm] = useState(EMPTY);
  const [cover, setCover] = useState({ url: null, file: null, remove: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    get(`/editions/${id}`).then((r) => {
      const e = r.data;
      setForm({ title: e.title, category_id: e.category_id, region_id: e.region_id || '', edition_date: e.edition_date, description: e.description || '', status: e.status,
        publish_at: toLocalInput(e.scheduled_for || e.publish_at), comments_enabled: e.comments_enabled, allow_download: e.allow_download, allow_print: e.allow_print, is_active: e.is_active, slug: e.slug });
      setCover({ url: e.cover_url, file: null, remove: false });
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => { if (isNew && cats?.length && !form.category_id) setForm((f) => ({ ...f, category_id: (cats.find((c) => c.is_main) || cats[0]).id })); }, [cats]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const submit = async (e, next) => {
    e?.preventDefault();
    setBusy(true); setErrors({});
    try {
      const body = toForm({ ...form, publish_at: form.status === 'scheduled' ? fromLocalInput(form.publish_at) : '', cover_image: cover.file || undefined, remove_cover: cover.remove ? 'true' : undefined, slug: isNew ? '' : form.slug });
      const r = isNew ? await post('/editions', body) : await put(`/editions/${id}`, body);
      toast.success(r.message);
      navigate(next === 'pages' ? `/admin/publish/${r.data.id}` : `/admin/editions/${r.data.id}`);
    } catch (err) { setErrors(err.errors || {}); toast.error(err.message); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  const statuses = isNew ? ['draft', 'scheduled'] : ['draft', 'scheduled', ...(can('editions.publish') ? ['published', 'unpublished'] : []), 'archived'];

  return (
    <>
      <PageHeader title={isNew ? 'Add edition' : 'Edit edition'} crumbs={[{ label: 'Editions', to: '/admin/editions' }]} />
      <form onSubmit={submit}>
        <div className="row g-3">
          <div className="col-lg-8">
            <Panel title="Edition details">
              <Field label="Edition title" error={errors.title} required><input className="form-control" value={form.title} onChange={set('title')} placeholder="e.g. Main Edition" required /></Field>
              <div className="row g-3">
                <div className="col-md-6"><Field label="Edition category" error={errors.category_id} required>
                  <select className="form-select" value={form.category_id} onChange={set('category_id')} required>
                    <option value="">Select…</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'inactive' ? ' (inactive)' : ''}</option>)}
                  </select></Field></div>
                <div className="col-md-6"><Field label="Regional edition" help={<Link to="/admin/areas?tab=regions">Manage regions</Link>}>
                  <select className="form-select" value={form.region_id} onChange={set('region_id')}>
                    <option value="">— None —</option>{(regions || []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.state_name ? ` (${r.state_name})` : ''}</option>)}
                  </select></Field></div>
                <div className="col-md-6"><Field label="Publication date" error={errors.edition_date} required><input type="date" className="form-control" value={form.edition_date} onChange={set('edition_date')} required /></Field></div>
                {!isNew && <div className="col-md-6"><Field label="URL slug" help="Used in the edition URL"><input className="form-control" value={form.slug} onChange={set('slug')} /></Field></div>}
              </div>
              <Field label="Description" error={errors.description}><textarea className="form-control" rows="3" value={form.description} onChange={set('description')} /></Field>
            </Panel>
            <Panel title="Reader options" className="mt-3">
              <div className="row">
                <div className="col-sm-6"><Switch label="Allow comments" checked={form.comments_enabled} onChange={set('comments_enabled')} /></div>
                <div className="col-sm-6"><Switch label="Allow page download" checked={form.allow_download} onChange={set('allow_download')} /></div>
                <div className="col-sm-6"><Switch label="Allow printing" checked={form.allow_print} onChange={set('allow_print')} /></div>
                <div className="col-sm-6"><Switch label="Active" checked={form.is_active} onChange={set('is_active')} help="Inactive editions are hidden even when published" /></div>
              </div>
            </Panel>
          </div>
          <div className="col-lg-4">
            <Panel title="Status & publishing">
              <Field label="Status">
                <select className="form-select" value={form.status} onChange={set('status')}>{statuses.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
              </Field>
              {form.status === 'scheduled' && (
                <Field label="Publish at" error={errors.publish_at} required help="The edition is published automatically at this time. Upload pages before then.">
                  <input type="datetime-local" className="form-control" value={form.publish_at} onChange={set('publish_at')} min={toLocalInput(new Date())} required />
                </Field>
              )}
              {isNew && <div className="alert alert-light border small mb-0"><i className="bi bi-info-circle me-1" />Save the edition, then upload its pages to publish it.</div>}
            </Panel>
            <Panel title="Cover image" className="mt-3">
              <ImageInput url={cover.remove ? null : cover.url} file={cover.file} onFile={(f) => setCover({ ...cover, file: f, remove: !f })} help="Optional. The first page is used if empty." />
            </Panel>
            <div className="d-grid gap-2 mt-3">
              <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}{isNew ? 'Save edition' : 'Save changes'}</button>
              {isNew && can('pages.add') && <button type="button" className="btn btn-outline-primary" disabled={busy} onClick={(e) => submit(e, 'pages')}>Save & upload pages <i className="bi bi-arrow-right" /></button>}
              <Link to="/admin/editions" className="btn btn-light">Cancel</Link>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
