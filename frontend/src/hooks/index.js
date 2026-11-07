import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../services/api';

/** Fetch data from the API with loading/error state. Re-runs when deps change. */
export function useFetch(url, params, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: !!url, error: null });
  const seq = useRef(0);
  const key = JSON.stringify(params || {});
  const load = useCallback(async (silent = false) => {
    if (!url) return;
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await get(url, params);
      if (id === seq.current) setState({ data: res.data, meta: res.meta || null, loading: false, error: null });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: e }));
    }
  }, [url, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function useDebounce(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Sets document.title */
export function useTitle(title) {
  useEffect(() => { if (title) document.title = title; }, [title]);
}

/** Set description/og meta tags client-side (server injects them for crawlers in production). */
export function useMeta({ title, description, image }) {
  useEffect(() => {
    if (title) document.title = title;
    const set = (sel, attr, val) => {
      if (!val) return;
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement('meta'); const [k, v] = attr; el.setAttribute(k, v); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    set('meta[name="description"]', ['name', 'description'], description);
    set('meta[property="og:title"]', ['property', 'og:title'], title);
    set('meta[property="og:description"]', ['property', 'og:description'], description);
    set('meta[property="og:image"]', ['property', 'og:image'], image);
  }, [title, description, image]);
}

/** PWA install prompt (beforeinstallprompt). */
export function usePwaInstall() {
  const [evt, setEvt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e); };
    const done = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', done); };
  }, []);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const install = async () => {
    if (!evt) return false;
    evt.prompt();
    const r = await evt.userChoice;
    setEvt(null);
    return r.outcome === 'accepted';
  };
  return { canInstall: !!evt, installed, isIOS, install };
}

export function useMediaQuery(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}
