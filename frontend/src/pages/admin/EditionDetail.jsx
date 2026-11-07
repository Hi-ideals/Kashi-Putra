import { useEffect } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, Panel, Switch, runAction } from '../../components/admin';
import PagesManager from '../../components/admin/PagesManager';
import { Spinner, ErrorState, StatusBadge } from '../../components/common';
import { EditionActions } from './Editions';
import { useFetch } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { put, mediaUrl } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/format';

export default function EditionDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const { data: e, loading, error, reload, setData } = useFetch(`/editions/${id}`, null, [id]);
  useEffect(() => { if (hash === '#pages' && e) document.getElementById('pages')?.scrollIntoView({ behavior: 'smooth' }); }, [hash, e]);
  if (loading && !e) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const previewMode = params.get('preview') === '1';
  return (
    <>
      <PageHeader title={e.title} crumbs={[{ label: 'Editions', to: '/admin/editions' }]} subtitle={<>{e.category_name} · {formatDate(e.edition_date)} · <StatusBadge status={e.status} /></>}
        actions={<>
          {e.status === 'published' && <a href={`/edition/${e.slug}`} target="_blank" rel="noreferrer" className="btn btn-light border"><i className="bi bi-box-arrow-up-right me-1" />View on website</a>}
          {can('editions.edit') && <Link to={`/admin/editions/${e.id}/edit`} className="btn btn-light border"><i className="bi bi-pencil me-1" />Edit</Link>}
          {can('pages.view', 'pages.edit') && e.pages.length > 0 && <Link to={`/admin/editions/${e.id}/areas`} className="btn btn-light border"><i className="bi bi-bounding-box-circles me-1" />Area Mapping</Link>}
          {e.status !== 'published' && can('editions.publish') && <Link to={`/admin/publish/${e.id}`} className="btn btn-primary"><i className="bi bi-send me-1" />Publish workflow</Link>}
          <EditionActions e={e} onDone={(r) => (r?.data?.id && r.data.id !== e.id ? window.location.assign(`/admin/editions/${r.data.id}`) : reload())} />
        </>} />
      {previewMode && e.pages.length > 0 && (
        <Panel title="Preview" className="mb-3" actions={<Link to={`/admin/editions/${e.id}`} className="btn btn-sm btn-light">Close preview</Link>}>
          <div className="d-flex gap-3 overflow-auto pb-2">{e.pages.filter((p) => p.is_visible).map((p) => <img key={p.id} src={mediaUrl(p.images.medium?.url)} alt="" style={{ height: 480, borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,.15)' }} />)}</div>
        </Panel>
      )}
      <div className="row g-3">
        <div className="col-xl-9">
          <Panel title={`Pages (${e.pages.length})`} className="h-100"><div id="pages" />
            <PagesManager editionId={e.id} pages={e.pages} onChange={(pages) => setData((d) => ({ ...d, pages }))} />
          </Panel>
        </div>
        <div className="col-xl-3">
          <Panel title="Details">
            <dl className="small mb-0">
              <dt>Slug</dt><dd><code>{e.slug}</code></dd>
              <dt>Region</dt><dd>{e.region_name || '—'}</dd>
              <dt>Active</dt><dd>{e.is_active ? 'Yes' : 'No'}</dd>
              <dt>Published</dt><dd>{e.published_at ? formatDateTime(e.published_at) : '—'}</dd>
              <dt>Views</dt><dd>{e.view_count}</dd>
              <dt>Created</dt><dd>{formatDateTime(e.created_at)}</dd>
              {e.description && <><dt>Description</dt><dd>{e.description}</dd></>}
            </dl>
          </Panel>
          {can('comments.edit', 'editions.edit') && (
            <Panel title="Comments" className="mt-3">
              <Switch label="Comments enabled for this edition" checked={e.comments_enabled} onChange={(v) => runAction(() => put(`/comments/editions/${e.id}/toggle`, { enabled: v }), { onDone: () => setData((d) => ({ ...d, comments_enabled: v })) })} />
              <Link to={`/admin/comments?edition_id=${e.id}`} className="small">View comments</Link>
            </Panel>
          )}
          <Panel title="Schedules" className="mt-3">
            {e.schedules.length ? e.schedules.map((s) => <div key={s.id} className="small d-flex justify-content-between py-1 border-bottom"><span>{formatDateTime(s.publish_at)}</span><StatusBadge status={s.status} /></div>) : <p className="small text-muted mb-0">No schedules.</p>}
          </Panel>
          {can('seo.view') && <Link to={`/admin/seo?type=edition&id=${e.id}`} className="btn btn-light border w-100 mt-3"><i className="bi bi-search me-1" />SEO for this edition</Link>}
        </div>
      </div>
    </>
  );
}
