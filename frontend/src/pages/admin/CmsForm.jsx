import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, RichEditor, ImageInput, Switch } from '../../components/admin';
import { Field, Spinner } from '../../components/common';
import { get, post, put, toForm } from '../../services/api';

export default function CmsForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(id ? null : { title: '', slug: '', content: '', status: 'published', show_in_footer: true, show_in_header: false, sort_order: 0, seo: { meta_title: '', meta_description: '', meta_keywords: '' } });
  const [img, setImg] = useState({ file: null, remove: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (id) get(`/cms/${id}`).then((r) => setV({ ...r.data, seo: r.data.seo || {} })).catch((e) => toast.error(e.message)); }, [id]);
  if (!v) return <Spinner />;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try {
      const body = toForm({ title: v.title, slug: v.slug, content: v.content, status: v.status, show_in_footer: v.show_in_footer, show_in_header: v.show_in_header, sort_order: v.sort_order, seo: { meta_title: v.seo.meta_title, meta_description: v.seo.meta_description, meta_keywords: v.seo.meta_keywords }, featured_image: img.file || undefined, remove_image: img.remove ? 'true' : undefined });
      const r = id ? await put(`/cms/${id}`, body) : await post('/cms', body);
      toast.success(r.message);
      if (!id) navigate(`/admin/cms/${r.data.id}`, { replace: true }); else setV({ ...v, ...r.data });
    } catch (err) { setErrors(err.errors || {}); toast.error(err.message); } finally { setBusy(false); }
  };
  const seo = (k) => ({ value: v.seo[k] || '', onChange: (e) => setV({ ...v, seo: { ...v.seo, [k]: e.target.value } }) });
  return (
    <>
      <PageHeader title={id ? `Edit: ${v.title}` : 'Create page'} crumbs={[{ label: 'CMS Pages', to: '/admin/cms' }]} actions={id && <a href={`/page/${v.slug}`} target="_blank" rel="noreferrer" className="btn btn-light border"><i className="bi bi-box-arrow-up-right me-1" />View</a>} />
      <form onSubmit={save}>
        <div className="row g-3">
          <div className="col-lg-8">
            <Panel>
              <Field label="Title" error={errors.title} required><input className="form-control form-control-lg" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
              <Field label="Page URL" error={errors.slug} help="Leave empty to generate from the title"><div className="input-group"><span className="input-group-text">/page/</span><input className="form-control" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /></div></Field>
              <label className="form-label">Content</label>
              <RichEditor value={v.content || ''} onChange={(html) => setV((cur) => ({ ...cur, content: html }))} />
              {v.slug === 'contact-us' && <div className="form-text">A contact form is shown automatically below this page's content.</div>}
            </Panel>
            <Panel title="SEO" className="mt-3">
              <Field label="Meta title"><input className="form-control" {...seo('meta_title')} /></Field>
              <Field label="Meta description"><textarea className="form-control" rows="2" {...seo('meta_description')} /></Field>
              <Field label="Meta keywords"><input className="form-control" {...seo('meta_keywords')} /></Field>
            </Panel>
          </div>
          <div className="col-lg-4">
            <Panel title="Publish">
              <Field label="Status"><select className="form-select" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft (hidden)</option></select></Field>
              <Switch label="Show in footer menu" checked={v.show_in_footer} onChange={(x) => setV({ ...v, show_in_footer: x })} />
              <Switch label="Show in header menu" checked={v.show_in_header} onChange={(x) => setV({ ...v, show_in_header: x })} />
              <Field label="Menu order"><input type="number" className="form-control" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: e.target.value })} /></Field>
              <div className="d-grid gap-2"><button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Save page</button><Link to="/admin/cms" className="btn btn-light">Back</Link></div>
            </Panel>
            <Panel title="Featured image" className="mt-3"><ImageInput url={img.remove ? null : v.featured_image_url} file={img.file} onFile={(f) => setImg({ file: f, remove: !f })} /></Panel>
          </div>
        </div>
      </form>
    </>
  );
}
