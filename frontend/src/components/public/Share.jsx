import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../common';
import { useSettings } from '../../context/SettingsContext';
import { post, mediaUrl } from '../../services/api';
import Comments from './Comments';
import { useMediaQuery } from '../../hooks';

export function shareLinks(url, text) {
  const u = encodeURIComponent(url); const t = encodeURIComponent(text);
  return [
    { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', color: '#25D366', href: `https://wa.me/?text=${t}%20${u}` },
    { key: 'facebook', label: 'Facebook', icon: 'facebook', color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: 'telegram', label: 'Telegram', icon: 'telegram', color: '#229ED9', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { key: 'x', label: 'X', icon: 'twitter-x', color: '#000', href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { key: 'email', label: 'Email', icon: 'envelope-fill', color: '#6c757d', href: `mailto:?subject=${t}&body=${t}%0A${u}` },
  ];
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

/**
 * Instagram has no web "share link" URL. Phones: open the system share sheet with the
 * image attached (Instagram appears there). Computers: download the image, copy the
 * link and open Instagram so the user can upload it.
 */
export async function shareToInstagram({ url, text, image }) {
  await copyText(url);
  let file = null;
  if (image) {
    try {
      const res = await fetch(image, { mode: 'cors' });
      const blob = await res.blob();
      file = new File([blob], `epaper-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`, { type: blob.type || 'image/jpeg' });
    } catch { file = null; }
  }
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: text, text: `${text}\n${url}` }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  if (file) {
    const href = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href, download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 3000);
  }
  toast.success(file ? 'Image downloaded and link copied — upload it on Instagram and paste the link.' : 'Link copied — paste it on Instagram.', { duration: 6000 });
  window.open('https://www.instagram.com/', '_blank', 'noopener');
}

export function ShareButtons({ url, text, compact = false, image }) {
  const { t } = useSettings();
  return (
    <div className={`d-flex flex-wrap gap-2 ${compact ? '' : 'justify-content-center'}`}>
      {shareLinks(url, text).map((l) => (
        <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" className="share-btn" style={{ '--c': l.color }} aria-label={`Share on ${l.label}`} title={l.label}>
          <i className={`bi bi-${l.icon}`} />{!compact && <span>{l.label}</span>}
        </a>
      ))}
      <button type="button" className="share-btn share-instagram" onClick={() => shareToInstagram({ url, text, image })} aria-label="Share on Instagram" title="Instagram">
        <i className="bi bi-instagram" />{!compact && <span>Instagram</span>}
      </button>
      <button type="button" className="share-btn" style={{ '--c': '#0b2545' }} onClick={async () => { if (await copyText(url)) toast.success(t('copied')); }} title={t('copyLink')}>
        <i className="bi bi-link-45deg" />{!compact && <span>{t('copyLink')}</span>}
      </button>
      {navigator.share && (
        <button type="button" className="share-btn d-md-none" style={{ '--c': '#444' }} onClick={() => navigator.share({ title: text, url }).catch(() => {})}>
          <i className="bi bi-share" />{!compact && <span>More</span>}
        </button>
      )}
    </div>
  );
}

export function ShareModal({ show, onClose, url, title, image }) {
  const { t } = useSettings();
  return (
    <Modal show={show} onClose={onClose} title={t('share')}>
      {image && <img src={image} alt="" className="img-fluid rounded border mb-3 d-block mx-auto" style={{ maxHeight: 260 }} />}
      <p className="small text-muted mb-2">{title}</p>
      <div className="input-group mb-3">
        <input className="form-control" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={async () => { if (await copyText(url)) toast.success(t('copied')); }}><i className="bi bi-clipboard" /></button>
      </div>
      <ShareButtons url={url} text={title} image={image} />
    </Modal>
  );
}

/** Shows the cropped area, lets the user download it or create a shareable clipping. */
const loadImg = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => resolve(im);
  im.onerror = reject;
  im.src = src;
});

/** "November 5, 2026" from 'YYYY-MM-DD' */
export function longEditionDate(d) {
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
export const siteDomain = (site) => { try { return new URL(site.site_url || window.location.origin).host; } catch { return window.location.host; } };

/**
 * Cut the selected article out of the page and add a branded header:
 * logo on the left; date and "Page no:N | website" on the right.
 */
export async function buildBrandedClip({ page, selection, edition, site }) {
  const im = await loadImg(mediaUrl(page.images.large?.url || page.images.medium?.url));
  const sx = selection.x * im.naturalWidth; const sy = selection.y * im.naturalHeight;
  const cw = Math.max(1, Math.round(selection.w * im.naturalWidth)); const ch = Math.max(1, Math.round(selection.h * im.naturalHeight));
  // Keep the header readable even for narrow clips
  const W = Math.max(cw, 720);
  const H = Math.round(Math.min(170, Math.max(96, W * 0.1)));
  const pad = Math.round(H * 0.18);
  const c = document.createElement('canvas');
  c.width = W; c.height = H + ch;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  // Logo (or site name)
  const logoSrc = site.header_logo || site.site_logo;
  let logoRight = pad;
  if (logoSrc) {
    try {
      const logo = await loadImg(mediaUrl(logoSrc));
      const maxH = H - pad * 2; const maxW = W * 0.48;
      const k = Math.min(maxH / logo.naturalHeight, maxW / logo.naturalWidth);
      const lw = logo.naturalWidth * k; const lh = logo.naturalHeight * k;
      g.drawImage(logo, pad, (H - lh) / 2, lw, lh);
      logoRight = pad + lw;
    } catch { /* fall back to text below */ }
  }
  if (logoRight === pad) {
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ep-primary').trim() || '#c8102e';
    g.font = `900 ${Math.round(H * 0.42)}px Georgia, "Noto Serif", serif`;
    g.textBaseline = 'middle';
    g.fillText(site.site_name || 'ePaper', pad, H / 2);
  }
  // Right side: date + page + website
  const pageNo = page.position || page.page_number;
  g.fillStyle = '#1f2937'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  g.font = `500 ${Math.round(H * 0.24)}px "Noto Sans", Arial, sans-serif`;
  g.fillText(longEditionDate(edition.edition_date), W - pad, H * 0.44);
  g.font = `500 ${Math.round(H * 0.22)}px "Noto Sans", Arial, sans-serif`;
  g.fillText(`Page no:${pageNo} | ${siteDomain(site)}`, W - pad, H * 0.78);
  // Divider + article
  g.fillStyle = '#d1d5db'; g.fillRect(0, H - 2, W, 2);
  g.drawImage(im, sx, sy, cw, ch, Math.round((W - cw) / 2), H, cw, ch);
  return c.toDataURL('image/jpeg', 0.92);
}

/** Readable article viewer: fit-to-width by default, zoom buttons, Ctrl+wheel, double-click, drag to pan. */
function ZoomableImage({ src, alt }) {
  const wrap = useRef(null);
  const img = useRef(null);
  const drag = useRef(null);
  const [z, setZ] = useState(1); // 1 = fit width
  const [natural, setNatural] = useState(0);
  const MIN = 0.5; const MAX = 5;

  const zoomTo = (next, cx, cy) => {
    const el = wrap.current;
    if (!el) return;
    const nz = Math.min(MAX, Math.max(MIN, next));
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2; const py = cy ?? r.height / 2;
    const fx = (el.scrollLeft + px) / (el.scrollWidth || 1);
    const fy = (el.scrollTop + py) / (el.scrollHeight || 1);
    setZ(nz);
    requestAnimationFrame(() => { el.scrollLeft = fx * el.scrollWidth - px; el.scrollTop = fy * el.scrollHeight - py; });
  };
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth - 2)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const actual = () => { if (boxW && natural) zoomTo(natural / boxW); };
  // Show the real size relative to the original image (100% = actual pixels)
  const shownPct = natural && boxW ? Math.round((z * boxW / natural) * 100) : Math.round(z * 100);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return; // plain wheel scrolls
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: wrap.current.scrollLeft, st: wrap.current.scrollTop };
    wrap.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    wrap.current.scrollLeft = d.sl - (e.clientX - d.x);
    wrap.current.scrollTop = d.st - (e.clientY - d.y);
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="az">
      <div className="az-bar">
        <button type="button" className="btn btn-sm btn-light" onClick={() => zoomTo(z / 1.25)} disabled={z <= MIN} aria-label="Zoom out"><i className="bi bi-zoom-out" /></button>
        <span className="az-level">{shownPct}%</span>
        <button type="button" className="btn btn-sm btn-light" onClick={() => zoomTo(z * 1.25)} disabled={z >= MAX} aria-label="Zoom in"><i className="bi bi-zoom-in" /></button>
        <button type="button" className={`btn btn-sm ${z === 1 ? 'btn-dark' : 'btn-light'}`} onClick={() => zoomTo(1)}>Fit width</button>
        {natural > 0 && <button type="button" className="btn btn-sm btn-light" onClick={actual} title="Show at original size">Actual size</button>}
        <span className="az-hint d-none d-md-inline">Ctrl + scroll or double-click to zoom · drag to move</span>
      </div>
      <div ref={wrap} className={`az-wrap ${z > 1 ? 'zoomed' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={(e) => { const r = wrap.current.getBoundingClientRect(); zoomTo(z > 1.4 ? 1 : 2.2, e.clientX - r.left, e.clientY - r.top); }}>
        <img ref={img} src={src} alt={alt} draggable={false} style={{ width: `${z * 100}%` }} onLoad={(e) => setNatural(e.currentTarget.naturalWidth)} />
      </div>
    </div>
  );
}

export function CropPreviewModal({ show, onClose, page, selection, edition, title, description, area }) {
  const { t, site } = useSettings();
  const withComments = !!area && !!site.comments_enabled && !!edition?.comments_enabled;
  const isWide = useMediaQuery('(min-width: 992px)');
  const [showComments, setShowComments] = useState(true);
  const [commentCount, setCommentCount] = useState(null);
  const [preview, setPreview] = useState(null);
  const [clip, setClip] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show || !page || !selection) return;
    let alive = true;
    setClip(null); setPreview(null);
    buildBrandedClip({ page, selection, edition, site })
      .then((url) => alive && setPreview(url))
      .catch(() => alive && setPreview('error'));
    return () => { alive = false; };
  }, [show, page, selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const createClip = async () => {
    if (clip) return clip;
    setBusy(true);
    try {
      const res = await post('/clippings', { page_id: page.id, ...selection });
      setClip(res.data);
      return res.data;
    } catch (e) { toast.error(e.message); return null; } finally { setBusy(false); }
  };

  const downloadClip = async () => {
    if (preview && preview !== 'error') {
      const a = Object.assign(document.createElement('a'), { href: preview, download: `${edition.slug}-p${page.page_number}-clip.jpg` });
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      const c = await createClip();
      if (c) window.open(mediaUrl(`/api/v1/clippings/${c.code}/download`), '_blank');
    }
  };

  return (
    <Modal show={show} onClose={onClose} title={title ? <><i className="bi bi-newspaper me-2" />{title}</> : <><i className="bi bi-scissors me-2" />{t('crop')}</>} size="xl" fullscreenSm>
      <div className={withComments && showComments ? 'ac-layout' : ''}>
        {withComments && showComments && <Comments variant="panel" edition={edition} page={page} area={area} onCount={setCommentCount} onClose={isWide ? () => setShowComments(false) : undefined} />}
        <div className="ac-main">
          {withComments && !showComments && (
            <button type="button" className="btn ac-open mb-2" onClick={() => setShowComments(true)}>
              <i className="bi bi-chat-dots me-1" />{t('comments')}{commentCount ? <span className="ac-count">{commentCount}</span> : null}
            </button>
          )}
          {description && <p className="text-muted small">{description}</p>}
          {preview && preview !== 'error' ? <div className="mb-3"><ZoomableImage src={preview} alt={title || 'Cropped article'} /></div> : (
            <div className="crop-preview mb-3">
              {!preview && <div className="spinner-border text-primary" />}
              {preview === 'error' && <p className="text-muted">Preview unavailable — you can still share the clipping.</p>}
            </div>
          )}
          {!clip ? (
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              <button className="btn btn-primary" onClick={createClip} disabled={busy}>
                {busy ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-share me-2" />}{t('share')}
              </button>
              <button className="btn btn-outline-secondary" onClick={downloadClip}><i className="bi bi-download me-2" />{t('download')}</button>
            </div>
          ) : (
            <>
              <div className="input-group mb-3">
                <input className="form-control" readOnly value={clip.share_url} onFocus={(e) => e.target.select()} />
                <button className="btn btn-primary" onClick={async () => { if (await copyText(clip.share_url)) toast.success(t('copied')); }}><i className="bi bi-clipboard me-1" />{t('copyLink')}</button>
              </div>
              <ShareButtons url={clip.share_url} text={`${edition.title} – ${edition.edition_date} – ${t('page')} ${page.page_number}`} image={mediaUrl(clip.image_url)} />
              <div className="text-center mt-3">
                <button className="btn btn-link btn-sm" onClick={downloadClip}><i className="bi bi-download me-1" />{t('download')}</button>
                <a className="btn btn-link btn-sm" href={`/clip/${clip.code}`} target="_blank" rel="noreferrer"><i className="bi bi-box-arrow-up-right me-1" />Open clipping</a>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
