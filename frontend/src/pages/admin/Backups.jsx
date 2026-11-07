import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, runAction, Switch, StatCard } from '../../components/admin';
import { Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks';
import { post, put, del, download } from '../../services/api';
import { formatDateTime } from '../../utils/format';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TYPE_STYLE = {
  manual: { label: 'Manual', icon: 'hand-index', cls: 'bk-type-manual' },
  daily: { label: 'Daily', icon: 'calendar-day', cls: 'bk-type-daily' },
  weekly: { label: 'Weekly', icon: 'calendar-week', cls: 'bk-type-weekly' },
  monthly: { label: 'Monthly', icon: 'calendar-month', cls: 'bk-type-monthly' },
};

export function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function scheduleText(s) {
  if (!s?.auto_enabled) return 'Automatic backup is off';
  const t = s.time || '02:00';
  if (s.frequency === 'weekly') return `Every ${WEEKDAYS[s.weekday] || 'Sunday'} at ${t}`;
  if (s.frequency === 'monthly') return `On the ${ordinal(Number(s.month_day) || 1)} of every month at ${t}`;
  return `Every day at ${t}`;
}

export default function Backups() {
  const { can } = useAuth();
  const manage = can('backups.manage');
  const { data, loading, error, reload } = useFetch('/backups');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [media, setMedia] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => { if (data?.settings && !form) setForm(data.settings); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyRunning = !!data?.running || (data?.items || []).some((b) => b.status === 'running');
  // Refresh while a backup is being written
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = setInterval(() => reload(true), 2500);
    return () => clearInterval(t);
  }, [anyRunning, reload]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveSettings = async () => {
    setSaving(true); setErrors({});
    try {
      const r = await put('/backups/settings', {
        auto_enabled: !!form.auto_enabled, frequency: form.frequency, time: form.time,
        weekday: Number(form.weekday), month_day: Number(form.month_day),
        include_media: !!form.include_media, keep_count: Number(form.keep_count),
      });
      toast.success(r.message); setForm(r.data); reload(true);
    } catch (e) { setErrors(e.errors || {}); toast.error(e.message); }
    setSaving(false);
  };

  const backupNow = async () => {
    setStarting(true);
    try { const r = await post('/backups', { include_media: media }); toast.success(r.message); reload(true); } catch (e) { toast.error(e.message); }
    setStarting(false);
  };

  const items = data?.items || [];
  const lastOk = items.find((b) => b.status === 'completed');
  const s = data?.settings;

  const cols = [
    { key: 'file', label: 'Backup file', render: (b) => (
      <div className="d-flex align-items-center gap-2">
        <span className="bk-file-ic"><i className="bi bi-file-earmark-zip" /></span>
        <div><div className="fw-semibold text-break">{b.file_name}</div>
          <div className="small text-muted">{b.includes_media ? 'Database + images & files' : 'Database only'}{b.tables_count ? ` · ${b.tables_count} tables` : ''}</div></div>
      </div>) },
    { key: 'type', label: 'Type', render: (b) => { const t = TYPE_STYLE[b.type] || TYPE_STYLE.manual; return <span className={`bk-type ${t.cls}`}><i className={`bi bi-${t.icon}`} />{t.label}</span>; } },
    { key: 'size', label: 'Size', render: (b) => (b.status === 'completed' ? formatBytes(b.size_bytes) : '—') },
    { key: 'created', label: 'Created', render: (b) => <><div>{formatDateTime(b.created_at)}</div><div className="small text-muted">{b.created_by_name ? `by ${b.created_by_name}` : 'Automatic'}</div></> },
    { key: 'status', label: 'Status', render: (b) => (
      <>{b.status === 'running' ? <span className="badge rounded-pill text-bg-info"><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }} />Running</span> : <StatusBadge status={b.status} />}
        {b.error_message && <div className="small text-danger mt-1">{b.error_message}</div>}
        {b.status === 'completed' && !b.file_exists && <div className="small text-danger mt-1">File missing on server</div>}</>) },
    { key: 'a', label: '', className: 'text-end text-nowrap', render: (b) => (<>
      {b.status === 'completed' && b.file_exists && <button className="btn btn-sm btn-primary me-1" onClick={() => download(`/backups/${b.id}/download`, null, b.file_name).catch((e) => toast.error(e.message))}><i className="bi bi-download me-1" />Download</button>}
      {manage && b.status !== 'running' && <button className="btn btn-sm btn-light btn-icon text-danger" title="Delete" onClick={() => runAction(() => del(`/backups/${b.id}`), { confirmText: `Delete ${b.file_name}? This cannot be undone.`, button: 'Delete', onDone: () => reload(true) })}><i className="bi bi-trash" /></button>}
    </>) },
  ];

  return (
    <>
      <PageHeader title="Backups" subtitle="Automatic and manual backups of the database and all uploaded newspaper files"
        actions={manage && <button className="btn btn-primary" disabled={starting || anyRunning} onClick={backupNow}>
          {starting || anyRunning ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-cloud-arrow-down me-1" />}{anyRunning ? 'Backup running…' : 'Backup now'}</button>} />

      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3"><StatCard icon="archive" label="Total backups" value={loading && !data ? '…' : items.filter((b) => b.status === 'completed').length} color="#6366f1" /></div>
        <div className="col-sm-6 col-xl-3"><StatCard icon="hdd-stack" label="Space used" value={data ? formatBytes(data.total_size) : '…'} color="#0891b2" /></div>
        <div className="col-sm-6 col-xl-3"><StatCard icon="check2-circle" label="Last backup" value={lastOk ? formatDateTime(lastOk.created_at).replace(/, \d{4}/, '') : 'Never'} color="#16a34a" /></div>
        <div className="col-sm-6 col-xl-3"><StatCard icon="alarm" label={s?.auto_enabled ? 'Next automatic backup' : 'Automatic backup'} value={s?.auto_enabled ? (s.next_run_at ? formatDateTime(s.next_run_at).replace(/, \d{4}/, '') : '—') : 'Off'} color={s?.auto_enabled ? '#ea580c' : '#64748b'} /></div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-7">
          <Panel title={<><i className="bi bi-arrow-repeat me-2" />Automatic backup</>}>
            {!form ? <div className="text-muted">Loading…</div> : (<>
              <Switch label="Turn on automatic backup" checked={form.auto_enabled} disabled={!manage} onChange={(v) => set('auto_enabled', v)} help="The server makes a backup on its own at the time you choose." />
              <fieldset disabled={!manage} className={form.auto_enabled ? '' : 'bk-dim'}>
                <label className="form-label mt-2">How often</label>
                <div className="bk-freq mb-3">
                  {['daily', 'weekly', 'monthly'].map((f) => (
                    <button type="button" key={f} className={`bk-freq-btn ${form.frequency === f ? 'active' : ''}`} onClick={() => set('frequency', f)}>
                      <i className={`bi bi-${TYPE_STYLE[f].icon}`} /><span>{TYPE_STYLE[f].label}</span>
                    </button>))}
                </div>
                <div className="row g-3">
                  <div className="col-sm-4"><Field label="Time" error={errors.time} className="mb-0"><input type="time" className="form-control" value={form.time} onChange={(e) => set('time', e.target.value)} /></Field></div>
                  {form.frequency === 'weekly' && <div className="col-sm-4"><Field label="Day of week" error={errors.weekday} className="mb-0">
                    <select className="form-select" value={form.weekday} onChange={(e) => set('weekday', e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field></div>}
                  {form.frequency === 'monthly' && <div className="col-sm-4"><Field label="Day of month" error={errors.month_day} className="mb-0">
                    <select className="form-select" value={form.month_day} onChange={(e) => set('month_day', e.target.value)}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{ordinal(i + 1)}</option>)}</select></Field></div>}
                  <div className="col-sm-4"><Field label="Keep last" error={errors.keep_count} className="mb-0" help="Older automatic backups are deleted">
                    <div className="input-group"><input type="number" min="1" max="365" className="form-control" value={form.keep_count} onChange={(e) => set('keep_count', e.target.value)} /><span className="input-group-text">backups</span></div></Field></div>
                </div>
                <div className="mt-3"><Switch label="Include images & uploaded files" checked={form.include_media} onChange={(v) => set('include_media', v)} help="Turn off to back up only the database (much smaller file)." /></div>
              </fieldset>
              <div className="bk-summary mt-3"><i className="bi bi-info-circle" /><span>{scheduleText(form)}{form.frequency === 'monthly' && Number(form.month_day) > 28 && form.auto_enabled ? ' (last day in shorter months)' : ''}. Uses this server's clock.</span></div>
              {manage && <div className="mt-3"><button className="btn btn-primary" disabled={saving} onClick={saveSettings}>{saving && <span className="spinner-border spinner-border-sm me-2" />}Save schedule</button></div>}
            </>)}
          </Panel>
        </div>
        <div className="col-lg-5">
          <Panel title={<><i className="bi bi-hand-index me-2" />Manual backup</>}>
            <p className="text-muted">Make a backup right now, for example before a big change. Manual backups are never deleted automatically.</p>
            <Switch label="Include images & uploaded files" checked={media} disabled={!manage} onChange={setMedia} />
            {manage && <button className="btn btn-primary w-100 mt-2 py-2" disabled={starting || anyRunning} onClick={backupNow}>
              {starting || anyRunning ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-cloud-arrow-down me-2" />}{anyRunning ? 'Backup running…' : 'Backup now'}</button>}
            <div className="bk-note mt-3">
              <div className="fw-semibold mb-1"><i className="bi bi-box-seam me-1" />Each backup is a ZIP file with:</div>
              <ul className="mb-0 ps-3 small">
                <li><b>database.sql</b> — the full database (import it in MySQL Workbench → Server → Data Import)</li>
                <li><b>uploads/</b> and <b>storage/originals/</b> — page images, logos and clips</li>
              </ul>
              <div className="small text-muted mt-2">Stored on the server in <code className="text-break">{data?.folder || 'backend/storage/backups'}</code>. Download copies to keep them safe somewhere else too.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title={<><i className="bi bi-clock-history me-2" />Backup history</>} bodyClass="">
        <DataTable columns={cols} rows={items} loading={loading} error={error} onRetry={reload}
          empty={<EmptyState icon="archive" title="No backups yet" text="Click “Backup now” or turn on automatic backup." />} />
      </Panel>
    </>
  );
}
