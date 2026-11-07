import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFetch } from '../../hooks';
import { post } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useRecaptcha } from '../common';
import { timeAgo } from '../../utils/format';

/**
 * Comments for a page, or for one mapped article (area) when `area` is given.
 * variant="panel" is the compact side panel used inside the article popup.
 */
export default function Comments({ edition, page, area, variant, onClose, onCount }) {
  const { user } = useAuth();
  const { site, t } = useSettings();
  const location = useLocation();
  const max = site.comment_max_length || 200;
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const rc = useRecaptcha('comment');
  const params = area ? { area_id: area.id, limit: 50 } : { page_id: page?.id, limit: 30 };
  const { data, meta, loading, reload } = useFetch(page || area ? '/comments/public' : null, params, [user?.id, area?.id]);
  const total = meta?.total ?? data?.comments?.length;
  useEffect(() => { if (onCount && total !== undefined) onCount(total); }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!site.comments_enabled || !edition.comments_enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      const recaptchaToken = await rc.getToken();
      const res = await post('/comments', { edition_id: edition.id, page_id: page?.id, area_id: area?.id, body: body.trim(), recaptchaToken });
      toast.success(res.message);
      setBody(''); rc.reset(); reload(true);
    } catch (err) { toast.error(err.message); rc.reset(); } finally { setBusy(false); }
  };

  const comments = data?.comments || [];
  const mine = data?.pending_mine || [];

  if (variant === 'panel') {
    const next = `${location.pathname}${area ? `?article=${area.id}` : ''}`;
    return (
      <aside className="ac-panel" aria-labelledby="ac-h">
        <div className="ac-head">
          <h3 id="ac-h"><i className="bi bi-chat-dots" />{t('comments')}{total ? <span className="ac-count">{total}</span> : null}</h3>
          {onClose && <button type="button" className="ac-close" onClick={onClose} aria-label="Close comments"><i className="bi bi-x-lg" /></button>}
        </div>
        <form className="ac-form" onSubmit={submit}>
          <textarea className="form-control" rows="4" maxLength={max} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={user ? t('writeComment') : t('loginToComment')} aria-label={t('writeComment')} disabled={!user || !user.can_comment} />
          <div className={`ac-limit ${body.length > max * 0.9 ? 'text-danger' : ''}`}>
            <i className="bi bi-exclamation-triangle-fill" /> {user ? `${body.length}/${max}` : `Characters limit ${max}`}
          </div>
          {user && user.can_comment && rc.element}
          <div className="text-end">
            {!user ? (
              <Link to={`/login?next=${encodeURIComponent(next)}`} className="btn ac-btn"><i className="bi bi-box-arrow-in-right me-1" />Login to Comment</Link>
            ) : user.can_comment ? (
              <button className="btn ac-btn" disabled={busy || body.trim().length < 2}>{busy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send me-1" />}{t('post')}</button>
            ) : <div className="small text-danger">You are not allowed to post comments.</div>}
          </div>
        </form>
        <div className="ac-list">
          {mine.map((c) => (
            <div key={`m${c.id}`} className="ac-item is-pending">
              <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
              <div className="min-w-0"><div className="ac-meta"><b>{user?.name}</b><span className="badge text-bg-warning">Awaiting approval</span></div><p>{c.body}</p></div>
            </div>
          ))}
          {loading && !data ? <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" /></div>
            : !comments.length && !mine.length ? <p className="ac-empty">{t('noComments')}</p>
              : comments.map((c) => (
                <div key={c.id} className="ac-item">
                  <div className="avatar">{c.avatar ? <img src={c.avatar} alt="" /> : c.user_name?.[0]?.toUpperCase()}</div>
                  <div className="min-w-0"><div className="ac-meta"><b>{c.user_name}</b><span>{timeAgo(c.created_at)}</span></div><p>{c.body}</p></div>
                </div>
              ))}
        </div>
      </aside>
    );
  }

  return (
    <section className="ep-card p-3 p-md-4" aria-labelledby="comments-h">
      <h2 id="comments-h" className="section-title"><i className="bi bi-chat-square-text me-2" />{t('comments')} <small className="text-muted fw-normal">· {t('page')} {page?.page_number}</small></h2>
      {user ? (
        user.can_comment ? (
          <form onSubmit={submit} className="mb-4">
            <div className="d-flex gap-2 align-items-start">
              <div className="avatar">{user.avatar ? <img src={user.avatar} alt="" /> : user.name?.[0]?.toUpperCase()}</div>
              <div className="flex-grow-1">
                <textarea className="form-control" rows="2" maxLength={max} placeholder={t('writeComment')} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t('writeComment')} />
                <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                  <small className={body.length > max * 0.9 ? 'text-danger' : 'text-muted'}>{body.length}/{max}</small>
                  {rc.element}
                  <button className="btn btn-primary btn-sm px-3" disabled={busy || body.trim().length < 2}>{busy && <span className="spinner-border spinner-border-sm me-1" />}{t('post')}</button>
                </div>
              </div>
            </div>
          </form>
        ) : <div className="alert alert-warning small">You are not allowed to post comments.</div>
      ) : (
        <div className="alert alert-light border d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span className="small">{t('loginToComment')}</span>
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="btn btn-sm btn-primary">{t('login')}</Link>
        </div>
      )}
      {mine.map((c) => (
        <div key={`m${c.id}`} className="comment opacity-75">
          <div className="avatar">{user?.name?.[0]}</div>
          <div><div className="small"><b>{user?.name}</b> <span className="badge text-bg-warning ms-1">Awaiting approval</span></div><p className="mb-0">{c.body}</p></div>
        </div>
      ))}
      {loading && !data ? <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" /></div>
        : !comments.length && !mine.length ? <p className="text-muted small mb-0">{t('noComments')}</p>
          : comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="avatar">{c.avatar ? <img src={c.avatar} alt="" /> : c.user_name?.[0]?.toUpperCase()}</div>
              <div>
                <div className="small"><b>{c.user_name}</b> <span className="text-muted">· {timeAgo(c.created_at)}</span></div>
                <p className="mb-0 text-break">{c.body}</p>
              </div>
            </div>
          ))}
    </section>
  );
}
