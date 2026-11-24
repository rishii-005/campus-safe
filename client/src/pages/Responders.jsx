import { api } from '../lib/api.js';
import { useApp, useAsync } from '../context.jsx';
import { Card, Page, Spinner, ErrorBox, Empty } from '../components/ui.jsx';

export default function Responders() {
  const { user, toast } = useApp();
  const { data, loading, error, reload } = useAsync(() => api('/responders'), []);
  async function set(id, availability) {
    try { await api(`/responders/${id}/availability`, { method: 'PATCH', body: { availability } }); reload(); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <Page title="Responders" subtitle="Availability and workload. Assignment picks from this list, based on department, availability and current workload.">
      <Card>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading ? <Spinner /> : !data?.responders.length ? <Empty title="No responders yet" hint="An administrator can create staff accounts and mark them as responders." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">Name</th><th>Department</th><th>Availability</th><th>Current assignment</th><th>Workload</th><th>Past assignments</th></tr></thead>
            <tbody>{data.responders.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-semibold">{r.name}</td><td>{r.department_name}</td>
                <td><select aria-label={`Availability of ${r.name}`} className="rounded border border-line px-2 py-1" value={r.availability} onChange={(e) => set(r.id, e.target.value)} disabled={!(user.role === 'ADMIN' || r.user_id === user.id || r.department_id === user.department_id)}><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="OFFLINE">Offline</option></select></td>
                <td className="font-mono text-xs">{r.current_incident || '-'}</td>
                <td className={r.active_count >= r.max_workload ? 'font-bold text-signal' : ''}>{r.active_count} / {r.max_workload}</td><td>{r.total_count}</td>
              </tr>))}</tbody></table></div>
        )}
      </Card>
    </Page>
  );
}
