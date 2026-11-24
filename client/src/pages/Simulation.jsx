import { useState } from 'react';
import { FlaskConical, Check, Play } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../context.jsx';
import { TYPE_LABEL, fmt, secs } from '../lib/constants.js';
import { Card, Page, Spinner, ErrorBox, Empty, Field, btn, input } from '../components/ui.jsx';

const Banner = () => <div className="rounded-lg border-2 border-dashed border-amber bg-amber/10 p-3 text-sm font-bold text-slate-800">SIMULATION. Nothing here is a real emergency. No real alerts are sent and no real records are created.</div>;

export default function Simulation() {
  const { user, toast } = useApp();
  const [sid, setSid] = useState(null);
  const sc = useAsync(() => api('/simulations'), []);
  const ss = useAsync(() => api('/simulations/sessions'), []);
  const [form, setForm] = useState({ title: '', incident_type: 'MEDICAL', description: '', instructions: '' });

  async function start(id) { try { const d = await api(`/simulations/${id}/start`, { method: 'POST' }); ss.reload(); setSid(d.session.id); } catch (e) { toast(e.message, 'error'); } }
  async function create(e) { e.preventDefault(); try { await api('/simulations', { method: 'POST', body: form }); setForm({ title: '', incident_type: 'MEDICAL', description: '', instructions: '' }); sc.reload(); toast('Scenario created', 'success'); } catch (x) { toast(x.message, 'error'); } }
  async function toggle(s) { await api(`/simulations/${s.id}`, { method: 'PATCH', body: { is_active: !s.is_active } }); sc.reload(); }

  if (sid) return <Run sid={sid} onExit={() => { setSid(null); ss.reload(); }} />;
  return (
    <Page title="Simulation centre" subtitle="Practise the full emergency workflow safely, then see your scorecard."><Banner />
      <div className="grid gap-4 md:grid-cols-2">
        {sc.loading ? <Spinner /> : sc.error ? <ErrorBox message={sc.error} onRetry={sc.reload} /> : sc.data.scenarios.map((s) => (
          <Card key={s.id} title={s.title}>
            <p className="text-sm text-slate-700">{s.description}</p><p className="mt-1 text-xs text-slate-500">{TYPE_LABEL[s.incident_type]} scenario{!s.is_active && ' · hidden from students'}</p>
            <div className="mt-3 flex gap-2"><button className={btn.primary} onClick={() => start(s.id)} disabled={!s.is_active}><Play className="h-4 w-4" /> Start</button>
              {user.role === 'ADMIN' && <button className={btn.ghost} onClick={() => toggle(s)}>{s.is_active ? 'Hide' : 'Show'}</button>}</div>
          </Card>))}
      </div>
      {user.role === 'ADMIN' && (
        <Card title="Create a scenario"><form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <Field label="Title" id="t"><input id="t" className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
          <Field label="Emergency category" id="c"><select id="c" className={input} value={form.incident_type} onChange={(e) => setForm({ ...form, incident_type: e.target.value })}>{['MEDICAL', 'FIRE', 'ACCIDENT', 'HARASSMENT'].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
          <Field label="Situation" id="d"><textarea id="d" rows={2} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Instructions for the student" id="i"><textarea id="i" rows={2} className={input} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
          <div><button className={btn.primary}>Create scenario</button></div></form></Card>
      )}
      <Card title={user.role === 'ADMIN' ? 'All simulation sessions' : 'My simulation results'}>
        {ss.loading ? <Spinner /> : !ss.data?.sessions.length ? <Empty title="No sessions yet" hint="Start a scenario above." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm"><thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">Scenario</th><th>Person</th><th>Started</th><th>Status</th><th>Score</th><th /></tr></thead>
            <tbody>{ss.data.sessions.map((s) => <tr key={s.id} className="border-b border-line last:border-0"><td className="py-2">{s.title}</td><td>{s.user_name}</td><td>{fmt(s.started_at)}</td><td>{s.status === 'COMPLETED' ? 'Completed' : 'In progress'}</td><td className="font-bold">{s.score ?? '-'}</td><td><button className="font-semibold underline" onClick={() => setSid(s.id)}>{s.status === 'COMPLETED' ? 'Scorecard' : 'Resume'}</button></td></tr>)}</tbody></table></div>)}
      </Card>
    </Page>
  );
}

function Run({ sid, onExit }) {
  const { toast } = useApp();
  const { data, loading, reload } = useAsync(() => api(`/simulations/sessions/${sid}`), [sid]);
  const meta = useAsync(() => api('/simulations'), []);
  if (loading || meta.loading) return <Spinner />;
  const { session, scorecard: sc } = data; const done = session.status === 'COMPLETED';
  const scenario = meta.data.scenarios.find((x) => x.id === session.scenario_id);
  const step = async (k) => { try { await api(`/simulations/sessions/${sid}/step`, { method: 'POST', body: { step: k } }); reload(); } catch (e) { toast(e.message, 'error'); } };
  const finish = async () => { try { await api(`/simulations/sessions/${sid}/complete`, { method: 'POST' }); reload(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <Page title={`SIMULATION: ${session.title}`} subtitle={scenario?.description}><Banner />
      {scenario?.instructions && !done && <Card title="Instructions"><p className="text-sm">{scenario.instructions}</p></Card>}
      <Card title="Workflow">
        <ol className="space-y-2">
          {sc.steps.map((s, idx) => (
            <li key={s.key} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <span className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-safe text-white' : 'bg-slate-100 text-slate-500'}`}>{s.done ? <Check className="h-4 w-4" /> : idx + 1}</span><span className="font-semibold">{s.label}</span></span>
              {s.done ? <span className="text-sm text-slate-600">{secs(s.seconds)} after start</span> : !done && idx > 0 && <button className={btn.ghost} onClick={() => step(s.key)}>Mark done</button>}
            </li>))}
        </ol>
        {!done && <button className={`${btn.primary} mt-4`} onClick={finish}><FlaskConical className="h-4 w-4" /> Complete simulation</button>}
      </Card>
      {done && (
        <Card title="Performance scorecard">
          <p className="text-4xl font-extrabold text-ink">{session.score}<span className="text-lg text-slate-500"> / 100</span></p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Item k="Time to acknowledge" v={secs(sc.timeToAcknowledge)} /><Item k="Time to assign" v={secs(sc.timeToAssign)} /><Item k="Time to respond" v={secs(sc.timeToResponse)} /><Item k="Time to resolve" v={secs(sc.timeToResolve)} />
            <Item k="Coordination efficiency" v={`${sc.efficiency}%`} /><Item k="Steps done out of order" v={sc.outOfOrder} /><Item k="Missed steps" v={sc.missed.length ? sc.missed.join(', ') : 'None'} />
          </dl>
        </Card>)}
      <button className={btn.ghost} onClick={onExit}>Back to simulation centre</button>
    </Page>
  );
}
const Item = ({ k, v }) => <div><dt className="text-xs text-slate-500">{k}</dt><dd className="font-bold text-slate-900">{v}</dd></div>;
