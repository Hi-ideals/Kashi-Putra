import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Panel, DataTable, Pagination, useAdminList, runAction, ImageInput, Switch, StatCard } from '../../components/admin';
import { Field, StatusBadge, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useFetch } from '../../hooks';
import { post, put, del, toForm, mediaUrl } from '../../services/api';
import { enablePush, pushSupported } from '../../services/push';
import { formatDateTime } from '../../utils/format';

const EMPTY = { title: '', message: '', url: '', audience: 'all', edition_id: '', send_now: true };

export default function Notifications() {
  const { can } = useAuth();
  const { site } = useSettings();
  const list = useAdminList('/notifications', { limit: 15 });
  const { data: eds } = useFetch('/editions', { status: 'published', limit: 30 });
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const subs = list.meta?.subscriptions || {};
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await post('/notifications', toForm({ ...form, image: image || undefined })); toast.success(r.message); setForm(EMPTY); setImage(null); list.reload(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const pickEdition = (id) => {
    const ed = (eds || []).find((x) => String(x.id) === String(id));
    setForm((f) => ({ ...f, edition_id: id, ...(ed ? { title: f.title || `${site.site_name}: ${ed.title}`, message: f.message || `The ${ed.edition_date} edition is now available. Tap to read.`, url: `/edition/${ed.slug}` } : {}) }));
  };
  return (
    <>
      <PageHeader title="Push Notifications" actions={<>
        {pushSupported() && <button className="btn btn-light border" onClick={() => enablePush(site.vapid_public_key).then(() => { toast.success('This browser is subscribed — send a test!'); list.reload(); }).catch((e) => toast.error(e.message))}><i className="bi bi-bell me-1" />Subscribe this browser</button>}
        {can('settings.view') && <Link to="/admin/settings/epaper" className="btn btn-light border"><i className="bi bi-gear" /></Link>}
      </>} />
      {!site.push_enabled && <div className="alert alert-warning">Push notifications are disabled. Enable them below in Notification settings.</div>}
      <div className="row g-3 mb-3">
        <div className="col-sm-4"><StatCard icon="phone-vibrate" label="Subscribed devices" value={subs.active} color="#16a34a" /></div>
        <div className="col-sm-4"><StatCard icon="person-check" label="Logged-in devices" value={subs.users} /></div>
        <div className="col-sm-4"><StatCard icon="phone-x" label="Expired" value={subs.expired} color="#64748b" /></div>
      </div>
      <div className="row g-3">
        {can('notifications.add') && (
          <div className="col-xl-5">
            <Panel title="Send a notification">
              <form onSubmit={send}>
                <Field label="Link to an edition (optional)"><select className="form-select" value={form.edition_id} onChange={(e) => pickEdition(e.target.value)}><option value="">—</option>{(eds || []).map((e) => <option key={e.id} value={e.id}>{e.title} ({e.edition_date})</option>)}</select></Field>
                <Field label="Title" required><input className="form-control" maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <Field label="Message" required><textarea className="form-control" rows="3" maxLength={500} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                <Field label="Destination URL" help="Where the notification opens, e.g. /edition/… or https://…"><input className="form-control" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></Field>
                <Field label="Audience"><select className="form-select" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}><option value="all">All subscribed devices</option><option value="users">Logged-in readers only</option><option value="guests">Guests only</option></select></Field>
                <Field label="Image (optional)"><ImageInput file={image} onFile={setImage} /></Field>
                <Switch label="Send immediately (otherwise save as draft)" checked={form.send_now} onChange={(v) => setForm({ ...form, send_now: v })} />
                <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}<i className="bi bi-send me-1" />{form.send_now ? 'Send notification' : 'Save draft'}</button>
              </form>
            </Panel>
            <NotificationSettings />
          </div>
        )}
        <div className={can('notifications.add') ? 'col-xl-7' : 'col-12'}>
          <Panel title="Notification history" bodyClass="">
            <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty={<EmptyState icon="bell" title="No notifications sent yet" />} columns={[
              { key: 'title', label: 'Notification', render: (n) => <div className="d-flex gap-2">{n.image_url && <img src={mediaUrl(n.image_url)} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />}<div><b>{n.title}</b><div className="small text-muted">{n.message}</div>{n.url && <div className="small"><code>{n.url}</code></div>}</div></div> },
              { key: 'audience', label: 'Audience', render: (n) => <span className="text-capitalize small">{n.audience}</span> },
              { key: 'status', label: 'Status', render: (n) => <><StatusBadge status={n.status} /><div className="small text-muted">{n.sent_count} sent{n.failed_count ? `, ${n.failed_count} failed` : ''}</div></> },
              { key: 'date', label: 'Date', render: (n) => <span className="small">{formatDateTime(n.sent_at || n.created_at)}<br />{n.created_by_name || 'Auto'}</span> },
              { key: 'a', label: '', className: 'text-end text-nowrap', render: (n) => can('notifications.add') && (<>
                <button className="btn btn-sm btn-light me-1" title="Send again" onClick={() => runAction(() => post(`/notifications/${n.id}/send`), { confirmText: 'Send this notification again to all matching devices?', variant: 'primary', button: 'Send', onDone: list.reload })}><i className="bi bi-send" /></button>
                <button className="btn btn-sm btn-light text-danger" onClick={() => runAction(() => del(`/notifications/${n.id}`), { confirmText: 'Delete from history?', button: 'Delete', onDone: list.reload })}><i className="bi bi-trash" /></button>
              </>) },
            ]} />
            <Pagination meta={list.meta} onPage={list.setPage} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function NotificationSettings() {
  const { can } = useAuth();
  const { site, reload } = useSettings();
  const { data } = useFetch(can('settings.view') ? '/settings/website' : null);
  const [v, setV] = useState(null);
  const cur = v || data;
  if (!cur || !can('settings.view')) return null;
  const save = (patch) => { const n = { ...cur, ...patch }; setV(n); runAction(async () => { const r = await put('/settings/website', toForm(patch)); reload(); return r; }); };
  return (
    <Panel title="Notification settings" className="mt-3">
      <Switch label="Enable browser push notifications" checked={cur.push_enabled} onChange={(x) => save({ push_enabled: x })} disabled={!can('settings.manage')} />
      <Switch label="Automatically notify when an edition is published" checked={cur.push_auto_on_publish} onChange={(x) => save({ push_auto_on_publish: x })} disabled={!can('settings.manage')} />
      <div className="small text-muted">Uses the Web Push standard (VAPID). Keys are generated and stored securely on the server. Site: {site.site_name}</div>
    </Panel>
  );
}
