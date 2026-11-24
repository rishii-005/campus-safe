import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, AlertTriangle, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync, useSocketEvent, useApp } from '../context.jsx';
import { TYPE_LABEL, STATUS_LABEL, fmt } from '../lib/constants.js';
import { StatusBadge, PriorityBadge, Spinner, Empty, ErrorBox, input } from './ui.jsx';

// Shared incident table. `fixed` pins filters (e.g. only live SOS); `filters` shows the filter bar.
export default function IncidentList({ fixed = {}, filters = false, emptyText = 'Nothing here yet' }) {
  const { user } = useApp();
  const [f, setF] = useState({ q: '', status: '', type: '', priority: '', source: '', from: '', to: '', department: '' });
  const [depts, setDepts] = useState([]);
  const qs = new URLSearchParams(Object.entries({ ...f, ...fixed }).filter(([, v]) => v)).toString();
  const { data, loading, error, reload } = useAsync(async () => {
    if (user.role === 'ADMIN' && filters && !depts.length) api('/admin/departments').then((d) => setDepts(d.departments)).catch(() => {});
    return (await api(`/incidents?${qs}`)).incidents;
  }, [qs]);
  useSocketEvent('incident:changed', reload);
  useSocketEvent('incident:new', reload);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      {filters && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2"><span className="sr-only">Search</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${input} pl-9`} placeholder="Search reference, title or location" value={f.q} onChange={set('q')} /></label>
          <select aria-label="Status" className={input} value={f.status} onChange={set('status')}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Category" className={input} value={f.type} onChange={set('type')}><option value="">All categories</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Priority" className={input} value={f.priority} onChange={set('priority')}><option value="">All priorities</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}</select>
          <select aria-label="Source" className={input} value={f.source} onChange={set('source')}><option value="">Alerts and complaints</option><option value="PUBLIC_SOS">Emergency alerts</option><option value="AUTHENTICATED_COMPLAINT">Complaints</option></select>
          {user.role === 'ADMIN' && <select aria-label="Department" className={input} value={f.department} onChange={set('department')}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
          <label className="text-xs text-slate-600">From<input type="date" className={input} value={f.from} onChange={set('from')} /></label>
          <label className="text-xs text-slate-600">To<input type="date" className={input} value={f.to} onChange={set('to')} /></label>
        </div>
      )}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading ? <Spinner /> : !data?.length ? <Empty title={emptyText} hint={filters && qs ? 'Try clearing a filter.' : undefined} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2 pr-3">Reference</th><th className="pr-3">Category</th><th className="pr-3">Priority</th><th className="pr-3">Status</th><th className="pr-3">Department</th><th>Created</th></tr></thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} className={`border-b border-line last:border-0 hover:bg-slate-50 ${['CREATED', 'SUBMITTED'].includes(i.status) && i.incident_source === 'PUBLIC_SOS' ? 'bg-red-50/60' : ''}`}>
                  <td className="py-2.5 pr-3"><Link className="font-mono font-bold text-ink underline" to={`/portal/incidents/${i.id}`}>{i.incident_reference}</Link>
                    {i.title && <p className="max-w-[16rem] truncate text-xs text-slate-500">{i.title}</p>}</td>
                  <td className="pr-3"><span>{TYPE_LABEL[i.incident_type] || i.incident_type}</span>{i.is_confidential && <Lock className="ml-1 inline h-3 w-3 text-slate-400" aria-label="Confidential" />}<p className="text-xs text-slate-500">{i.incident_source === 'PUBLIC_SOS' ? 'SOS alert' : 'Complaint'}</p></td>
                  <td className="pr-3"><PriorityBadge priority={i.priority} /></td>
                  <td className="pr-3"><StatusBadge status={i.status} />{i.is_delayed && <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-bold text-signal"><AlertTriangle className="h-3 w-3" />Delayed</span>}</td>
                  <td className="pr-3">{i.department_name || '-'}</td>
                  <td className="whitespace-nowrap text-slate-600">{fmt(i.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
