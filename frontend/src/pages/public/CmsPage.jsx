import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFetch, useMeta } from '../../hooks';
import { useSettings } from '../../context/SettingsContext';
import { Spinner, EmptyState, Field, useRecaptcha } from '../../components/common';
import { post, mediaUrl } from '../../services/api';

function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const rc = useRecaptcha('contact');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const r = await post('/cms/contact', { ...form, recaptchaToken: await rc.getToken() }); toast.success(r.message); setSent(true); } catch (err) { setErrors(err.errors || {}); toast.error(err.message); rc.reset(); } finally { setBusy(false); }
  };
  if (sent) return <div className="alert alert-success"><i className="bi bi-check-circle me-2" />Thank you! We have received your message.</div>;
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <form onSubmit={submit} className="ep-card p-4 mt-4">
      <h2 className="h5 mb-3">Send us a message</h2>
      <div className="row g-2">
        <div className="col-md-6"><Field label="Name" error={errors.name} required><input className="form-control" required {...f('name')} /></Field></div>
        <div className="col-md-6"><Field label="Email" error={errors.email} required><input type="email" className="form-control" required {...f('email')} /></Field></div>
      </div>
      <Field label="Subject" error={errors.subject}><input className="form-control" {...f('subject')} /></Field>
      <Field label="Message" error={errors.message} required><textarea className="form-control" rows="5" required {...f('message')} /></Field>
      {rc.element}
      <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Send message</button>
    </form>
  );
}

export default function CmsPage() {
  const { slug } = useParams();
  const { site, t } = useSettings();
  const { data, loading, error } = useFetch(`/cms/public/${slug}`, null, [slug]);
  useMeta({ title: data ? (data.seo?.meta_title || `${data.title} | ${site.site_name}`) : site.site_title, description: data?.seo?.meta_description });
  if (loading) return <Spinner className="py-5" />;
  if (error) return <div className="container py-5"><EmptyState icon="file-earmark-x" title="Page not found" action={<Link className="btn btn-primary" to="/">{t('home')}</Link>} /></div>;
  return (
    <div className="container py-4 py-md-5" style={{ maxWidth: 900 }}>
      <nav className="small mb-3"><Link to="/">{t('home')}</Link> / {data.title}</nav>
      <article className="ep-card p-4 p-md-5">
        <h1 className="page-title">{data.title}</h1>
        {data.featured_image_url && <img src={mediaUrl(data.featured_image_url)} alt="" className="img-fluid rounded mb-4" />}
        {/* Content is sanitised on the server */}
        <div className="cms-content" dangerouslySetInnerHTML={{ __html: data.content }} />
        {slug === 'contact-us' && (
          <div className="row g-3 mt-2 small">
            {site.contact_email && <div className="col-md-4"><i className="bi bi-envelope me-2 text-primary" /><a href={`mailto:${site.contact_email}`}>{site.contact_email}</a></div>}
            {site.contact_phone && <div className="col-md-4"><i className="bi bi-telephone me-2 text-primary" /><a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a></div>}
            {site.address && <div className="col-md-4"><i className="bi bi-geo-alt me-2 text-primary" />{site.address}</div>}
          </div>
        )}
      </article>
      {slug === 'contact-us' && <ContactForm />}
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useSettings();
  return (
    <div className="container py-5 text-center">
      <div className="display-1 fw-bold text-primary">404</div>
      <p className="lead">This page could not be found.</p>
      <Link to="/" className="btn btn-primary">{t('home')}</Link>
    </div>
  );
}
