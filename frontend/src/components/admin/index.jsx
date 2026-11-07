import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Spinner, EmptyState, ErrorState } from '../common';
import { confirm } from '../../store/confirm';
import { mediaUrl, post } from '../../services/api';
import { useDebounce, useFetch } from '../../hooks';
import { useSettings } from '../../context/SettingsContext';

export function PageHeader({ title, crumbs = [], actions, subtitle }) {
  useEffect(() => { document.title = `${title} | Admin`; }, [title]);
  return (
    <div className="page-header">
      <div>
        <nav aria-label="breadcrumb"><ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/admin/dashboard">Dashboard</Link></li>
          {crumbs.map((c, i) => <li key={i} className="breadcrumb-item">{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>)}
          <li className="breadcrumb-item active" aria-current="page">{title}</li>
        </ol></nav>
        <h1>{title}</h1>
        {subtitle && <div className="text-muted small mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, bodyClass = 'panel-body', className = '' }) {
  return (
    <div className={`panel ${className}`}>
      {(title || actions) && <div className="panel-header"><h2>{title}</h2>{actions && <div className="d-flex gap-2 flex-wrap align-items-center">{actions}</div>}</div>}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

/** Columns: [{ key, label, render(row), className, width }] */
export function DataTable({ columns, rows, loading, error, onRetry, empty, selectable, selected = [], onSelect, rowKey = 'id' }) {
  const allIds = (rows || []).map((r) => r[rowKey]);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  // Phone layout: each row becomes a card. The first labelled column is the card title,
  // unlabelled columns before it are media (thumbnail), unlabelled ones after it are actions.
  const headIdx = columns.findIndex((c) => typeof c.label === 'string' && c.label.trim());
  const cellProps = (c, i) => {
    const text = typeof c.label === 'string' ? c.label.trim() : '';
    const role = i === headIdx ? 'rt-head' : !text ? (i < headIdx ? 'rt-media' : 'rt-actions') : '';
    return { className: [c.className, role].filter(Boolean).join(' '), 'data-label': i === headIdx ? undefined : text || undefined };
  };
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle rt">
        <thead>
          <tr>
            {selectable && <th style={{ width: 36 }}><input type="checkbox" className="form-check-input" checked={allOn} onChange={() => onSelect(allOn ? selected.filter((s) => !allIds.includes(s)) : [...new Set([...selected, ...allIds])])} aria-label="Select all" /></th>}
            {columns.map((c) => <th key={c.key} className={c.thClass || ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length ? (
            <tr className="rt-full"><td colSpan={columns.length + (selectable ? 1 : 0)}><Spinner /></td></tr>
          ) : !rows?.length ? (
            <tr className="rt-full"><td colSpan={columns.length + (selectable ? 1 : 0)}>{empty || <EmptyState />}</td></tr>
          ) : rows.map((r) => (
            <tr key={r[rowKey]} className={selected.includes(r[rowKey]) ? 'table-active' : ''}>
              {selectable && <td className="rt-check"><input type="checkbox" className="form-check-input" checked={selected.includes(r[rowKey])} onChange={() => onSelect(selected.includes(r[rowKey]) ? selected.filter((s) => s !== r[rowKey]) : [...selected, r[rowKey]])} aria-label="Select row" /></td>}
              {columns.map((c, i) => <td key={c.key} {...cellProps(c, i)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && rows?.length > 0 && <div className="text-center small text-muted py-1"><span className="spinner-border spinner-border-sm me-1" />Refreshing…</div>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return meta ? <div className="small text-muted px-3 py-2">{meta.total} record(s)</div> : null;
  const { page, pages, total } = meta;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div className="d-flex justify-content-between align-items-center px-3 py-2 flex-wrap gap-2 border-top">
      <span className="small text-muted">{total} record(s) · page {page} of {pages}</span>
      <ul className="pagination pagination-sm mb-0">
        <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => onPage(page - 1)}>‹</button></li>
        {nums[0] > 1 && <li className="page-item"><button className="page-link" onClick={() => onPage(1)}>1</button></li>}
        {nums.map((n) => <li key={n} className={`page-item ${n === page ? 'active' : ''}`}><button className="page-link" onClick={() => onPage(n)}>{n}</button></li>)}
        {nums[nums.length - 1] < pages && <li className="page-item"><button className="page-link" onClick={() => onPage(pages)}>{pages}</button></li>}
        <li className={`page-item ${page >= pages ? 'disabled' : ''}`}><button className="page-link" onClick={() => onPage(page + 1)}>›</button></li>
      </ul>
    </div>
  );
}

/** List state synced with the URL (?q=&status=&page=) + data fetching. */
export function useAdminList(url, defaults = {}) {
  const [params, setParams] = useSearchParams();
  const filters = { ...defaults, ...Object.fromEntries(params.entries()) };
  const [q, setQ] = useState(filters.q || '');
  const dq = useDebounce(q);
  useEffect(() => { if ((filters.q || '') !== dq) setFilter('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const fetch = useFetch(url, filters, [params.toString()]);
  function setFilter(k, v) {
    const n = new URLSearchParams(params);
    if (v === '' || v === undefined || v === null) n.delete(k); else n.set(k, v);
    if (k !== 'page') n.delete('page');
    setParams(n, { replace: true });
  }
  function setFilters(obj) {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(obj)) { if (v === '' || v === undefined || v === null) n.delete(k); else n.set(k, v); }
    n.delete('page');
    setParams(n, { replace: true });
  }
  return { ...fetch, filters, setFilter, setFilters, q, setQ, setPage: (p) => setFilter('page', p), clear: () => { setQ(''); setParams({}, { replace: true }); } };
}

/** Confirm (optional) → call → toast → callback */
export async function runAction(fn, { confirmText, title, variant = 'danger', button = 'Confirm', success, onDone } = {}) {
  if (confirmText && !(await confirm({ title, message: confirmText, variant, confirmText: button }))) return null;
  try {
    const res = await fn();
    toast.success(success || res?.message || 'Done');
    onDone?.(res);
    return res;
  } catch (e) {
    toast.error(e.message);
    return null;
  }
}

export function Switch({ checked, onChange, label, id, disabled, help }) {
  const iid = id || `sw-${label?.replace(/\W+/g, '-')}`;
  return (
    <div className="form-check form-switch mb-2">
      <input id={iid} className="form-check-input" type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={iid} className="form-check-label">{label}</label>
      {help && <div className="form-text mt-0">{help}</div>}
    </div>
  );
}

export function ColorInput({ value, onChange }) {
  return (
    <div className="color-input">
      <input type="color" className="form-control form-control-color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input className="form-control" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="#000000" style={{ maxWidth: 130 }} />
    </div>
  );
}

/** Image picker with preview. value = current URL; onFile(File|null); onRemove() */
export function ImageInput({ url, file, onFile, onRemove, accept = 'image/png,image/jpeg,image/webp', help }) {
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const shown = preview || (url ? mediaUrl(url) : null);
  return (
    <div className="image-input">
      <div className="preview mb-2">{shown ? <img src={shown} alt="" /> : <span className="text-muted small"><i className="bi bi-image me-1" />No image</span>}</div>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => inputRef.current?.click()}><i className="bi bi-upload me-1" />{shown ? 'Change' : 'Upload'}</button>
        {shown && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { onFile(null); onRemove?.(); if (inputRef.current) inputRef.current.value = ''; }}><i className="bi bi-trash" /></button>}
      </div>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      {help && <div className="form-text">{help}</div>}
    </div>
  );
}

/** Lightweight rich-text editor (contentEditable + toolbar + HTML source mode). Server sanitises the HTML. */
export function RichEditor({ value, onChange }) {
  const ref = useRef(null);
  const [source, setSource] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (ref.current && !source && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''; }, [value, source]);
  const cmd = (c, v) => { document.execCommand(c, false, v); ref.current?.focus(); onChange(ref.current.innerHTML); };
  const tools = [['bold', 'type-bold', 'Bold'], ['italic', 'type-italic', 'Italic'], ['underline', 'type-underline', 'Underline'], ['insertUnorderedList', 'list-ul', 'Bullet list'], ['insertOrderedList', 'list-ol', 'Numbered list'],
    ['justifyLeft', 'text-left', 'Align left'], ['justifyCenter', 'text-center', 'Align center'], ['justifyRight', 'text-right', 'Align right'], ['justifyFull', 'justify', 'Justify']];
  const uploadImage = async (f) => {
    const fd = new FormData(); fd.append('image', f);
    try { const r = await post('/cms/upload-image', fd); cmd('insertImage', mediaUrl(r.data.url)); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="rich-editor">
      <div className="re-toolbar">
        <select className="form-select form-select-sm" style={{ width: 120 }} onChange={(e) => { cmd('formatBlock', e.target.value); e.target.value = ''; }} defaultValue="" disabled={source}>
          <option value="" disabled>Paragraph</option><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option>
        </select>
        {tools.map(([c, i, label]) => <button type="button" key={c} title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)} disabled={source}><i className={`bi bi-${i}`} /></button>)}
        <button type="button" title="Link" disabled={source} onClick={() => { const u = prompt('Link URL'); if (u) cmd('createLink', u); }}><i className="bi bi-link-45deg" /></button>
        <button type="button" title="Image" disabled={source} onClick={() => fileRef.current?.click()}><i className="bi bi-image" /></button>
        <button type="button" title="Clear formatting" disabled={source} onClick={() => cmd('removeFormat')}><i className="bi bi-eraser" /></button>
        <button type="button" title="HTML source" className={source ? 'bg-primary text-white' : ''} onClick={() => setSource((s) => !s)}><i className="bi bi-code-slash" /></button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) uploadImage(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {source ? <textarea className="form-control" value={value} onChange={(e) => onChange(e.target.value)} />
        : <div ref={ref} className="re-area cms-content" contentEditable suppressContentEditableWarning onInput={(e) => onChange(e.currentTarget.innerHTML)} />}
    </div>
  );
}

/** Initials from the newspaper name, e.g. "Vachana Kranti" -> "VK". */
export function initialsOf(name) {
  const words = String(name || 'ePaper').trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0]]).map((w) => Array.from(w)[0] || '');
  return (words.length > 1 ? letters.join('') : Array.from(words[0] || 'eP').slice(0, 2).join('')).toUpperCase();
}

/** Admin badge: admin icon -> favicon -> initials. */
export function AdminBrandMark({ className = 'logo-dot', style }) {
  const { site } = useSettings();
  const src = site.admin_logo || site.favicon;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (src && !broken) {
    return <span className={`${className} has-img`} style={style}><img src={mediaUrl(src)} alt={site.site_name || 'Logo'} onError={() => setBroken(true)} /></span>;
  }
  return <span className={className} style={style}>{initialsOf(site.site_name)}</span>;
}

export function StatCard({ icon, label, value, color = '#2563eb', to }) {
  const inner = (<><div className="ic"><i className={`bi bi-${icon}`} /></div><div><div className="val">{value ?? '—'}</div><div className="lbl">{label}</div></div></>);
  const style = { '--c': color };
  return to ? <Link to={to} className="stat-card" style={style}>{inner}</Link> : <div className="stat-card" style={style}>{inner}</div>;
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="input-group input-group-sm search" style={{ maxWidth: 280 }}>
      <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
      <input className="form-control" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Search" />
    </div>
  );
}
