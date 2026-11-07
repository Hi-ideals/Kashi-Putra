import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../services/api';

const MIN = 1;
const MAX = 6;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Zoom/pan newspaper page viewer.
 * - wheel zoom, double-click zoom, drag to pan, pinch zoom, swipe to change page
 * - keyboard: ←/→ pages, +/- zoom, 0 reset, ↑/↓ pan
 * - crop mode: draw & adjust a rectangle; selection stored as fractions of the page
 */
const PageViewer = forwardRef(function PageViewer({ page, onPrev, onNext, cropMode = false, onCropChange, fitMode = 'width', allowZoom = true, label, wheelNeedsCtrl = false, onScaleChange, areas = [], onAreaClick }, ref) {
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(null); // {x,y,w,h} fractions
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const img = page?.images || {};
  const ratio = (img.large?.height || img.medium?.height || 1414) / (img.large?.width || img.medium?.width || 1000);

  // Base (scale = 1) displayed size
  const base = (() => {
    const { w, h } = size;
    if (!w) return { w: 0, h: 0 };
    if (fitMode === 'page' && h) {
      const bw = Math.min(w, h / ratio);
      return { w: bw, h: bw * ratio };
    }
    return { w, h: w * ratio };
  })();

  const clampView = useCallback((v) => {
    const { w: cw, h: ch } = size;
    const dw = base.w * v.s; const dh = base.h * v.s;
    const x = dw <= cw ? (cw - dw) / 2 : clampN(v.x, cw - dw, 0);
    const y = dh <= ch ? (ch - dh) / 2 : clampN(v.y, ch - dh, 0);
    return { s: v.s, x, y };
  }, [size, base.w, base.h]);

  // Observe container size
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset on page / fit / size change
  useEffect(() => { setView(clampView({ s: 1, x: 0, y: 0 })); }, [page?.id, fitMode, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(null); }, [page?.id, cropMode]);
  useEffect(() => { onCropChange?.(sel); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onScaleChange?.(view.s); }, [view.s > 1.01]); // eslint-disable-line react-hooks/exhaustive-deps

  // New page: show the fast medium image first
  useEffect(() => {
    setFailed(false);
    setLoading(true);
    setSrc(page ? mediaUrl(img.medium?.url || img.large?.url) : '');
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upgrade to the large image once zoom / screen density needs it (loaded in background, no flicker)
  useEffect(() => {
    if (!page || !img.large || !base.w) return undefined;
    const needed = base.w * view.s * (window.devicePixelRatio || 1);
    if (needed <= (img.medium?.width || 1100) * 1.05) return undefined;
    const target = mediaUrl(img.large.url);
    if (src === target) return undefined;
    let alive = true;
    const pre = new Image();
    pre.onload = () => alive && setSrc(target);
    pre.src = target;
    return () => { alive = false; };
  }, [page?.id, Math.ceil(view.s * 2), base.w]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((factor, px, py) => {
    if (!allowZoom) return;
    setView((v) => {
      const s = clampN(v.s * factor, MIN, MAX);
      const cx = px ?? size.w / 2; const cy = py ?? size.h / 2;
      const k = s / v.s;
      return clampView({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });
  }, [allowZoom, clampView, size.w, size.h]);

  const reset = useCallback(() => setView(clampView({ s: 1, x: 0, y: 0 })), [clampView]);
  const panBy = useCallback((dx, dy) => setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy })), [clampView]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(1.35), zoomOut: () => zoomAt(1 / 1.35), reset, panBy,
    getScale: () => viewRef.current.s, getSelection: () => sel, clearSelection: () => setSel(null),
    selectAll: () => setSel({ x: 0.02, y: 0.02, w: 0.96, h: 0.96 }),
  }), [zoomAt, reset, panBy, sel]);

  // Wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!allowZoom) return;
      // Newspaper layout: plain wheel scrolls the website; Ctrl + wheel (or trackpad pinch) zooms
      if (wheelNeedsCtrl && !e.ctrlKey && viewRef.current.s <= 1.01) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
      zoomAt(f, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, allowZoom, wheelNeedsCtrl]);

  // ---------- Pointer handling ----------
  const local = (e) => { const r = stageRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const toFrac = (p) => {
    const v = viewRef.current;
    return { fx: clampN((p.x - v.x) / (base.w * v.s), 0, 1), fy: clampN((p.y - v.y) / (base.h * v.s), 0, 1) };
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    stageRef.current.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (cropMode) {
      const handle = e.target.dataset?.handle;
      const { fx, fy } = toFrac(p);
      if (handle) gesture.current = { type: 'resize', handle, start: { fx, fy }, orig: { ...sel } };
      else if (sel && e.target.dataset?.selbox) gesture.current = { type: 'move', start: { fx, fy }, orig: { ...sel } };
      else { gesture.current = { type: 'draw', start: { fx, fy } }; setSel({ x: fx, y: fy, w: 0, h: 0 }); }
      return;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), view: { ...viewRef.current }, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else {
      gesture.current = { type: 'pan', start: p, view: { ...viewRef.current }, t: Date.now(), moved: 0, areaId: Number(e.target.closest?.('[data-area]')?.dataset.area) || null };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (cropMode) {
      const { fx, fy } = toFrac(p);
      if (g.type === 'draw') setSel({ x: Math.min(g.start.fx, fx), y: Math.min(g.start.fy, fy), w: Math.abs(fx - g.start.fx), h: Math.abs(fy - g.start.fy) });
      if (g.type === 'move') {
        const dx = fx - g.start.fx; const dy = fy - g.start.fy;
        setSel({ ...g.orig, x: clampN(g.orig.x + dx, 0, 1 - g.orig.w), y: clampN(g.orig.y + dy, 0, 1 - g.orig.h) });
      }
      if (g.type === 'resize') {
        let { x, y, w, h } = g.orig; const r = x + w; const b = y + h;
        const H = g.handle;
        let nx = x; let ny = y; let nr = r; let nb = b;
        if (H.includes('w')) nx = Math.min(fx, r - 0.01);
        if (H.includes('e')) nr = Math.max(fx, x + 0.01);
        if (H.includes('n')) ny = Math.min(fy, b - 0.01);
        if (H.includes('s')) nb = Math.max(fy, y + 0.01);
        x = nx; y = ny; w = nr - nx; h = nb - ny;
        setSel({ x, y, w, h });
      }
      return;
    }
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = clampN(g.view.s * (d / g.dist), MIN, MAX);
      const k = s / g.view.s;
      setView(clampView({ s, x: mid.x - (g.mid.x - g.view.x) * k, y: mid.y - (g.mid.y - g.view.y) * k }));
      return;
    }
    if (g.type === 'pan') {
      const dx = p.x - g.start.x; const dy = p.y - g.start.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      setView(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
    }
  };

  const onPointerUp = (e) => {
    const p = local(e);
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (cropMode) {
      if (g?.type === 'draw' && sel && (sel.w < 0.02 || sel.h < 0.01)) setSel(null);
      gesture.current = null;
      return;
    }
    if (g?.type === 'pan' && pointers.current.size === 0) {
      const dx = p.x - g.start.x; const dy = p.y - g.start.y;
      const dt = Date.now() - g.t;
      const fitsH = base.w * g.view.s <= size.w + 2;
      // Swipe to change page when not zoomed horizontally
      if (fitsH && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) {
        if (dx < 0) onNext?.(); else onPrev?.();
      } else if (g.areaId && Math.hypot(dx, dy) < 6 && dt < 600) {
        // a tap/click (not a drag) on a mapped article
        const area = areas.find((x) => x.id === g.areaId);
        if (area) onAreaClick?.(area);
      }
    }
    if (pointers.current.size === 1 && g?.type === 'pinch') {
      const [rest] = [...pointers.current.values()];
      gesture.current = { type: 'pan', start: rest, view: { ...viewRef.current }, t: Date.now(), moved: 0 };
    } else if (pointers.current.size === 0) gesture.current = null;
  };

  const onDoubleClick = (e) => {
    if (cropMode || !allowZoom) return;
    const p = local(e);
    if (viewRef.current.s > 1.2) reset(); else zoomAt(2.5, p.x, p.y);
  };

  // Selection rectangle in stage pixels
  const selPx = sel && {
    left: view.x + sel.x * base.w * view.s, top: view.y + sel.y * base.h * view.s,
    width: sel.w * base.w * view.s, height: sel.h * base.h * view.s,
  };

  return (
    <div
      ref={stageRef}
      className={`ep-stage ${cropMode ? 'is-crop' : ''} ${view.s > 1.01 ? 'is-zoomed' : ''} ${wheelNeedsCtrl ? 'is-flow' : ''}`}
      style={wheelNeedsCtrl && !cropMode && view.s <= 1.01 ? { touchAction: 'pan-y' } : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      aria-label={label}
      role="img"
    >
      {page && src && !failed && (
        <img
          key={page.id}
          src={src}
          alt={label || `Page ${page.page_number}`}
          className="ep-page-img"
          crossOrigin="anonymous"
          draggable={false}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
          style={{ width: base.w, height: base.h, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}
        />
      )}
      {!cropMode && !loading && areas.map((a) => (
        <div key={a.id} data-area={a.id} className="ep-area" role="link" aria-label={a.title || 'Open article'}
          style={{ left: view.x + a.x * base.w * view.s, top: view.y + a.y * base.h * view.s, width: a.w * base.w * view.s, height: a.h * base.h * view.s }}>
          {a.title && <span className="ep-area-tip">{a.title}</span>}
        </div>
      ))}
      {loading && page && <div className="ep-loader"><div className="spinner-border text-light" /><span>Loading page…</span></div>}
      {failed && <div className="ep-loader text-center"><i className="bi bi-image fs-1" /><span>Page image could not be loaded.</span></div>}
      {cropMode && (
        <div className="ep-crop-layer">
          {!sel && <div className="ep-crop-hint"><i className="bi bi-bounding-box" /> Drag on the page to select an article</div>}
          {selPx && (
            <>
              <div className="ep-crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selPx.left}px ${selPx.top}px, ${selPx.left}px ${selPx.top + selPx.height}px, ${selPx.left + selPx.width}px ${selPx.top + selPx.height}px, ${selPx.left + selPx.width}px ${selPx.top}px, ${selPx.left}px ${selPx.top}px)` }} />
              <div className="ep-crop-box" data-selbox="1" style={selPx}>
                {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => <span key={h} data-handle={h} className={`ep-handle h-${h}`} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default PageViewer;
