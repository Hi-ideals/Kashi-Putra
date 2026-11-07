import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, Switch, ColorInput, ImageInput, DataTable, runAction } from '../../components/admin';
import { Field, Spinner, Modal, StatusBadge, useRecaptcha } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useFetch } from '../../hooks';
import { get, put, post, del, toForm, API_ORIGIN } from '../../services/api';
import api from '../../services/api';

const TZ = ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];
const FONTS = ['"Noto Sans Kannada", "Noto Sans", system-ui, sans-serif', '"Noto Sans", system-ui, sans-serif', 'Georgia, "Times New Roman", serif', '"Noto Serif", Georgia, serif', 'system-ui, -apple-system, "Segoe UI", sans-serif'];

/* Field spec: [key, label, type, options/help] */
const GROUPS = {
  epaper: {
    api: 'website', title: 'ePaper Settings', sections: [
      ['Newspaper & branding', [['site_name', 'Newspaper name', 'text'], ['site_title', 'Website title', 'text'], ['tagline', 'Tagline', 'text'], ['site_url', 'Website URL', 'text', 'Used in share links, emails and the sitemap'],
        ['site_logo', 'Website logo', 'image'], ['header_logo', 'Header logo', 'image', 'Falls back to the website logo'], ['footer_logo', 'Footer logo', 'image'], ['favicon', 'Favicon', 'image', 'PNG / ICO, square'],
        ['admin_logo', 'Admin panel icon', 'image', 'Square image for the admin sidebar and login page. If empty, the favicon is used, then the newspaper initials.'], ['admin_panel_title', 'Admin panel subtitle', 'text', 'Shown under the newspaper name in the admin sidebar']]],
      ['Contact', [['contact_email', 'Contact email', 'email'], ['contact_number', 'Contact number', 'alias:contact_phone'], ['address', 'Address', 'textarea']]],
      ['Reading defaults', [['default_category_id', 'Default edition', 'category'], ['default_date_mode', 'Default publication date', 'select', [['latest', 'Latest available edition'], ['today', "Today's date (falls back to latest)"]]],
        ['default_page', 'Default page', 'number'], ['latest_editions_count', 'Latest editions to show', 'number'], ['date_format', 'Date format', 'select', [['DD-MM-YYYY', 'DD-MM-YYYY'], ['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD'], ['DD MMM YYYY', 'DD MMM YYYY']]],
        ['timezone', 'Time zone', 'select', TZ.map((t) => [t, t])]]],
      ['Language', [['default_language', 'Default language', 'select', [['en', 'English'], ['kn', 'ಕನ್ನಡ (Kannada)']]], ['enabled_languages', 'Languages readers can choose', 'select', [['en,kn', 'English + Kannada'], ['en', 'English only'], ['kn', 'Kannada only']]]]],
      ['Footer', [['footer_content', 'Footer content', 'textarea'], ['copyright_text', 'Copyright text', 'text', 'Use {year} for the current year'], ['important_links', 'Important links', 'links']]],
      ['Features', [['allow_registration', 'Allow reader registration', 'bool'], ['enable_subscriptions', 'Enable email subscriptions', 'bool'], ['subscriber_email_on_publish', 'Email subscribers when an edition is published', 'bool'],
        ['allow_pdf_upload', 'Allow PDF upload for pages', 'bool'], ['google_client_id', 'Google login client ID', 'text', 'From Google Cloud Console → Credentials (OAuth Web client). Leave empty to disable Google login.']]],
      ['Maintenance', [['maintenance_mode', 'Maintenance mode', 'bool', 'Public pages show a maintenance notice. Admins can still browse.'], ['maintenance_message', 'Maintenance message', 'textarea']]],
    ],
  },
  comments: {
    api: 'website', title: 'Comment Settings', sections: [
      ['Comments', [['comments_enabled', 'Enable comments globally', 'bool'], ['comments_require_approval', 'Hold new comments for moderation', 'bool'], ['comment_max_length', 'Maximum characters per comment', 'number'],
        ['comment_rate_per_hour', 'Maximum comments per user per hour', 'number'], ['comment_auto_spam_links', 'Mark comments containing links as spam', 'bool'], ['comment_blocked_words', 'Blocked words (comma or line separated)', 'textarea', 'Comments containing these words are marked as spam']]],
    ],
  },
  theme: {
    api: 'theme', title: 'Theme Settings', sections: [
      ['Colours', [['primary_color', 'Primary colour', 'color'], ['secondary_color', 'Secondary colour', 'color'], ['header_bg', 'Header background', 'color'], ['header_text', 'Header text', 'color'], ['footer_bg', 'Footer background', 'color'], ['footer_text', 'Footer text', 'color']]],
      ['Typography & layout', [['theme_name', 'Website theme', 'select', [['classic', 'Classic newspaper'], ['modern', 'Modern'], ['minimal', 'Minimal']]], ['font_family', 'Font family', 'select', FONTS.map((f) => [f, f.split(',')[0].replace(/"/g, '')])], ['font_size', 'Base font size (px)', 'number'],
        ['logo_height', 'Logo height (px)', 'number'], ['logo_width', 'Logo width (px, 0 = auto)', 'number'], ['layout', 'Website layout', 'select', [['wide', 'Full width'], ['boxed', 'Boxed']]]]],
      ['Dark mode', [['dark_mode_enabled', 'Allow light / dark mode switch', 'bool'], ['default_mode', 'Default mode', 'select', [['light', 'Light'], ['dark', 'Dark']]]]],
    ],
  },
  watermark: {
    api: 'watermark', title: 'Watermark Settings', sections: [
      ['Watermark', [['enabled', 'Enable watermark on newspaper pages', 'bool'], ['type', 'Watermark type', 'select', [['text', 'Text'], ['logo', 'Logo'], ['both', 'Logo + text']]], ['text', 'Watermark text', 'text'], ['logo', 'Watermark logo', 'image', 'Transparent PNG works best'],
        ['position', 'Position', 'select', [['center', 'Center'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right'], ['tile', 'Tiled (repeat)']]],
        ['opacity', 'Opacity (0.05 – 1)', 'range', { min: 0.05, max: 1, step: 0.05 }], ['size', 'Size (% of page width)', 'range', { min: 5, max: 90, step: 1 }], ['rotation', 'Rotation (degrees)', 'range', { min: -90, max: 90, step: 5 }], ['color', 'Text colour', 'color'],
        ['apply_to_clips', 'Add a small brand mark to shared clippings', 'bool']]],
    ],
  },
  recaptcha: {
    api: 'recaptcha', title: 'Google reCAPTCHA', sections: [
      ['Configuration', [['enabled', 'Enable reCAPTCHA', 'bool'], ['version', 'reCAPTCHA version', 'select', [['v2', 'v2 – “I’m not a robot” checkbox'], ['v3', 'v3 – invisible score']]], ['site_key', 'Site key', 'text'],
        ['secret_key', 'Secret key', 'secret', 'Stored encrypted on the server. Leave empty to keep the current key.'], ['min_score', 'Minimum score (v3)', 'number', '0.0 – 1.0, default 0.5']]],
      ['Protect these forms', [['on_login', 'Login', 'bool'], ['on_register', 'Registration', 'bool'], ['on_comment', 'Comments', 'bool'], ['on_subscribe', 'Subscribe', 'bool'], ['on_contact', 'Contact form', 'bool']]],
    ],
  },
  pwa: {
    api: 'pwa', title: 'PWA Settings', sections: [
      ['Application', [['app_name', 'Application name', 'text'], ['short_name', 'Short name', 'text', 'Shown under the home-screen icon (max ~12 chars)'], ['description', 'Description', 'text'], ['start_url', 'Start URL', 'text'],
        ['display', 'Display mode', 'select', [['standalone', 'Standalone (app-like)'], ['fullscreen', 'Fullscreen'], ['minimal-ui', 'Minimal UI'], ['browser', 'Browser']]], ['orientation', 'Orientation', 'select', [['any', 'Any'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]]]],
      ['Look', [['icon', 'Application icon (512×512 PNG)', 'image'], ['logo', 'Application logo', 'image', 'Used when no icon is set'], ['theme_color', 'Theme colour', 'color'], ['background_color', 'Background colour', 'color']]],
    ],
  },
};

/* One-click professional colour palettes for Theme Settings */
export const THEME_PRESETS = [
  { name: 'Corporate Blue', primary_color: '#0e5aa7', secondary_color: '#0f1f3d', header_bg: '#ffffff', header_text: '#0f1f3d', footer_bg: '#0f1f3d', footer_text: '#e6ecf5' },
  { name: 'Classic News Red', primary_color: '#c8102e', secondary_color: '#0b2545', header_bg: '#ffffff', header_text: '#0b2545', footer_bg: '#0b2545', footer_text: '#e8edf5' },
  { name: 'Royal Navy & Gold', primary_color: '#b8860b', secondary_color: '#13294b', header_bg: '#ffffff', header_text: '#13294b', footer_bg: '#13294b', footer_text: '#f3ead2' },
  { name: 'Emerald Professional', primary_color: '#047857', secondary_color: '#0f2e2a', header_bg: '#ffffff', header_text: '#0f2e2a', footer_bg: '#0f2e2a', footer_text: '#d9f2ea' },
  { name: 'Executive Maroon', primary_color: '#8b1e3f', secondary_color: '#2b1a22', header_bg: '#ffffff', header_text: '#2b1a22', footer_bg: '#2b1a22', footer_text: '#f2dfe5' },
  { name: 'Charcoal & Teal', primary_color: '#0f766e', secondary_color: '#1f2933', header_bg: '#ffffff', header_text: '#1f2933', footer_bg: '#1f2933', footer_text: '#e4e7eb' },
  { name: 'Indigo Modern', primary_color: '#4338ca', secondary_color: '#1e1b4b', header_bg: '#ffffff', header_text: '#1e1b4b', footer_bg: '#1e1b4b', footer_text: '#e0e7ff' },
  { name: 'Saffron Heritage', primary_color: '#d9480f', secondary_color: '#2d1b0e', header_bg: '#fffaf3', header_text: '#2d1b0e', footer_bg: '#2d1b0e', footer_text: '#fbe7d3' },
];

function ThemePresets({ values, onPick, disabled }) {
  return (
    <Panel title="Professional colour presets" className="mb-3">
      <p className="small text-muted">Pick a palette, check it, then click <b>Save settings</b>. You can still fine-tune any colour below.</p>
      <div className="row g-2">
        {THEME_PRESETS.map((p) => {
          const active = values.primary_color?.toLowerCase() === p.primary_color && values.secondary_color?.toLowerCase() === p.secondary_color;
          return (
            <div key={p.name} className="col-6 col-md-4 col-xl-3">
              <button type="button" disabled={disabled} onClick={() => onPick(p)} className={`preset-card w-100 ${active ? 'active' : ''}`}>
                <span className="preset-preview">
                  <span className="pp-head" style={{ background: p.header_bg, borderBottom: `3px solid ${p.primary_color}` }}><span style={{ background: p.secondary_color }} /></span>
                  <span className="pp-body"><span className="pp-btn" style={{ background: p.primary_color }} /></span>
                  <span className="pp-foot" style={{ background: p.footer_bg }} />
                </span>
                <span className="d-flex align-items-center gap-1 mt-2">
                  {[p.primary_color, p.secondary_color, p.footer_text].map((c) => <span key={c} className="swatch" style={{ background: c }} />)}
                  <span className="small fw-semibold ms-1 text-truncate">{p.name}</span>
                  {active && <i className="bi bi-check-circle-fill text-primary ms-auto" />}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function LinksEditor({ value, onChange }) {
  const links = Array.isArray(value) ? value : [];
  const set = (i, k, v) => onChange(links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div>
      {links.map((l, i) => (
        <div key={i} className="input-group input-group-sm mb-2">
          <input className="form-control" placeholder="Label" value={l.label} onChange={(e) => set(i, 'label', e.target.value)} />
          <input className="form-control" placeholder="/page/about-us or https://…" value={l.url} onChange={(e) => set(i, 'url', e.target.value)} />
          <button type="button" className="btn btn-outline-danger" onClick={() => onChange(links.filter((_, j) => j !== i))}><i className="bi bi-x" /></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-light border" onClick={() => onChange([...links, { label: '', url: '' }])}><i className="bi bi-plus" /> Add link</button>
    </div>
  );
}

function WatermarkPreview({ values, file }) {
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const fd = toForm({ ...values, logo: undefined, logo_url: undefined });
      if (file) fd.append('logo', file);
      const r = await api.post('/settings/watermark/preview', fd, { responseType: 'blob' });
      setSrc((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(r.data); });
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel title="Preview" actions={<button className="btn btn-sm btn-light border" onClick={refresh} disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-arrow-clockwise" />} Refresh</button>}>
      {src ? <img src={src} alt="Watermark preview" className="img-fluid border rounded" /> : <Spinner size="sm" />}
    </Panel>
  );
}

function RecaptchaTest({ values }) {
  const rc = useRecaptcha('test', values.site_key ? { enabled: true, site_key: values.site_key, version: values.version } : null);
  const test = async () => {
    try { const token = await rc.getToken(); const r = await post('/settings/recaptcha/test', { token }); (r.data.success ? toast.success : toast.error)(r.message); rc.reset(); } catch (e) { toast.error(e.message); }
  };
  if (!values.site_key) return <p className="small text-muted mb-0">Enter and save a site key to test.</p>;
  return (<><p className="small text-muted">Saves are not required for the site key; the server uses the saved secret key. Make sure this domain is allowed in the reCAPTCHA admin console.</p>{rc.element}<button className="btn btn-sm btn-outline-primary" onClick={test}><i className="bi bi-shield-check me-1" />Test configuration</button></>);
}

function SocialLinks() {
  const { can } = useAuth();
  const { reload: reloadSite } = useSettings();
  const { data, loading, reload } = useFetch('/settings/social');
  const [edit, setEdit] = useState(null);
  const PLATFORMS = ['facebook', 'instagram', 'youtube', 'x', 'whatsapp', 'telegram', 'linkedin', 'threads', 'pinterest', 'other'];
  const save = async () => {
    try { const r = edit.id ? await put(`/settings/social/${edit.id}`, edit) : await post('/settings/social', edit); toast.success(r.message); setEdit(null); reload(); reloadSite(); } catch (e) { toast.error(e.message); }
  };
  return (
    <>
      <PageHeader title="Social Page Settings" actions={can('settings.manage') && <button className="btn btn-primary" onClick={() => setEdit({ platform: 'facebook', label: 'Facebook', url: '', status: 'active', sort_order: (data?.length || 0) + 1 })}><i className="bi bi-plus-lg me-1" />Add link</button>} />
      <Panel bodyClass="">
        <DataTable loading={loading} rows={data} columns={[
          { key: 'platform', label: 'Platform', render: (s) => <><i className={`bi bi-${s.icon === 'x' ? 'twitter-x' : s.icon} me-2`} />{s.label}</> },
          { key: 'url', label: 'URL', render: (s) => <a href={s.url} target="_blank" rel="noreferrer" className="small text-break">{s.url}</a> },
          { key: 'sort_order', label: 'Order' },
          { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
          { key: 'a', label: '', className: 'text-end text-nowrap', render: (s) => can('settings.manage') && (<>
            <button className="btn btn-sm btn-light btn-icon me-1" onClick={() => setEdit({ ...s })}><i className="bi bi-pencil" /></button>
            <button className="btn btn-sm btn-light btn-icon text-danger" onClick={() => runAction(() => del(`/settings/social/${s.id}`), { confirmText: `Delete ${s.label}?`, button: 'Delete', onDone: () => { reload(); reloadSite(); } })}><i className="bi bi-trash" /></button>
          </>) },
        ]} />
      </Panel>
      <Modal show={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit social link' : 'Add social link'} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {edit && (<>
          <Field label="Platform"><select className="form-select" value={edit.platform} onChange={(e) => setEdit({ ...edit, platform: e.target.value, icon: e.target.value === 'other' ? 'link-45deg' : e.target.value, label: edit.id ? edit.label : e.target.value[0].toUpperCase() + e.target.value.slice(1) })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Label" required><input className="form-control" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
          <Field label="URL" required><input className="form-control" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://" /></Field>
          <div className="row g-2"><div className="col-6"><Field label="Order"><input type="number" className="form-control" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field></div>
            <div className="col-6"><Field label="Status"><select className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div></div>
        </>)}
      </Modal>
    </>
  );
}

export default function Settings() {
  const { group } = useParams();
  if (group === 'social') return <SocialLinks />;
  return <SettingsForm key={group} group={group} />;
}

function SettingsForm({ group }) {
  const spec = GROUPS[group];
  const { can } = useAuth();
  const { reload: reloadSite } = useSettings();
  const [values, setValues] = useState(null);
  const [files, setFiles] = useState({});
  const [removed, setRemoved] = useState({});
  const [busy, setBusy] = useState(false);
  const [regen, setRegen] = useState(false);
  const { data: cats } = useFetch(group === 'epaper' ? '/categories' : null, { limit: 200 });
  const initial = useRef(null);
  useEffect(() => { if (spec) get(`/settings/${spec.api}`).then((r) => { setValues(r.data); initial.current = r.data; }).catch((e) => toast.error(e.message)); }, [group]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!spec) return <div className="p-5 text-center">Unknown settings page</div>;
  if (!values) return <Spinner />;
  const readOnly = !can('settings.manage');
  const fieldsInGroup = spec.sections.flatMap(([, f]) => f.map((x) => (x[2].startsWith('alias:') ? x[2].slice(6) : x[0])));

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = {};
      for (const k of fieldsInGroup) if (values[k] !== undefined && !(k.endsWith('_url'))) body[k] = values[k];
      for (const [k, f] of Object.entries(files)) if (f) body[k] = f;
      for (const k of Object.keys(removed)) if (removed[k]) body[`remove_${k}`] = 'true';
      const r = await put(`/settings/${spec.api}`, toForm(body));
      setValues(r.data); setFiles({}); setRemoved({});
      toast.success(r.message);
      reloadSite();
      if (group === 'watermark' && (r.data.enabled || initial.current?.enabled)) setRegen(true);
      initial.current = r.data;
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const renderField = ([key, label, type, opt]) => {
    let k = key;
    if (type.startsWith('alias:')) { k = type.slice(6); type = 'text'; }
    const v = values[k];
    const set = (val) => setValues({ ...values, [k]: val });
    const help = typeof opt === 'string' ? opt : undefined;
    switch (type) {
      case 'bool': return <Switch key={k} label={label} checked={v} onChange={set} disabled={readOnly} help={help} id={`s-${k}`} />;
      case 'image': return <Field key={k} label={label}><ImageInput url={removed[k] ? null : values[`${k}_url`]} file={files[k]} onFile={(f) => { setFiles({ ...files, [k]: f }); setRemoved({ ...removed, [k]: !f }); }} help={help} accept={k === 'favicon' ? 'image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg' : undefined} /></Field>;
      case 'color': return <Field key={k} label={label}><ColorInput value={v} onChange={set} /></Field>;
      case 'textarea': return <Field key={k} label={label} help={help}><textarea className="form-control" rows="3" value={v ?? ''} onChange={(e) => set(e.target.value)} disabled={readOnly} /></Field>;
      case 'select': return <Field key={k} label={label} help={help}><select className="form-select" value={v ?? ''} onChange={(e) => set(e.target.value)} disabled={readOnly}>{opt.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>;
      case 'category': return <Field key={k} label={label}><select className="form-select" value={v || ''} onChange={(e) => set(Number(e.target.value))} disabled={readOnly}><option value="0">Any (latest)</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>;
      case 'number': return <Field key={k} label={label} help={help}><input type="number" step="any" className="form-control" value={v ?? ''} onChange={(e) => set(e.target.value)} disabled={readOnly} /></Field>;
      case 'range': return <Field key={k} label={`${label}: ${v}`}><input type="range" className="form-range" min={opt.min} max={opt.max} step={opt.step} value={v} onChange={(e) => set(Number(e.target.value))} disabled={readOnly} /></Field>;
      case 'secret': return <Field key={k} label={<>{label} {values[`${k}_is_set`] && <span className="badge text-bg-success ms-1">saved</span>}</>} help={help}><input type="password" autoComplete="new-password" className="form-control" value={v || ''} placeholder={values[`${k}_is_set`] ? '••••••••••' : ''} onChange={(e) => set(e.target.value)} disabled={readOnly} /></Field>;
      case 'links': return <Field key={k} label={label}><LinksEditor value={v} onChange={set} /></Field>;
      default: return <Field key={k} label={label} help={help}><input type={type} className="form-control" value={v ?? ''} onChange={(e) => set(e.target.value)} disabled={readOnly} /></Field>;
    }
  };

  const half = (f) => ['bool', 'image', 'textarea', 'links', 'range'].includes(f[2]) ? 'col-12' : 'col-md-6';
  return (
    <>
      <PageHeader title={spec.title} crumbs={[{ label: 'Settings' }]} />
      <form onSubmit={save}>
        <div className="row g-3">
          <div className={group === 'watermark' ? 'col-lg-7' : group === 'recaptcha' ? 'col-lg-8' : 'col-xl-9'}>
            {group === 'theme' && <ThemePresets values={values} disabled={readOnly} onPick={(p) => { const { name, ...colors } = p; setValues({ ...values, ...colors }); toast(`“${name}” applied — click Save settings to publish it`); }} />}
            {spec.sections.map(([title, fields]) => (
              <Panel key={title} title={title} className="mb-3">
                <div className="row">
                  {fields.filter((f) => f[2] === 'image').length > 0 && <div className="col-12"><div className="row">{fields.filter((f) => f[2] === 'image').map((f) => <div key={f[0]} className="col-sm-6 col-lg-3">{renderField(f)}</div>)}</div></div>}
                  {fields.filter((f) => f[2] !== 'image').map((f) => <div key={f[0]} className={half(f)}>{renderField(f)}</div>)}
                </div>
              </Panel>
            ))}
            {!readOnly && <div className="d-flex gap-2 sticky-bottom bg-white border rounded p-2 shadow-sm"><button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Save settings</button><button type="button" className="btn btn-light" onClick={() => { setValues(initial.current); setFiles({}); setRemoved({}); }}>Reset</button></div>}
          </div>
          {group === 'watermark' && (
            <div className="col-lg-5">
              <WatermarkPreview values={values} file={files.logo} />
              <Panel title="Apply to uploaded pages" className="mt-3">
                <p className="small text-muted">New uploads use the saved settings automatically. To update existing pages, re-process them from their preserved originals (originals are never modified).</p>
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => runAction(() => post('/pages/regenerate', {}), { confirmText: 'Re-process all newspaper pages with the current watermark settings? This can take a while for large archives.', variant: 'primary', button: 'Apply to all pages' })}><i className="bi bi-arrow-repeat me-1" />Apply to all existing pages</button>
              </Panel>
            </div>
          )}
          {group === 'recaptcha' && <div className="col-lg-4"><Panel title="Test configuration"><RecaptchaTest values={values} /></Panel></div>}
          {group === 'pwa' && <div className="col-xl-3"><Panel title="Manifest"><p className="small text-muted">The web app manifest and icons are generated from these settings.</p><a href={`${API_ORIGIN}/manifest.webmanifest`} target="_blank" rel="noreferrer" className="small">View manifest.webmanifest</a></Panel></div>}
        </div>
      </form>
      <Modal show={regen} onClose={() => setRegen(false)} title="Apply watermark to existing pages?" footer={<><button className="btn btn-light" onClick={() => setRegen(false)}>Later</button><button className="btn btn-primary" onClick={() => { setRegen(false); runAction(() => post('/pages/regenerate', {})); }}>Apply now</button></>}>
        Watermark settings were saved. New uploads will use them. Do you want to re-process all existing pages now?
      </Modal>
    </>
  );
}
