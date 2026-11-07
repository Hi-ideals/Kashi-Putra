const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format 'YYYY-MM-DD' (or Date) with a pattern: DD-MM-YYYY | MM/DD/YYYY | YYYY-MM-DD | DD MMM YYYY */
export function formatDate(value, pattern = 'DD-MM-YYYY') {
  if (!value) return '';
  let y; let m; let d;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) [y, m, d] = value.split('-').map(Number);
  else { const dt = new Date(value); if (Number.isNaN(dt)) return String(value); y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate(); }
  const p = (n) => String(n).padStart(2, '0');
  return pattern.replace('YYYY', y).replace('MMM', MONTHS[m - 1]).replace('MM', p(m)).replace('DD', p(d));
}

export function formatDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt)) return String(value);
  return dt.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value) {
  const s = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDateTime(value);
}

export const longDate = (d = new Date(), lang = 'en') =>
  new Date(d).toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** <input type="datetime-local"> value from a Date/ISO */
export function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null);

export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const bytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round((n || 0) / 1024)} KB`);

export const STATUS_COLORS = { published: 'success', draft: 'secondary', scheduled: 'info', unpublished: 'warning', archived: 'dark', active: 'success', inactive: 'secondary',
  pending: 'warning', approved: 'success', rejected: 'danger', spam: 'dark', completed: 'success', cancelled: 'secondary', failed: 'danger', sent: 'success', blocked: 'danger', unsubscribed: 'secondary' };
