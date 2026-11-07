import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { get } from '../../services/api';
import { useFetch } from '../../hooks';
import { useSettings } from '../../context/SettingsContext';
import { formatDate } from '../../utils/format';

/**
 * Edition bar: region/district filter → edition (category) → date, plus previous/next edition.
 * Navigates to the matching published edition.
 */
export default function EditionSelector({ edition }) {
  const { t, site } = useSettings();
  const navigate = useNavigate();
  const { data: categories } = useFetch('/categories/public');
  const { data: areas } = useFetch('/areas/public');
  const { data: dates } = useFetch('/editions/public/dates', { category: edition?.category_id }, [edition?.category_id]);
  const [district, setDistrict] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredCats = useMemo(() => {
    if (!categories) return [];
    if (!district || !areas) return categories;
    const ids = new Set(areas.mappings.filter((m) => String(m.district_id) === district || (!m.district_id && m.state_id && areas.districts.find((d) => String(d.id) === district)?.state_id === m.state_id)).map((m) => m.category_id));
    return categories.filter((c) => ids.has(c.id));
  }, [categories, areas, district]);

  useEffect(() => { if (district && filteredCats.length === 1) open({ category: filteredCats[0].id, date: edition?.edition_date }); }, [district]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(q) {
    setBusy(true);
    try {
      const res = await get('/editions/public/resolve', { category: q.category, date: q.date });
      navigate(`/edition/${res.data.slug}`);
    } catch (e) {
      if (q.date) {
        // nothing on that date for this edition → latest of the category
        try { const r2 = await get('/editions/public/resolve', { category: q.category }); toast(e.message); navigate(`/edition/${r2.data.slug}`); } catch (e2) { toast.error(e2.message); }
      } else toast.error(e.message);
    } finally { setBusy(false); }
  }

  const dateList = dates || [];
  const minDate = dateList[dateList.length - 1];
  const maxDate = dateList[0];

  return (
    <div className="edition-bar">
      {areas?.districts?.length > 0 && (
        <div className="eb-field">
          <label htmlFor="eb-district"><i className="bi bi-geo-alt" /> {t('district')}</label>
          <select id="eb-district" className="form-select form-select-sm" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">{t('allEditions')}</option>
            {areas.states.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {areas.districts.filter((d) => d.state_id === s.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <div className="eb-field">
        <label htmlFor="eb-cat"><i className="bi bi-newspaper" /> {t('category')}</label>
        <select id="eb-cat" className="form-select form-select-sm" value={edition?.category_id || ''} disabled={busy}
          onChange={(e) => open({ category: e.target.value, date: edition?.edition_date })}>
          {!filteredCats.some((c) => c.id === edition?.category_id) && edition && <option value={edition.category_id}>{edition.category_name}</option>}
          {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="eb-field">
        <label htmlFor="eb-date"><i className="bi bi-calendar3" /> {t('selectDate')}</label>
        <div className="input-group input-group-sm">
          <button className="btn btn-outline-secondary" disabled={!edition?.prev || busy} onClick={() => navigate(`/edition/${edition.prev.slug}`)} title={t('previousEdition')} aria-label={t('previousEdition')}><i className="bi bi-chevron-left" /></button>
          <input id="eb-date" type="date" className="form-control" value={edition?.edition_date || ''} min={minDate} max={maxDate} disabled={busy}
            onChange={(e) => e.target.value && open({ category: edition?.category_id, date: e.target.value })} />
          <button className="btn btn-outline-secondary" disabled={!edition?.next || busy} onClick={() => navigate(`/edition/${edition.next.slug}`)} title={t('nextEdition')} aria-label={t('nextEdition')}><i className="bi bi-chevron-right" /></button>
        </div>
      </div>
      {dateList.length > 0 && (
        <div className="eb-field d-none d-xl-flex">
          <label htmlFor="eb-recent">&nbsp;</label>
          <select id="eb-recent" className="form-select form-select-sm" value="" onChange={(e) => e.target.value && open({ category: edition?.category_id, date: e.target.value })}>
            <option value="">Recent dates…</option>
            {dateList.slice(0, 30).map((d) => <option key={d} value={d}>{formatDate(d, site.date_format)}</option>)}
          </select>
        </div>
      )}
      {busy && <div className="spinner-border spinner-border-sm text-primary align-self-center" />}
    </div>
  );
}
