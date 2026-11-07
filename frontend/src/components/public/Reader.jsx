import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageViewer from './PageViewer';
import EditionSelector from './EditionSelector';
import { LatestEditions } from './EditionCards';
import { CropPreviewModal, copyText, shareToInstagram } from './Share';
import { useSettings } from '../../context/SettingsContext';
import { useMediaQuery, useMeta } from '../../hooks';
import { mediaUrl, post } from '../../services/api';
import { formatDate } from '../../utils/format';
import { setCurrentEdition } from '../../store/currentEdition';

/** Coloured share bar (Facebook, X, LinkedIn, Messenger, WhatsApp, copy). */
function ShareBar({ url, text, image }) {
  const u = encodeURIComponent(url); const tx = encodeURIComponent(text);
  const isMobile = /android|iphone|ipad/i.test(navigator.userAgent);
  const links = [
    ['facebook', 'Facebook', 'facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['x', 'X', 'twitter-x', `https://x.com/intent/tweet?url=${u}&text=${tx}`],
    ['linkedin', 'LinkedIn', 'linkedin', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['messenger', 'Messenger', 'messenger', isMobile ? `fb-messenger://share/?link=${u}` : `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['whatsapp', 'WhatsApp', 'whatsapp', `https://wa.me/?text=${tx}%20${u}`],
    ['telegram', 'Telegram', 'telegram', `https://t.me/share/url?url=${u}&text=${tx}`],
  ];
  return (
    <div className="vk-share">
      {links.map(([k, label, icon, href]) => (
        <a key={k} className={`vk-share-btn s-${k}`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={label}><i className={`bi bi-${icon}`} /></a>
      ))}
      <button type="button" className="vk-share-btn s-instagram" title="Instagram" aria-label="Share on Instagram" onClick={() => shareToInstagram({ url, text, image })}><i className="bi bi-instagram" /></button>
      <button type="button" className="vk-share-btn s-copy" title="Copy link" aria-label="Copy link" onClick={async () => { if (await copyText(url)) toast.success('Link copied'); }}><i className="bi bi-link-45deg" /></button>
    </div>
  );
}

/** Newspaper-style ePaper reader (header toolbar, thumbnails on the left, full page on white). */
export default function Reader({ edition, pageNumber = 1, basePath, highlight }) {
  const { site, t } = useSettings();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 991.98px)');
  const viewerRef = useRef(null);
  const shellRef = useRef(null);
  const [crop, setCrop] = useState(false);
  const [selection, setSelection] = useState(null);
  const [showCropPreview, setShowCropPreview] = useState(false);
  const [article, setArticle] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const pages = edition.pages || [];
  const total = pages.length;
  const index = Math.min(Math.max(1, pageNumber), Math.max(1, total)) - 1;
  const page = pages[index];
  const img = page?.images?.large || page?.images?.medium || {};
  const ratio = (img.height || 1414) / (img.width || 1000);

  const a = {
    crop: site.action_crop, share: site.action_share, zoom: site.action_zoom, fullscreen: site.action_fullscreen, thumbs: site.action_thumbnails,
    download: site.action_download && edition.allow_download, print: site.action_print && edition.allow_print, select: site.action_page_select, archive: site.action_archive !== false,
  };

  useEffect(() => { setCurrentEdition(edition); return () => setCurrentEdition(null); }, [edition]);

  const pageUrl = (n) => (n <= 1 ? `/edition/${edition.slug}` : `/edition/${edition.slug}/page/${n}`);
  const go = useCallback((n) => {
    if (n < 1 || n > total || n === index + 1) return;
    setCrop(false);
    navigate(basePath && n === 1 ? basePath : pageUrl(n));
  }, [total, index, navigate, basePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?article=<id> reopens an article popup (e.g. after "Login to Comment")
  const [searchParams, setSearchParams] = useSearchParams();
  const articleParam = searchParams.get('article');
  useEffect(() => {
    if (!articleParam || !edition?.pages) return;
    const id = Number(articleParam);
    const pIdx = edition.pages.findIndex((pg) => (pg.areas || []).some((a) => a.id === id));
    if (pIdx >= 0) {
      if (pIdx !== index) { navigate(`${pageUrl(pIdx + 1)}?article=${id}`, { replace: true }); return; }
      setArticle(edition.pages[pIdx].areas.find((a) => a.id === id));
    }
    const next = new URLSearchParams(searchParams); next.delete('article'); setSearchParams(next, { replace: true });
  }, [articleParam, edition, index]); // eslint-disable-line react-hooks/exhaustive-deps

  useMeta({
    title: `${edition.title} – ${formatDate(edition.edition_date, site.date_format)}${index ? ` – ${t('page')} ${index + 1}` : ''} | ${site.site_name}`,
    description: edition.seo?.meta_description || edition.description || `${edition.title} ${edition.edition_date} – ${site.site_name} ePaper`,
  });

  useEffect(() => {
    if (!page) return;
    post(`/editions/public/pages/${page.id}/view`).catch(() => {});
    const nxt = pages[index + 1];
    if (nxt?.images?.medium) { const im = new Image(); im.src = mediaUrl(nxt.images.medium.url); }
    setZoomed(false);
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll back to the toolbar when turning pages (the page is tall)
  useEffect(() => {
    if (index > 0 && shellRef.current) {
      const top = shellRef.current.getBoundingClientRect().top;
      if (top < -40) shellRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 2); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index); }
      else if (e.key === 'Home') go(1);
      else if (e.key === 'End') go(total);
      else if (e.key === '+' || e.key === '=') viewerRef.current?.zoomIn();
      else if (e.key === '-') viewerRef.current?.zoomOut();
      else if (e.key === '0') viewerRef.current?.reset();
      else if (e.key === 'Escape' && crop) setCrop(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, total, crop]);

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shellRef.current?.requestFullscreen) await shellRef.current.requestFullscreen();
      else setFullscreen((f) => !f);
    } catch { setFullscreen((f) => !f); }
  };

  const printPage = () => {
    const w = window.open('', '_blank');
    if (!w) return toast.error('Allow pop-ups to print');
    const src = new URL(mediaUrl(page.images.large?.url || page.images.medium?.url), window.location.href).href;
    w.document.write(`<!doctype html><title>${edition.title} - ${t('page')} ${index + 1}</title><style>@page{margin:8mm}body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style><img src="${src}" onload="setTimeout(()=>{window.print();},150)">`);
    w.document.close();
  };

  if (!total) return <div className="container py-5 text-center"><i className="bi bi-newspaper display-4 text-muted" /><p className="mt-3">{t('noEdition')}</p></div>;

  const shareUrl = `${(site.site_url || window.location.origin).replace(/\/$/, '')}${pageUrl(index + 1)}`;
  const shareTitle = `${site.site_name} – ${edition.title} – ${formatDate(edition.edition_date, site.date_format)} – ${t('page')} ${index + 1}`;

  // Numbered page buttons (window of up to 9 around the current page)
  const win = isMobile ? 2 : 4;
  let from = Math.max(1, index + 1 - win); let to = Math.min(total, from + win * 2);
  from = Math.max(1, to - win * 2);
  const nums = []; for (let i = from; i <= to; i++) nums.push(i);
  const pageLabel = (p, i) => (p.title && p.title !== `Page ${p.page_number}` ? p.title : `${t('page')} ${i + 1}`);

  return (
    <div className="vk-reader">
      <div ref={shellRef} className={`vk-shell ${fullscreen ? 'is-fullscreen' : ''}`}>
      {/* Toolbar */}
      <div className="vk-toolbar-wrap">
        <div className="container-xxl">
          <div className="vk-toolbar" role="toolbar" aria-label="Page controls">
            {a.select && (
              <select className="form-select vk-page-select" value={index + 1} onChange={(e) => go(Number(e.target.value))} aria-label={t('page')}>
                {pages.map((p, i) => <option key={p.id} value={i + 1}>{pageLabel(p, i)}</option>)}
              </select>
            )}
            <div className="vk-pager">
              <button className="vk-pg dark" onClick={() => go(1)} disabled={index === 0} title={t('first')} aria-label={t('first')}><i className="bi bi-skip-backward-fill" /></button>
              <button className="vk-pg dark" onClick={() => go(index)} disabled={index === 0} title={t('prev')} aria-label={t('prev')}><i className="bi bi-caret-left-fill" /></button>
              {from > 1 && <span className="vk-dots">…</span>}
              {nums.map((n) => <button key={n} className={`vk-pg ${n === index + 1 ? 'active' : ''}`} onClick={() => go(n)} aria-current={n === index + 1}>{n}</button>)}
              {to < total && <span className="vk-dots">…</span>}
              <button className="vk-pg dark" onClick={() => go(index + 2)} disabled={index >= total - 1} title={t('next')} aria-label={t('next')}><i className="bi bi-caret-right-fill" /></button>
              <button className="vk-pg dark" onClick={() => go(total)} disabled={index >= total - 1} title={t('last')} aria-label={t('last')}><i className="bi bi-skip-forward-fill" /></button>
            </div>
            <div className="vk-tools">
              {a.zoom && <>
                <button className="vk-tool icon" onClick={() => viewerRef.current?.zoomOut()} title={t('zoomOut')} aria-label={t('zoomOut')}><i className="bi bi-zoom-out" /></button>
                <button className="vk-tool icon" onClick={() => viewerRef.current?.zoomIn()} title={t('zoomIn')} aria-label={t('zoomIn')}><i className="bi bi-zoom-in" /></button>
                {zoomed && <button className="vk-tool icon" onClick={() => viewerRef.current?.reset()} title={t('fit')} aria-label={t('fit')}><i className="bi bi-aspect-ratio" /></button>}
              </>}
              {a.download && <a className="vk-tool icon d-none d-md-inline-flex" href={mediaUrl(`/api/v1/pages/${page.id}/download`)} title={t('download')} aria-label={t('download')}><i className="bi bi-download" /></a>}
              {a.print && <button className="vk-tool icon d-none d-md-inline-flex" onClick={printPage} title={t('print')} aria-label={t('print')}><i className="bi bi-printer" /></button>}
              {a.fullscreen && <button className="vk-tool icon d-none d-sm-inline-flex" onClick={toggleFullscreen} title={t('fullscreen')} aria-label={t('fullscreen')}><i className={`bi ${fullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} /></button>}
              {a.crop && <button className={`vk-tool ${crop ? 'on' : ''}`} onClick={() => setCrop((c) => !c)} aria-pressed={crop}><i className="bi bi-scissors" /> Clip</button>}
              {a.archive && <button className={`vk-tool ${archiveOpen ? 'on' : ''}`} onClick={() => setArchiveOpen((o) => !o)} aria-expanded={archiveOpen}><i className="bi bi-calendar3" /> {t('archive')}</button>}
            </div>
          </div>
          {archiveOpen && (
            <div className="vk-archive">
              <EditionSelector edition={edition} />
              <Link to="/editions" className="btn btn-sm btn-outline-secondary align-self-end">{t('allEditions')} <i className="bi bi-arrow-right" /></Link>
            </div>
          )}
        </div>
      </div>

      <div className="container-xxl">
        <div className="vk-body">
          {/* Thumbnails */}
          {a.thumbs && !isMobile && (
            <aside className="vk-thumbs" aria-label={t('thumbnails')}>
              {pages.map((p, i) => (
                <button key={p.id} type="button" className={`vk-thumb ${i === index ? 'active' : ''}`} onClick={() => go(i + 1)} aria-current={i === index}>
                  <img src={mediaUrl(p.images.thumb?.url)} alt="" loading="lazy" />
                  <span>{t('page')} No-{i + 1}</span>
                </button>
              ))}
            </aside>
          )}

          {/* Page */}
          <section className="vk-main">
            <div className="vk-title-row">
              <div>
                <h1 className="vk-title">{(edition.category_name || edition.title).toUpperCase()} Pg- {index + 1}</h1>
                <div className="vk-date">{formatDate(edition.edition_date, 'DD-MMM-YYYY')}{edition.title !== edition.category_name ? ` · ${edition.title}` : ''}</div>
              </div>
              {a.share && <ShareBar url={shareUrl} text={shareTitle} image={mediaUrl(page.images.large?.url || page.images.medium?.url)} />}
            </div>
            <div className="vk-rule" />
            {crop && (
              <div className="vk-cropbar">
                <span><i className="bi bi-info-circle me-1" />{t('cropHint')}</span>
                <span className="d-flex gap-2">
                  <button className="btn btn-sm btn-light" onClick={() => setCrop(false)}>{t('cancel')}</button>
                  <button className="btn btn-sm btn-dark" disabled={!selection} onClick={() => setShowCropPreview(true)}><i className="bi bi-check2 me-1" />{t('done')}</button>
                </span>
              </div>
            )}
            {edition.same_day?.length > 0 && (
              <div className="small mb-2">
                <span className="text-muted me-2">{t('sameDay')}:</span>
                {edition.same_day.map((s) => <Link key={s.slug} to={`/edition/${s.slug}`} className="chip">{s.category_name}</Link>)}
              </div>
            )}
            <div className="vk-page" style={{ aspectRatio: `1 / ${ratio}` }}>
              <PageViewer ref={viewerRef} page={page} fitMode="width" cropMode={crop} onCropChange={setSelection} allowZoom={a.zoom}
                wheelNeedsCtrl onScaleChange={(s) => setZoomed(s > 1.01)}
                areas={page.areas || []}
                onAreaClick={(ar) => {
                  if (ar.link_url) { if (/^https?:/i.test(ar.link_url)) window.open(ar.link_url, '_blank', 'noopener'); else navigate(ar.link_url); return; }
                  setArticle(ar);
                }}
                onPrev={() => go(index)} onNext={() => go(index + 2)} label={`${edition.title} ${t('page')} ${index + 1}`} />
              {highlight && highlight.page_id === page.id && <div className="clip-flash"><i className="bi bi-scissors me-1" /> Opened from a shared clipping</div>}
            </div>
            <div className="vk-bottom-pager">
              <button className="btn btn-outline-dark btn-sm" onClick={() => go(index)} disabled={index === 0}><i className="bi bi-chevron-left" /> {t('prev')}</button>
              <span className="small text-muted">{t('page')} {index + 1} {t('of')} {total}</span>
              <button className="btn btn-dark btn-sm" onClick={() => go(index + 2)} disabled={index >= total - 1}>{t('next')} <i className="bi bi-chevron-right" /></button>
            </div>
            {isMobile && a.thumbs && (
              <div className="vk-thumbs-row">
                {pages.map((p, i) => (
                  <button key={p.id} type="button" className={`vk-thumb ${i === index ? 'active' : ''}`} onClick={() => go(i + 1)}>
                    <img src={mediaUrl(p.images.thumb?.url)} alt="" loading="lazy" /><span>{t('page')} No-{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      </div>

      <div className="container-xxl">
        <div className="py-4 pb-5"><LatestEditions exclude={edition.slug} /></div>
      </div>

      {article && <CropPreviewModal show onClose={() => setArticle(null)} page={page} selection={{ x: article.x, y: article.y, w: article.w, h: article.h }} edition={edition} title={article.title || `${t('page')} ${index + 1}`} description={article.description} area={article} />}
      {showCropPreview && <CropPreviewModal show onClose={() => setShowCropPreview(false)} page={page} selection={selection} edition={edition} />}
    </div>
  );
}
