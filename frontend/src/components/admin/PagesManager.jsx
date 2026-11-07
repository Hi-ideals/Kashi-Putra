import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, EmptyState } from '../common';
import { runAction } from '.';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { post, put, del, download, mediaUrl } from '../../services/api';
import { bytes } from '../../utils/format';

/** Upload / reorder / replace / preview / edit / delete newspaper pages of one edition. */
export default function PagesManager({ editionId, pages, onChange }) {
  const { can } = useAuth();
  const { site } = useSettings();
  const [progress, setProgress] = useState(null);
  const [over, setOver] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);
  const [preview, setPreview] = useState(null); // index
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceTarget = useRef(null);
  const accept = `image/jpeg,image/png,image/webp${site.allow_pdf_upload ? ',application/pdf' : ''}`;

  const upload = async (files) => {
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || (site.allow_pdf_upload && f.type === 'application/pdf'));
    if (!list.length) return toast.error(`Only JPG, PNG, WebP${site.allow_pdf_upload ? ' or PDF' : ''} files are allowed`);
    if (list.length !== files.length) toast.error('Some files were skipped (unsupported type)');
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    setProgress({ pct: 0, total: list.reduce((a, f) => a + f.size, 0), count: list.length });
    try {
      const r = await post(`/pages/edition/${editionId}/upload`, fd, { onUploadProgress: (e) => setProgress((p) => ({ ...p, pct: Math.round((e.loaded / (e.total || 1)) * 100) })) });
      onChange(r.data); toast.success(r.message);
    } catch (e) { toast.error(e.message); } finally { setProgress(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const replace = async (file) => {
    const page = replaceTarget.current;
    if (!file || !page) return;
    const fd = new FormData(); fd.append('file', file);
    setProgress({ pct: 0, total: file.size, count: 1, replace: page.page_number });
    try { const r = await post(`/pages/${page.id}/replace`, fd, { onUploadProgress: (e) => setProgress((p) => ({ ...p, pct: Math.round((e.loaded / (e.total || 1)) * 100) })) }); onChange(r.data); toast.success(r.message); }
    catch (e) { toast.error(e.message); } finally { setProgress(null); replaceRef.current.value = ''; }
  };

  const reorder = async (ids) => {
    const prev = pages;
    onChange(ids.map((id, i) => ({ ...pages.find((p) => p.id === id), page_number: i + 1 }))); // optimistic
    try { const r = await put(`/pages/edition/${editionId}/reorder`, { order: ids }); onChange(r.data); toast.success('Page order saved'); } catch (e) { onChange(prev); toast.error(e.message); }
  };

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const ids = pages.map((p) => p.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId) + (pages.findIndex((p) => p.id === dragId) < pages.findIndex((p) => p.id === targetId) ? 1 : 0), 0, dragId);
    reorder(ids);
  };
  const move = (page, dir) => {
    const ids = pages.map((p) => p.id); const i = ids.indexOf(page.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
  };

  const p = preview !== null ? pages[preview] : null;

  return (
    <div>
      {can('pages.add') && (
        <div className={`dropzone mb-3 ${over ? 'over' : ''}`} onClick={() => !progress && fileRef.current?.click()}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
          role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}>
          {progress ? (
            <div style={{ maxWidth: 420, margin: '0 auto' }}>
              <div className="fw-semibold mb-2">{progress.replace ? `Replacing page ${progress.replace}` : `Uploading ${progress.count} file(s)`} · {bytes(progress.total)}</div>
              <div className="progress mb-2" style={{ height: 8 }}><div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${progress.pct}%` }} /></div>
              <div className="small text-muted">{progress.pct < 100 ? `${progress.pct}% uploaded` : 'Processing images (optimising, thumbnails, watermark)…'}</div>
            </div>
          ) : (
            <>
              <i className="bi bi-cloud-arrow-up fs-1 text-primary" />
              <div className="fw-semibold">Drop newspaper pages here or click to browse</div>
              <div className="small text-muted">JPG, JPEG, PNG, WebP{site.allow_pdf_upload ? ' or multi-page PDF' : ''} · Bulk upload supported · Files are added in name order (page-1, page-2…)</div>
            </>
          )}
          <input ref={fileRef} type="file" multiple accept={accept} hidden onChange={(e) => e.target.files.length && upload(e.target.files)} />
        </div>
      )}
      <input ref={replaceRef} type="file" accept={accept} hidden onChange={(e) => replace(e.target.files[0])} />

      {!pages.length ? <EmptyState icon="images" title="No pages uploaded yet" text="Upload the newspaper pages for this edition." /> : (
        <>
          {can('pages.edit') && <p className="small text-muted"><i className="bi bi-arrows-move me-1" />Drag pages to reorder them. Changes are saved automatically.</p>}
          <div className="page-grid">
            {pages.map((pg, i) => (
              <div key={pg.id} className={`page-tile ${pg.is_visible ? '' : 'hidden-page'} ${dragId === pg.id ? 'dragging' : ''} ${dropId === pg.id ? 'drag-over' : ''}`}
                draggable={can('pages.edit')} onDragStart={(e) => { setDragId(pg.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(pg.id)); }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropId(pg.id); } }} onDragLeave={() => setDropId(null)}
                onDrop={(e) => { e.preventDefault(); setDropId(null); onDrop(pg.id); }} onDragEnd={() => { setDragId(null); setDropId(null); }}>
                <div className="img" onClick={() => setPreview(i)} title="Preview">
                  <img src={mediaUrl(pg.images.thumb?.url)} alt={`Page ${pg.page_number}`} loading="lazy" draggable={false} />
                  <span className="num">{pg.page_number}</span>
                  {!pg.is_visible && <span className="badge text-bg-dark position-absolute" style={{ top: 6, right: 6 }}>Hidden</span>}
                  {pg.images.large?.watermarked && <span className="badge text-bg-info position-absolute" style={{ bottom: 6, right: 6 }} title="Watermarked"><i className="bi bi-droplet-half" /></span>}
                </div>
                <div className="meta"><div className="text-truncate fw-semibold">{pg.title || `Page ${pg.page_number}`}</div><div className="text-muted text-truncate">{pg.width}×{pg.height}</div></div>
                <div className="acts">
                  {can('pages.edit') && <button title="Move left" onClick={() => move(pg, -1)} disabled={i === 0}><i className="bi bi-arrow-left" /></button>}
                  {can('pages.edit') && <button title="Edit details" onClick={() => setEditing({ ...pg })}><i className="bi bi-pencil" /></button>}
                  {can('pages.edit') && <button title={pg.is_visible ? 'Hide' : 'Show'} onClick={() => runAction(() => put(`/pages/${pg.id}`, { is_visible: !pg.is_visible }), { onDone: (r) => onChange(r.data) })}><i className={`bi bi-eye${pg.is_visible ? '' : '-slash'}`} /></button>}
                  {can('pages.edit') && <button title="Replace image" onClick={() => { replaceTarget.current = pg; replaceRef.current.click(); }}><i className="bi bi-arrow-repeat" /></button>}
                  {can('pages.delete') && <button title="Delete" className="text-danger" onClick={() => runAction(() => del(`/pages/${pg.id}`), { confirmText: `Delete page ${pg.page_number}? Remaining pages will be renumbered.`, button: 'Delete', onDone: (r) => onChange(r.data) })}><i className="bi bi-trash" /></button>}
                  {can('pages.edit') && <button title="Move right" onClick={() => move(pg, 1)} disabled={i === pages.length - 1}><i className="bi bi-arrow-right" /></button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal show={!!p} onClose={() => setPreview(null)} size="xl" title={p ? `Page ${p.page_number}${p.title ? ` – ${p.title}` : ''}` : ''}
        footer={p && <>
          <button className="btn btn-light me-auto" disabled={preview === 0} onClick={() => setPreview(preview - 1)}><i className="bi bi-chevron-left" /> Previous</button>
          {can('pages.edit') && p.page_number !== 1 && <button className="btn btn-outline-primary" onClick={() => runAction(() => post(`/pages/${p.id}/set-first`), { onDone: (r) => { onChange(r.data); setPreview(0); } })}>Set as first page</button>}
          <button className="btn btn-outline-secondary" onClick={() => download(`/pages/${p.id}/original`, null, `page-${p.page_number}`)}><i className="bi bi-download me-1" />Original</button>
          <button className="btn btn-light" disabled={preview === pages.length - 1} onClick={() => setPreview(preview + 1)}>Next <i className="bi bi-chevron-right" /></button>
        </>}>
        {p && <div className="text-center bg-light p-2 rounded"><img src={mediaUrl(p.images.large?.url || p.images.medium?.url)} alt="" style={{ maxWidth: '100%', maxHeight: '70vh' }} /></div>}
        {p && <div className="small text-muted mt-2">Original: {p.original_name} · {p.width}×{p.height}px · Large: {p.images.large?.width}px ({bytes(p.images.large?.size)}) · Medium: {p.images.medium?.width}px · Thumb: {p.images.thumb?.width}px</div>}
      </Modal>

      <Modal show={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit page ${editing.page_number}` : ''}
        footer={<><button className="btn btn-light" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={() => runAction(() => put(`/pages/${editing.id}`, { title: editing.title, description: editing.description, is_visible: editing.is_visible }), { onDone: (r) => { onChange(r.data); setEditing(null); } })}>Save</button></>}>
        {editing && (<>
          <div className="mb-3"><label className="form-label">Page title</label><input className="form-control" value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Front Page, Sports, Editorial" /></div>
          <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows="3" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
          <div className="form-check form-switch"><input id="vis" className="form-check-input" type="checkbox" checked={editing.is_visible} onChange={(e) => setEditing({ ...editing, is_visible: e.target.checked })} /><label htmlFor="vis" className="form-check-label">Visible on website</label></div>
          <div className="small text-muted mt-3">Page URL: <code>/edition/…/page/{editing.page_number}</code></div>
        </>)}
      </Modal>
    </div>
  );
}
