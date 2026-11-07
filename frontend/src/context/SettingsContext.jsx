import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, mediaUrl } from '../services/api';
import { makeT } from '../utils/i18n';

const SettingsContext = createContext(null);

function applyTheme(theme, mode) {
  const r = document.documentElement;
  const set = (k, v) => v !== undefined && v !== null && v !== '' && r.style.setProperty(k, v);
  set('--ep-primary', theme.primary_color);
  set('--ep-secondary', theme.secondary_color);
  set('--ep-header-bg', theme.header_bg);
  set('--ep-header-text', theme.header_text);
  set('--ep-footer-bg', theme.footer_bg);
  set('--ep-footer-text', theme.footer_text);
  set('--ep-font', theme.font_family);
  set('--ep-font-size', theme.font_size ? `${theme.font_size}px` : null);
  set('--ep-logo-h', theme.logo_height ? `${theme.logo_height}px` : null);
  set('--ep-logo-w', theme.logo_width ? `${theme.logo_width}px` : 'auto');
  r.dataset.layout = theme.layout || 'wide';
  r.dataset.bsTheme = mode;
}

export function SettingsProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lang, setLangState] = useState(() => localStorage.getItem('ep_lang') || '');
  const [mode, setModeState] = useState(() => localStorage.getItem('ep_mode') || '');

  const load = useCallback(async () => {
    try {
      const res = await get('/settings/public');
      setData(res.data);
      setError(null);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const theme = data?.theme || {};
  const effectiveMode = theme.dark_mode_enabled ? (mode || theme.default_mode || 'light') : 'light';

  useEffect(() => {
    if (!data) return;
    applyTheme(data.theme, effectiveMode);
    const fav = data.site.favicon;
    if (fav) {
      let link = document.querySelector("link[rel='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = mediaUrl(fav);
    }
    const tc = document.querySelector("meta[name='theme-color']");
    if (tc && data.pwa?.theme_color) tc.content = data.pwa.theme_color;
  }, [data, effectiveMode]);

  const site = data?.site || {};
  const enabledLangs = String(site.enabled_languages || 'en').split(',').map((s) => s.trim()).filter(Boolean);
  const language = enabledLangs.includes(lang) ? lang : (site.default_language || 'en');
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const value = useMemo(() => ({
    loaded: !!data, error, reload: load,
    site, theme, pwa: data?.pwa || {}, social: data?.social || [], pages: data?.pages || [], seo: data?.seo || {}, recaptcha: data?.recaptcha || { enabled: false },
    language, languages: enabledLangs, setLanguage: (l) => { localStorage.setItem('ep_lang', l); setLangState(l); },
    mode: effectiveMode, setMode: (m) => { localStorage.setItem('ep_mode', m); setModeState(m); },
    t: makeT(language),
  }), [data, error, load, site, language, effectiveMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
