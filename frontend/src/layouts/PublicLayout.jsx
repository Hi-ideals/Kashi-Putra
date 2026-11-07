import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { usePwaInstall, useFetch, useMediaQuery } from '../hooks';
import { mediaUrl, post, get } from '../services/api';
import { useCurrentEdition } from '../store/currentEdition';
import { enablePush, pushSupported, currentSubscription } from '../services/push';
import { longDate } from '../utils/format';
import { LANG_NAMES } from '../utils/i18n';
import { Modal, useRecaptcha } from '../components/common';

const SOCIAL_ICONS = { facebook: 'facebook', instagram: 'instagram', youtube: 'youtube', x: 'twitter-x', twitter: 'twitter-x', whatsapp: 'whatsapp', telegram: 'telegram', linkedin: 'linkedin', threads: 'threads', pinterest: 'pinterest' };

export function Logo({ variant = 'header' }) {
  const { site } = useSettings();
  const src = variant === 'footer' ? (site.footer_logo || site.site_logo) : (site.header_logo || site.site_logo);
  if (src) return <img src={mediaUrl(src)} alt={site.site_name} className={`site-logo ${variant}`} />;
  return (
    <span className={`wordmark ${variant}`}>
      <span className="wm-name">{site.site_name || 'ePaper'}</span>
      <span className="wm-tag">ePaper</span>
    </span>
  );
}

function InstallButton({ className = '' }) {
  const { t } = useSettings();
  const { canInstall, installed, isIOS, install } = usePwaInstall();
  const [iosHelp, setIosHelp] = useState(false);
  if (installed || (!canInstall && !isIOS)) return null;
  return (
    <>
      <button className={`btn btn-sm btn-install ${className}`} onClick={() => (isIOS && !canInstall ? setIosHelp(true) : install())}>
        <i className="bi bi-phone me-1" />{t('installApp')}
      </button>
      <Modal show={iosHelp} onClose={() => setIosHelp(false)} title={t('installApp')} size="sm">
        <p className="mb-2">On iPhone / iPad:</p>
        <ol className="mb-0"><li>Tap the <i className="bi bi-box-arrow-up" /> Share button in Safari</li><li>Choose <b>Add to Home Screen</b></li></ol>
      </Modal>
    </>
  );
}

function NotifyButton() {
  const { site, t } = useSettings();
  const [state, setState] = useState('unknown');
  useEffect(() => {
    if (!site.push_enabled || !pushSupported()) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    currentSubscription().then((s) => setState(s ? 'on' : 'off')).catch(() => setState('off'));
  }, [site.push_enabled]);
  if (state !== 'off') return null;
  const on = async () => {
    try { await enablePush(site.vapid_public_key); setState('on'); toast.success('You will be notified about new editions'); } catch (e) { toast.error(e.message); }
  };
  return <button className="btn btn-sm btn-outline-light-subtle hdr-icon" onClick={on} title={t('notifyMe')} aria-label={t('notifyMe')}><i className="bi bi-bell" /></button>;
}

function CategoryNav({ open, onNavigate }) {
  const { t, pages } = useSettings();
  const { data: cats } = useFetch('/categories/public');
  const current = useCurrentEdition();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const isMobile = useMediaQuery('(max-width: 991.98px)');
  const list = cats || [];
  const MAX = isMobile ? 99 : 6;
  const shown = list.slice(0, MAX);
  const rest = list.slice(MAX);
  const openCat = async (c) => {
    setMore(false); onNavigate?.();
    try { const r = await get('/editions/public/resolve', { category: c.id }); navigate(`/edition/${r.data.slug}`); }
    catch (e) { toast(e.message); navigate(`/category/${c.slug}`); }
  };
  const item = (c) => (
    <button key={c.id} type="button" className={`vk-nav-link ${current?.category_id === c.id ? 'active' : ''}`} onClick={() => openCat(c)}>{c.name}</button>
  );
  return (
    <nav className={`vk-nav ${open ? 'open' : ''}`} aria-label="Editions">
      <div className="container-xxl vk-nav-inner">
        <NavLink to="/" end className="vk-nav-link home" aria-label={t('home')} onClick={onNavigate}><i className="bi bi-house-door-fill" /></NavLink>
        {shown.map(item)}
        {rest.length > 0 && (
          <div className="vk-more" onMouseLeave={() => setMore(false)}>
            <button type="button" className={`vk-nav-link ${rest.some((c) => c.id === current?.category_id) ? 'active' : ''}`} onClick={() => setMore((m) => !m)} aria-expanded={more}>
              More <i className="bi bi-caret-down-fill small" />
            </button>
            {more && <div className="vk-more-menu">{rest.map(item)}</div>}
          </div>
        )}
        <NavLink to="/editions" className="vk-nav-link" onClick={onNavigate}>{t('archive')}</NavLink>
        {pages.filter((p) => p.show_in_header).map((p) => <NavLink key={p.slug} to={`/page/${p.slug}`} className="vk-nav-link" onClick={onNavigate}>{p.title}</NavLink>)}
      </div>
    </nav>
  );
}

const SOCIAL_COLORS = { instagram: '#e1306c', youtube: '#ff0000', facebook: '#1877f2', x: '#000', twitter: '#000', whatsapp: '#25d366', telegram: '#229ed9', linkedin: '#0a66c2' };

function Header() {
  const { site, t, language, languages, setLanguage, theme, mode, setMode, social } = useSettings();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); setMenu(false); }, [location.pathname]);
  return (
    <header className="vk-header">
      <div className="vk-masthead">
        <div className="container-xxl vk-mast-inner">
          <div className="vk-mast-left">
            <button className="btn vk-burger d-lg-none" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}><i className={`bi ${open ? 'bi-x-lg' : 'bi-list'}`} /></button>
            <span className="vk-date-text d-none d-md-inline">{longDate(new Date(), language)}</span>
          </div>
          <Link to="/" className="vk-brand" aria-label={site.site_name}><Logo /></Link>
          <div className="vk-mast-right">
            <div className="vk-social d-none d-md-flex">
              {social.slice(0, 4).map((s) => (
                <a key={s.url + s.platform} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} style={{ color: SOCIAL_COLORS[s.platform] || 'var(--ep-secondary)' }}>
                  <i className={`bi bi-${SOCIAL_ICONS[s.icon] || SOCIAL_ICONS[s.platform] || 'link-45deg'}`} />
                </a>
              ))}
            </div>
            {site.enable_subscriptions && <button className="btn btn-primary vk-btn-sub d-none d-sm-inline-flex" onClick={() => setSubOpen(true)}>{t('subscribe')}</button>}
            {user ? (
              <div className="position-relative">
                <button className="btn vk-btn-sign" onClick={() => setMenu((m) => !m)}><i className="bi bi-person-circle me-1" />{user.name.split(' ')[0]}</button>
                {menu && (
                  <div className="dropdown-menu dropdown-menu-end show" style={{ right: 0, left: 'auto' }}>
                    <Link className="dropdown-item" to="/account"><i className="bi bi-person me-2" />{t('profile')}</Link>
                    {user.is_admin && <Link className="dropdown-item" to="/admin/dashboard"><i className="bi bi-speedometer2 me-2" />Admin panel</Link>}
                    <hr className="dropdown-divider" />
                    <button className="dropdown-item" onClick={async () => { await logout(); navigate('/'); }}><i className="bi bi-box-arrow-right me-2" />{t('logout')}</button>
                  </div>
                )}
              </div>
            ) : <Link to="/login" className="btn vk-btn-sign">Sign In</Link>}
          </div>
        </div>
        <div className="container-xxl vk-utility">
          {languages.length > 1 && (
            <select className="form-select form-select-sm lang-select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
              {languages.map((l) => <option key={l} value={l}>{LANG_NAMES[l] || l}</option>)}
            </select>
          )}
          {theme.dark_mode_enabled && <button className="btn btn-sm hdr-icon" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode"><i className={`bi ${mode === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} /></button>}
          <NotifyButton />
          <InstallButton />
        </div>
      </div>
      <CategoryNav open={open} onNavigate={() => setOpen(false)} />
      <Modal show={subOpen} onClose={() => setSubOpen(false)} title={t('subscribe')} size="sm"><div className="vk-sub-modal"><SubscribeBox /></div></Modal>
    </header>
  );
}

export function SubscribeBox() {
  const { site, t } = useSettings();
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const rc = useRecaptcha('subscribe');
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);
  if (!site.enable_subscriptions) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await post('/subscribers/subscribe', { email, name: user?.name, recaptchaToken: await rc.getToken() });
      toast.success(res.message); setDone(true);
    } catch (err) { toast.error(err.message); rc.reset(); } finally { setBusy(false); }
  };
  return (
    <div className="subscribe-box">
      <h3><i className="bi bi-envelope-paper me-2" />{t('subscribe')}</h3>
      <p>{t('subscribeText')}</p>
      {done ? <div className="text-success fw-semibold"><i className="bi bi-check-circle me-1" />Subscribed</div> : (
        <form onSubmit={submit}>
          <div className="input-group">
            <input type="email" required className="form-control" placeholder={t('yourEmail')} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t('yourEmail')} />
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm" /> : t('subscribe')}</button>
          </div>
          {rc.element}
        </form>
      )}
    </div>
  );
}

function Footer() {
  const { site, social, pages, t } = useSettings();
  const links = Array.isArray(site.important_links) ? site.important_links : [];
  return (
    <footer className="site-footer">
      <div className="container-xxl py-5">
        <div className="row g-4">
          <div className="col-lg-4">
            <Logo variant="footer" />
            <p className="mt-3 small opacity-75">{site.footer_content}</p>
            <ul className="list-unstyled small opacity-75 mb-0">
              {site.address && <li><i className="bi bi-geo-alt me-2" />{site.address}</li>}
              {site.contact_phone && <li><i className="bi bi-telephone me-2" /><a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a></li>}
              {site.contact_email && <li><i className="bi bi-envelope me-2" /><a href={`mailto:${site.contact_email}`}>{site.contact_email}</a></li>}
            </ul>
          </div>
          <div className="col-6 col-lg-2">
            <h4>{t('importantLinks')}</h4>
            <ul className="list-unstyled">
              <li><Link to="/editions">{t('editions')}</Link></li>
              {links.map((l, i) => <li key={i}>{/^https?:/.test(l.url) ? <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a> : <Link to={l.url}>{l.label}</Link>}</li>)}
            </ul>
          </div>
          <div className="col-6 col-lg-2">
            <h4>{site.site_name}</h4>
            <ul className="list-unstyled">
              {pages.filter((p) => p.show_in_footer).map((p) => <li key={p.slug}><Link to={`/page/${p.slug}`}>{p.title}</Link></li>)}
            </ul>
          </div>
          <div className="col-lg-4">
            <SubscribeBox />
            {social.length > 0 && (
              <>
                <h4 className="mt-4">{t('followUs')}</h4>
                <div className="d-flex flex-wrap gap-2">
                  {social.map((s) => (
                    <a key={s.url + s.platform} href={s.url} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label={s.label} title={s.label}>
                      <i className={`bi bi-${SOCIAL_ICONS[s.icon] || SOCIAL_ICONS[s.platform] || 'link-45deg'}`} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="footer-bottom"><div className="container-xxl small">{site.copyright_text}</div></div>
    </footer>
  );
}

/**
 * Header height → CSS vars, and hide-on-scroll: scrolling down slides the header away
 * (more room for the newspaper), scrolling up brings it back.
 */
function useHeaderAutoHide() {
  useEffect(() => {
    const el = document.querySelector('.vk-header');
    if (!el) return undefined;
    const root = document.documentElement;
    let hidden = false; let lastY = window.scrollY; let ticking = false;
    const apply = () => {
      const h = el.offsetHeight;
      root.style.setProperty('--vk-header-h', `${h}px`);
      root.style.setProperty('--vk-header-offset', hidden ? '0px' : `${h}px`);
      el.classList.toggle('is-hidden', hidden);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY; const dy = y - lastY;
        const menuOpen = !!el.querySelector('.vk-nav.open, .dropdown-menu.show, .vk-more-menu');
        if (y < el.offsetHeight + 20 || menuOpen) hidden = false;      // near the top: always show
        else if (dy > 6) hidden = true;                                // scrolling down
        else if (dy < -6) hidden = false;                              // scrolling up
        if (Math.abs(dy) > 6 || y < el.offsetHeight) lastY = y;
        apply();
        ticking = false;
      });
    };
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  useHeaderAutoHide();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname.split('/page/')[0]]);
  return (
    <div className="public-site">
      <a href="#main" className="visually-hidden-focusable skip-link">Skip to content</a>
      <Header />
      <main id="main"><Outlet /></main>
      <Footer />
    </div>
  );
}
