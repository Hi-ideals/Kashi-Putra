import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks';
import { useSettings } from '../../context/SettingsContext';
import { mediaUrl } from '../../services/api';
import { formatDate } from '../../utils/format';

export function EditionCard({ e }) {
  const { site, t } = useSettings();
  return (
    <Link to={`/edition/${e.slug}`} className="edition-card">
      <div className="thumb">
        {e.thumb_url ? <img src={mediaUrl(e.thumb_url)} alt={`${e.title} ${e.edition_date}`} loading="lazy" /> : <div className="ph"><i className="bi bi-newspaper" /></div>}
        <span className="pages-pill">{e.page_count} {t('pages')}</span>
      </div>
      <div className="body">
        <div className="cat">{e.category_name}{e.region_name ? ` · ${e.region_name}` : ''}</div>
        <div className="title">{e.title}</div>
        <div className="date"><i className="bi bi-calendar3 me-1" />{formatDate(e.edition_date, site.date_format)}</div>
      </div>
    </Link>
  );
}

export function LatestEditions({ exclude, title, category, limit }) {
  const { t } = useSettings();
  const { data, loading } = useFetch('/editions/public/latest', { category, limit });
  const list = (data || []).filter((e) => e.slug !== exclude);
  if (!loading && !list.length) return null;
  return (
    <section aria-labelledby="latest-h">
      <div className="d-flex justify-content-between align-items-end mb-3">
        <h2 id="latest-h" className="section-title mb-0">{title || t('latestEditions')}</h2>
        <Link to="/editions" className="small fw-semibold">{t('archive')} <i className="bi bi-arrow-right" /></Link>
      </div>
      <div className="edition-grid">
        {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="edition-card skeleton" />) : list.map((e) => <EditionCard key={e.id} e={e} />)}
      </div>
    </section>
  );
}
