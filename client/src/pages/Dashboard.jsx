import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, BookOpenCheck, FlaskConical, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api, download } from '../lib/api.js';
import { useApp, useAsync, useSocketEvent } from '../context.jsx';
import { ROLE_LABEL, TYPE_LABEL, mins, fmt } from '../lib/constants.js';
import { Card, Page, Stat, Spinner, ErrorBox, Empty, btn, input } from '../components/ui.jsx';
import IncidentList from '../components/IncidentList.jsx';

export default function Dashboard() {
  const { user } = useApp();
  if (user.role === 'STUDENT') return <StudentDashboard />;
  if (user.role === 'ADMIN') return <AdminDashboard />;
  return <StaffDashboard />;
}

function useStats() {
  const s = useAsync(async () => (await api('/incidents/stats')).stats, []);
  useSocketEvent('incident:changed', s.reload); useSocketEvent('incident:new', s.reload);
  return s;
}

function StudentDashboard() {
  const { user, notes } = useApp();
  const { data: s, loading } = useStats();
  return (
    <Page title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`${user.registration_no || ''}${user.hostel ? ` · ${user.hostel}` : ''}`}
      action={<Link to="/portal/report" className={btn.primary}><FilePlus2 className="h-4 w-4" /> Report new incident</Link>}>
      {loading ? <Spinner /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Total complaints" value={s.total} /><Stat label="Active" value={s.active} tone="amber" /><Stat label="Resolved" value={s.resolved} tone="green" /><Stat label="Unread notifications" value={notes.unread} tone="red" /></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="My recent complaints" className="lg:col-span-2" action={<Link className="text-sm font-semibold underline" to="/portal/incidents">View all</Link>}><IncidentList emptyText="No complaints yet. Use Report new incident when you need to." /></Card>
        <div className="space-y-4">
          <Card title="Recent notifications">{!notes.list.length ? <p className="text-sm text-slate-500">Nothing yet.</p> : <ul className="space-y-2 text-sm">{notes.list.slice(0, 5).map((n) => <li key={n.id} className={n.is_read ? 'text-slate-600' : 'font-bold text-ink'}>{n.title}<span className="block text-xs font-normal text-slate-400">{fmt(n.created_at)}</span></li>)}</ul>}</Card>
          <Card title="Be prepared"><div className="space-y-2"><Link to="/portal/safety" className={`${btn.ghost} w-full`}><BookOpenCheck className="h-4 w-4" /> Safety and guidance</Link><Link to="/portal/simulation" className={`${btn.ghost} w-full`}><FlaskConical className="h-4 w-4" /> Practise an emergency</Link></div></Card>
        </div>
      </div>
    </Page>
  );
}

function StaffDashboard() {
  const { user } = useApp();
  const { data: s, loading, error, reload } = useStats();
  return (
    <Page title={`${ROLE_LABEL[user.role]} dashboard`} subtitle={`${user.department_name || ''}. New alerts appear here instantly and play a short sound.`}>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Active emergency alerts" value={s.active_emergencies} tone="red" /><Stat label="Pending acknowledgement" value={s.pending_ack} tone="red" hint={s.delayed ? `${s.delayed} delayed` : undefined} />
          <Stat label="Assigned" value={s.assigned} tone="amber" /><Stat label="Being handled" value={s.in_progress} tone="amber" />
          <Stat label="High priority open" value={s.high_priority} /><Stat label="Resolved" value={s.resolved} tone="green" /><Stat label="All incidents" value={s.total} /><Stat label="Open (total)" value={s.active} />
        </div>
      )}
      <Card title="Live emergency alerts" action={<Link className="text-sm font-semibold underline" to="/portal/incidents">All incidents</Link>}><IncidentList fixed={{ source: 'PUBLIC_SOS', active: 'true' }} emptyText="No active emergency alerts" /></Card>
      <Card title="Open complaints"><IncidentList fixed={{ source: 'AUTHENTICATED_COMPLAINT', active: 'true' }} emptyText="No open complaints" /></Card>
    </Page>
  );
}

const C = { ink: '#0b2545', red: '#d7263d', amber: '#e8890c', green: '#1b8a5a', blue: '#3b6fd4' };

function AdminDashboard() {
  const [range, setRange] = useState({ from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const { data: d, loading, error, reload } = useAsync(() => api(`/admin/analytics?${qs}`), [qs]);
  useSocketEvent('incident:new', reload);
  const t = d?.totals;
  const exp = (ext) => download(`/admin/reports/incidents.${ext}?${qs}`, `campus-safe-incidents.${ext}`).catch((e) => alert(e.message));
  return (
    <Page title="Administration overview" subtitle="Live figures from the incident database."
      action={<div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">From<input type="date" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-xs text-slate-600">To<input type="date" className={input} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button className={btn.ghost} onClick={() => exp('csv')}><Download className="h-4 w-4" /> CSV</button><button className={btn.ghost} onClick={() => exp('pdf')}><Download className="h-4 w-4" /> PDF</button></div>}>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading ? <Spinner /> : d && (<>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="Total incidents" value={t.total} /><Stat label="Active" value={t.active} tone="amber" /><Stat label="Pending" value={t.pending} tone="red" /><Stat label="Resolved" value={t.resolved} tone="green" /><Stat label="Cancelled alerts" value={t.cancelled} /><Stat label="Student complaints" value={t.complaints} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Avg. time to acknowledge" value={mins(t.avg_ack)} /><Stat label="Avg. time to assign" value={mins(t.avg_assign)} /><Stat label="Avg. time to resolve" value={mins(t.avg_resolve)} />
          <Stat label="Simulation average score" value={d.simulation.avg_score ?? 'n/a'} hint={`${d.simulation.completed} of ${d.simulation.sessions} sessions completed`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Monthly trend">{d.monthly.length ? <Chart h={260}><LineChart data={d.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line dataKey="emergencies" name="SOS alerts" stroke={C.red} strokeWidth={2} /><Line dataKey="complaints" name="Complaints" stroke={C.ink} strokeWidth={2} /></LineChart></Chart> : <Empty title="No data in this range" />}</Card>
          <Card title="Incidents by category">{d.byType.length ? <Chart h={260}><BarChart data={d.byType.map((x) => ({ ...x, name: TYPE_LABEL[x.name] || x.name }))} layout="vertical" margin={{ left: 30 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} /><Tooltip /><Bar dataKey="value" name="Incidents" fill={C.blue} /></BarChart></Chart> : <Empty title="No data in this range" />}</Card>
          <Card title="Incidents by department">{d.byDepartment.length ? <Chart h={240}><BarChart data={d.byDepartment}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Incidents" fill={C.ink} /></BarChart></Chart> : <Empty title="No data in this range" />}</Card>
          <Card title="Hostel / building reports (as entered)">{d.byLocation.length ? <Chart h={240}><BarChart data={d.byLocation}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Reports" fill={C.amber} /></BarChart></Chart> : <Empty title="No location text yet" />}</Card>
        </div>
        <Card title="Pending complaint ageing"><div className="grid grid-cols-3 gap-3 text-center"><Stat label="Under 1 day" value={d.aging.under_1d} tone="green" /><Stat label="1 to 3 days" value={d.aging.d1_3} tone="amber" /><Stat label="Over 3 days" value={d.aging.over_3d} tone="red" /></div></Card>
      </>)}
    </Page>
  );
}
const Chart = ({ h, children }) => <div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
