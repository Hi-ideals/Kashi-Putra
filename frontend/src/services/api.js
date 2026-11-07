import axios from 'axios';

export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
const TOKEN_KEY = 'ep_token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

const api = axios.create({ baseURL: `${API_ORIGIN}/api/v1`, timeout: 120000 });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const listeners = new Set();
export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const data = err.response?.data || {};
    if (status === 401 && tokenStore.get() && !err.config?.skipAuthRedirect) listeners.forEach((fn) => fn());
    const e = new Error(data.message || (err.code === 'ECONNABORTED' ? 'Request timed out' : err.message === 'Network Error' ? 'Cannot reach the server. Check your connection.' : 'Something went wrong'));
    e.status = status; e.errors = data.errors || {}; e.data = data;
    return Promise.reject(e);
  }
);

/** Unwrap { success, data, meta } */
export const get = (url, params, cfg) => api.get(url, { params, ...cfg }).then((r) => r.data);
export const post = (url, body, cfg) => api.post(url, body, cfg).then((r) => r.data);
export const put = (url, body, cfg) => api.put(url, body, cfg).then((r) => r.data);
export const patch = (url, body, cfg) => api.patch(url, body, cfg).then((r) => r.data);
export const del = (url, cfg) => api.delete(url, cfg).then((r) => r.data);

/** Build FormData from an object (skips undefined, appends Files, JSON-encodes objects). */
export function toForm(obj) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v instanceof File || v instanceof Blob) f.append(k, v);
    else if (Array.isArray(v) && v.length && v[0] instanceof File) v.forEach((x) => f.append(k, x));
    else if (v !== null && typeof v === 'object') f.append(k, JSON.stringify(v));
    else f.append(k, v === null ? '' : String(v));
  }
  return f;
}

/** Download a file from an authenticated endpoint. */
export async function download(url, params, fallbackName = 'download') {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const name = decodeURIComponent((cd.match(/filename\*?="?([^";]+)"?/) || [])[1] || fallbackName);
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

/** Absolute URL for an /uploads path (needed when API is on another origin). */
export const mediaUrl = (u) => (!u ? '' : /^(https?:|blob:|data:)/.test(u) ? u : `${API_ORIGIN}${u}`);

export default api;
