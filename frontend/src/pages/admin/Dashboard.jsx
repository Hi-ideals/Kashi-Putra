import { Link } from 'react-router-dom';
import { PageHeader, Panel, StatCard } from '../../components/admin';
import { Spinner, ErrorState, StatusBadge } from '../../components/common';
import { useFetch } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format';

function Bars({ data, days = 14, label }) {
  const map = Object.fromEntries((data || []).map((d) => [String(d.d).slice(0, 10), Number(d.n)]));
  const list = Array.from({ length: days }, (_, i) => {
    const dt = new Date(Date.now() - (days - 1 - i) * 86400000);
    const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { k, n: map[k] || 0 };
  });
  const max = Math.max(1, ...list.map((x) => x.n));
  return (
    <>
      <div className="bar-chart" role="img" aria-label={label}>
        {list.map((x) => <div key={x.k} className="b" style={{ height: `${(x.n / max) * 100}%` }} data-tip={`${formatDate(x.k, 'DD MMM')}: ${x.n}`} />)}
      </div>
      <div className="d-flex justify-content-between small text-muted mt-1"><span>{formatDate(list[0].k, 'DD MMM')}</span><span>Today</span></div>
    </>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data, loading, error, reload } = useFetch('/admin/dashboard');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data.stats;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user.name}`} actions={<>
        {can('editions.add') && <Link to="/admin/editions/new" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />New edition</Link>}
        {can('editions.publish', 'pages.add') && <Link to="/admin/publish" className="btn btn-outline-primary"><i className="bi bi-cloud-upload me-1" />Publish edition</Link>}
      </>} />
      <div className="row g-3 mb-4">
        {[
          ['journal-richtext', 'Total editions', s.total_editions, '#2563eb', '/admin/editions'],
          ['check2-circle', 'Published', s.published_editions, '#16a34a', '/admin/editions?status=published'],
          ['pencil-square', 'Drafts', s.draft_editions, '#64748b', '/admin/editions?status=draft'],
          ['calendar-check', 'Scheduled', s.scheduled_editions, '#0891b2', '/admin/schedules'],
          ['file-earmark-image', 'Newspaper pages', s.total_pages, '#7c3aed'],
          ['people', 'Subscribers', `${s.active_subscribers} / ${s.total_subscribers}`, '#ea580c', '/admin/subscribers'],
          ['person-badge', 'Registered users', s.total_users, '#0d9488', '/admin/users'],
          ['chat-square-text', 'Comments', s.total_comments, '#db2777', '/admin/comments'],
          ['hourglass-split', 'Pending comments', s.pending_comments, '#dc2626', '/admin/comments?status=pending'],
          ['eye', 'Edition views', s.total_views.toLocaleString(), '#4f46e5'],
          ['scissors', 'Shared clippings', s.clippings, '#ca8a04', '/admin/clippings'],
          ['bell', 'Push subscribers', s.push_subscribers, '#0284c7', '/admin/notifications'],
        ].map(([icon, label, value, color, to]) => (
          <div key={label} className="col-6 col-md-4 col-xl-3"><StatCard icon={icon} label={label} value={value} color={color} to={to} /></div>
        ))}
      </div>
      <div className="row g-3">
        <div className="col-xl-8">
          <Panel title="Latest published editions" actions={<Link to="/admin/editions?status=published" className="small">View all</Link>} bodyClass="">
            <div className="table-responsive">
              <table className="table table-hover rt">
                <thead><tr><th>Edition</th><th>Date</th><th>Pages</th><th>Views</th><th>Published</th></tr></thead>
                <tbody>
                  {data.latest.length ? data.latest.map((e) => (
                    <tr key={e.id}>
                      <td className="rt-head"><Link to={`/admin/editions/${e.id}`} className="fw-semibold">{e.title}</Link><div className="small text-muted">{e.category_name}</div></td>
                      <td data-label="Date">{formatDate(e.edition_date)}</td><td data-label="Pages">{e.page_count}</td><td data-label="Views">{e.view_count}</td><td data-label="Published" className="small">{timeAgo(e.published_at)}</td>
                    </tr>
                  )) : <tr className="rt-full"><td colSpan="5" className="text-center text-muted py-4">No published editions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="row g-3 mt-0">
            <div className="col-md-6"><Panel title="Editions published (14 days)"><Bars data={data.trend} label="Editions published per day" /></Panel></div>
            <div className="col-md-6"><Panel title="New subscribers (14 days)"><Bars data={data.subscriber_trend} label="New subscribers per day" /></Panel></div>
          </div>
        </div>
        <div className="col-xl-4">
          <Panel title="Upcoming publications" actions={<Link to="/admin/schedules" className="small">Manage</Link>} className="mb-3">
            {data.upcoming.length ? (
              <ul className="list-unstyled mb-0">
                {data.upcoming.map((u) => (
                  <li key={u.id} className="d-flex justify-content-between py-2 border-bottom small">
                    <Link to={`/admin/editions/${u.edition_id}`}>{u.title}</Link><span className="text-muted">{formatDateTime(u.publish_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted small mb-0">No scheduled editions.</p>}
          </Panel>
          <Panel title="Recent activity" actions={can('audit_logs.view') && <Link to="/admin/audit-logs" className="small">All logs</Link>}>
            <ul className="list-unstyled mb-0">
              {data.activity.map((a) => (
                <li key={a.id} className="py-2 border-bottom small">
                  <div><b>{a.user_name || 'System'}</b> <span className="text-muted">·</span> <code>{a.action}</code></div>
                  <div className="text-muted">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''} · {timeAgo(a.created_at)}</div>
                </li>
              ))}
            </ul>
          </Panel>
          {s.unread_messages > 0 && <Link to="/admin/messages" className="alert alert-info d-block mt-3 small mb-0"><i className="bi bi-envelope me-2" />{s.unread_messages} unread contact message(s)</Link>}
          <div className="mt-3 small text-muted">Draft <StatusBadge status="draft" /> · Unpublished: {s.unpublished_editions} · Archived: {s.archived_editions}</div>
        </div>
      </div>
    </>
  );
}
