import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Reader from '../../components/public/Reader';
import { LatestEditions, EditionCard } from '../../components/public/EditionCards';
import { ShareButtons } from '../../components/public/Share';
import { Spinner, ErrorState, EmptyState } from '../../components/common';
import { useFetch, useMeta } from '../../hooks';
import { get, mediaUrl } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { formatDate } from '../../utils/format';

/** Home: opens the default/latest edition right away. */
export function HomePage() {
  const { site, seo, t } = useSettings();
  const [state, setState] = useState({ loading: true, edition: null, error: null });
  useMeta({ title: seo.meta_title || site.site_title, description: seo.meta_description });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await get('/editions/public/resolve');
        const full = await get(`/editions/public/${r.data.slug}`);
        if (alive) setState({ loading: false, edition: full.data, error: null });
      } catch (e) { if (alive) setState({ loading: false, edition: null, error: e }); }
    })();
    return () => { alive = false; };
  }, []);
  if (state.loading) return <Spinner label={t('loading')} className="py-5 my-5" />;
  if (state.error?.status === 503) return <MaintenanceNotice message={state.error.message} />;
  if (!state.edition) {
    return (
      <div className="container-xxl py-5">
        <EmptyState icon="newspaper" title={t('noEdition')} text={state.error?.message} />
        <LatestEditions />
      </div>
    );
  }
  return <Reader edition={state.edition} pageNumber={Number(site.default_page) || 1} basePath="/" />;
}

export function EditionPage() {
  const { slug, page } = useParams();
  const { t } = useSettings();
  const { data, loading, error, reload } = useFetch(`/editions/public/${slug}`, null, [slug]);
  if (loading && !data) return <Spinner label={t('loading')} className="py-5 my-5" />;
  if (error?.status === 503) return <MaintenanceNotice message={error.message} />;
  if (error) {
    return (
      <div className="container-xxl py-5">
        {error.status === 404 ? <EmptyState icon="newspaper" title={t('noEdition')} text="This edition is not available. It may have been removed or not yet published." action={<Link to="/" className="btn btn-primary">{t('home')}</Link>} /> : <ErrorState error={error} onRetry={reload} />}
      </div>
    );
  }
  return <Reader key={data.id} edition={data} pageNumber={Number(page) || 1} />;
}

/** Shared clipping page: shows the clipped image and opens the edition page. */
export function ClipPage() {
  const { code } = useParams();
  const { site, t } = useSettings();
  const { data: clip, loading, error } = useFetch(`/clippings/${code}`);
  useMeta({ title: clip ? `${clip.edition_title} – ${clip.edition_date} | ${site.site_name}` : site.site_title, image: clip && mediaUrl(clip.image_url) });
  if (loading) return <Spinner className="py-5 my-5" />;
  if (error) return <div className="container py-5"><EmptyState icon="scissors" title="Clipping not found" text={error.message} action={<Link to="/" className="btn btn-primary">{t('home')}</Link>} /></div>;
  const shareTitle = `${clip.edition_title} – ${formatDate(clip.edition_date, site.date_format)} – ${t('page')} ${clip.page_number}`;
  const pageLink = clip.page_number > 1 ? `/edition/${clip.edition_slug}/page/${clip.page_number}` : `/edition/${clip.edition_slug}`;
  return (
    <div className="container py-4 py-md-5" style={{ maxWidth: 980 }}>
      <nav className="small mb-3"><Link to="/">{t('home')}</Link> / <Link to={pageLink}>{clip.edition_title}</Link> / Clip</nav>
      <div className="ep-card p-3 p-md-4">
        <div className="d-flex justify-content-between flex-wrap gap-2 mb-3">
          <div>
            <h1 className="h4 mb-1">{clip.edition_title}</h1>
            <div className="text-muted small">{clip.category_name} · {formatDate(clip.edition_date, site.date_format)} · {t('page')} {clip.page_number}</div>
          </div>
          <div className="d-flex gap-2 align-items-start">
            <a className="btn btn-outline-secondary btn-sm" href={mediaUrl(`/api/v1/clippings/${clip.code}/download`)}><i className="bi bi-download me-1" />{t('download')}</a>
            <Link className="btn btn-primary btn-sm" to={pageLink}><i className="bi bi-newspaper me-1" />{t('viewPage')}</Link>
          </div>
        </div>
        <div className="clip-image"><img src={mediaUrl(clip.image_url)} alt={shareTitle} /></div>
        <div className="mt-4"><ShareButtons url={clip.share_url} text={shareTitle} image={mediaUrl(clip.image_url)} /></div>
      </div>
      <div className="mt-5"><LatestEditions /></div>
    </div>
  );
}

/** Archive with filters: date range, edition, region/district. */
export function EditionsPage() {
  const { t } = useSettings();
  const [params, setParams] = useSearchParams();
  const q = Object.fromEntries(params.entries());
  const { data: cats } = useFetch('/categories/public');
  const { data: areas } = useFetch('/areas/public');
  const { data, meta, loading, error, reload } = useFetch('/editions/public', { ...q, limit: 24 }, [params.toString()]);
  useMeta({ title: `${t('editions')} | ePaper` });
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setParams(n); };
  return (
    <div className="container-xxl py-4">
      <h1 className="page-title">{t('editions')}</h1>
      <div className="filters ep-card p-3 mb-4">
        <div className="row g-2">
          <div className="col-6 col-md-3"><label className="form-label small">{t('category')}</label>
            <select className="form-select form-select-sm" value={q.category || ''} onChange={(e) => set('category', e.target.value)}>
              <option value="">{t('allEditions')}</option>{(cats || []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select></div>
          {areas?.districts?.length > 0 && <div className="col-6 col-md-3"><label className="form-label small">{t('district')}</label>
            <select className="form-select form-select-sm" value={q.district || ''} onChange={(e) => set('district', e.target.value)}>
              <option value="">—</option>{areas.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>}
          <div className="col-6 col-md-2"><label className="form-label small">From</label><input type="date" className="form-control form-control-sm" value={q.date_from || ''} onChange={(e) => set('date_from', e.target.value)} /></div>
          <div className="col-6 col-md-2"><label className="form-label small">To</label><input type="date" className="form-control form-control-sm" value={q.date_to || ''} onChange={(e) => set('date_to', e.target.value)} /></div>
          <div className="col-12 col-md-2 d-flex align-items-end"><button className="btn btn-sm btn-light w-100" onClick={() => setParams({})}><i className="bi bi-x-circle me-1" />Clear</button></div>
        </div>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.length ? <EmptyState icon="calendar-x" title={t('noEdition')} text="Try a different date or edition." /> : (
        <>
          <div className="edition-grid">{data.map((e) => <EditionCard key={e.id} e={e} />)}</div>
          {meta?.pages > 1 && (
            <nav className="d-flex justify-content-center gap-2 mt-4">
              <button className="btn btn-outline-secondary btn-sm" disabled={meta.page <= 1} onClick={() => set('page', meta.page - 1)}><i className="bi bi-chevron-left" /></button>
              <span className="align-self-center small">{meta.page} / {meta.pages}</span>
              <button className="btn btn-outline-secondary btn-sm" disabled={meta.page >= meta.pages} onClick={() => set('page', meta.page + 1)}><i className="bi bi-chevron-right" /></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export function CategoryPage() {
  const { slug } = useParams();
  const { data: cats, loading } = useFetch('/categories/public');
  const cat = (cats || []).find((c) => c.slug === slug);
  const { data } = useFetch(cat ? '/editions/public' : null, { category: slug, limit: 24 }, [slug, cat?.id]);
  useMeta({ title: cat ? `${cat.name} | ePaper` : 'ePaper', description: cat?.description });
  if (loading) return <Spinner />;
  if (!cat) return <div className="container py-5"><EmptyState title="Edition not found" /></div>;
  return (
    <div className="container-xxl py-4">
      <div className="d-flex gap-3 align-items-center mb-4">
        {cat.image_url && <img src={mediaUrl(cat.image_url)} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} />}
        <div><h1 className="page-title mb-1">{cat.name}</h1>{cat.description && <p className="text-muted mb-0">{cat.description}</p>}</div>
      </div>
      {!data ? <Spinner /> : !data.length ? <EmptyState icon="newspaper" title="No editions published yet" /> : <div className="edition-grid">{data.map((e) => <EditionCard key={e.id} e={e} />)}</div>}
    </div>
  );
}

export function MaintenanceNotice({ message }) {
  return (
    <div className="container py-5 text-center" style={{ maxWidth: 560 }}>
      <i className="bi bi-tools display-3 text-primary" />
      <h1 className="h3 mt-3">We'll be back soon</h1>
      <p className="text-muted">{message}</p>
    </div>
  );
}
