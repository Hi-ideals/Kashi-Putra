import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { confirmStore } from '../../store/confirm';
import { useSettings } from '../../context/SettingsContext';

export function Spinner({ size = 'md', label, className = '' }) {
  return (
    <div className={`d-flex flex-column align-items-center justify-content-center gap-2 py-4 ${className}`} role="status">
      <div className={`spinner-border text-primary ${size === 'sm' ? 'spinner-border-sm' : ''}`} />
      {label && <div className="small text-muted">{label}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title = 'Nothing here yet', text, action }) {
  return (
    <div className="empty-state text-center py-5 px-3">
      <i className={`bi bi-${icon} display-5 text-muted`} />
      <h6 className="mt-3 mb-1">{title}</h6>
      {text && <p className="text-muted small mb-3">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="text-center py-5">
      <i className="bi bi-exclamation-triangle display-6 text-danger" />
      <p className="mt-3 mb-2">{error?.message || 'Something went wrong'}</p>
      {onRetry && <button className="btn btn-outline-primary btn-sm" onClick={() => onRetry()}>Try again</button>}
    </div>
  );
}

export function Modal({ show, onClose, title, children, footer, size = '', scrollable = true, fullscreenSm = false }) {
  useEffect(() => {
    if (!show) return undefined;
    const h = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', h);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', h); document.body.classList.remove('modal-open'); };
  }, [show, onClose]);
  if (!show) return null;
  return createPortal(
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
        <div className={`modal-dialog modal-dialog-centered ${scrollable ? 'modal-dialog-scrollable' : ''} ${size ? `modal-${size}` : ''} ${fullscreenSm ? 'modal-fullscreen-sm-down' : ''}`}>
          <div className="modal-content">
            {title !== undefined && (
              <div className="modal-header">
                <h5 className="modal-title">{title}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>
            )}
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>,
    document.body
  );
}

/** Rendered once at the app root; use `confirm()` from store/confirm anywhere. */
export function ConfirmHost() {
  const state = useSyncExternalStore(confirmStore.subscribe, confirmStore.get);
  if (!state) return null;
  const { title, message, confirmText = 'Confirm', variant = 'danger', resolve } = state;
  const close = (v) => { confirmStore.close(); resolve(v); };
  return (
    <Modal show title={title || 'Please confirm'} onClose={() => close(false)} size="sm"
      footer={<>
        <button className="btn btn-light" onClick={() => close(false)}>Cancel</button>
        <button className={`btn btn-${variant}`} autoFocus onClick={() => close(true)}>{confirmText}</button>
      </>}>
      <p className="mb-0">{message}</p>
    </Modal>
  );
}

/** Loads Google reCAPTCHA (v2 checkbox or v3) for a given action. Exposes getToken() via ref. */
let recaptchaPromise = null;
function loadRecaptcha(siteKey, version) {
  if (!recaptchaPromise) {
    recaptchaPromise = new Promise((resolve, reject) => {
      window.__epRecaptchaReady = () => resolve(window.grecaptcha);
      const s = document.createElement('script');
      s.src = version === 'v3' ? `https://www.google.com/recaptcha/api.js?render=${siteKey}&onload=__epRecaptchaReady` : 'https://www.google.com/recaptcha/api.js?onload=__epRecaptchaReady&render=explicit';
      s.async = true; s.defer = true; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return recaptchaPromise;
}

export function useRecaptcha(action, override) {
  const { recaptcha } = useSettings();
  const cfg = override || recaptcha;
  const active = !!(cfg?.enabled && cfg.site_key && (override || cfg.on?.[action]));
  const ref = useRef(null);
  const widgetId = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadRecaptcha(cfg.site_key, cfg.version).then((g) => {
      if (cancelled) return;
      if (cfg.version !== 'v3' && ref.current && widgetId.current === null) {
        try { widgetId.current = g.render(ref.current, { sitekey: cfg.site_key }); } catch { /* already rendered */ }
      }
      setReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, cfg?.site_key, cfg?.version]);
  const getToken = async () => {
    if (!active) return undefined;
    const g = window.grecaptcha;
    if (!g) throw new Error('reCAPTCHA is still loading. Please try again.');
    if (cfg.version === 'v3') return new Promise((res) => g.ready(() => g.execute(cfg.site_key, { action }).then(res)));
    const t = g.getResponse(widgetId.current ?? undefined);
    if (!t) throw new Error('Please tick the “I’m not a robot” box.');
    return t;
  };
  const reset = () => { if (active && cfg.version !== 'v3' && window.grecaptcha && widgetId.current !== null) window.grecaptcha.reset(widgetId.current); };
  const element = active && cfg.version !== 'v3' ? <div ref={ref} className="my-2" /> : null;
  return { active, ready, getToken, reset, element };
}

/** Google Identity Services button. */
export function GoogleButton({ onCredential, text = 'signin_with' }) {
  const { site } = useSettings();
  const ref = useRef(null);
  useEffect(() => {
    if (!site.google_client_id) return;
    const init = () => {
      if (!window.google?.accounts?.id || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: site.google_client_id, callback: (r) => onCredential(r.credential) });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 300, text });
    };
    if (window.google?.accounts?.id) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = init;
      document.head.appendChild(s);
    }
  }, [site.google_client_id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!site.google_client_id) return null;
  return (
    <>
      <div className="divider-text my-3"><span>or</span></div>
      <div className="d-flex justify-content-center" ref={ref} />
    </>
  );
}

/** Form field wrapper with label + validation message */
export function Field({ label, error, help, children, className = 'mb-3', required }) {
  return (
    <div className={className}>
      {label && <label className="form-label">{label}{required && <span className="text-danger"> *</span>}</label>}
      {children}
      {error && <div className="invalid-feedback d-block">{error}</div>}
      {help && !error && <div className="form-text">{help}</div>}
    </div>
  );
}

export function StatusBadge({ status, map }) {
  const colors = map || { published: 'success', draft: 'secondary', scheduled: 'info', unpublished: 'warning', archived: 'dark', active: 'success', inactive: 'secondary', pending: 'warning', approved: 'success', rejected: 'danger', spam: 'dark', completed: 'success', cancelled: 'secondary', failed: 'danger', sent: 'success', blocked: 'danger', unsubscribed: 'secondary' };
  return <span className={`badge rounded-pill text-bg-${colors[status] || 'light'} text-capitalize`}>{status}</span>;
}
