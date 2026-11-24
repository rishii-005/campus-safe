import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../context.jsx';
import { ROLE_LABEL, TYPE_LABEL, fmt } from '../lib/constants.js';
import { Card, Page, Spinner, ErrorBox, Modal, Field, btn, input } from '../components/ui.jsx';

const ROLES = Object.keys(ROLE_LABEL);

export function Users() {
  const { user, toast } = useApp();
  const u = useAsync(() => api('/admin/users'), []);
  const d = useAsync(() => api('/admin/departments'), []);
  const [modal, setModal] = useState(false); const [f, setF] = useState({ name: '', email: '', role: 'SECURITY', department_id: '', password: '', registration_no: '' });
  const [err, setErr] = useState('');
  const patch = async (id, body) => { try { await api(`/admin/users/${id}`, { method: 'PATCH', body }); u.reload(); } catch (e) { toast(e.message, 'error'); } };
  async function create(e) { e.preventDefault(); setErr(''); try { await api('/admin/users', { method: 'POST', body: f }); setModal(false); u.reload(); toast('Account created', 'success'); } catch (x) { setErr(x.message); } }
  async function reset(id) { if (!confirm('Create a temporary password for this user?')) return; try { const r = await api(`/admin/users/${id}/reset-password`, { method: 'POST' }); alert(`Temporary password (shown once):\n\n${r.temporaryPassword}`); } catch (e) { toast(e.message, 'error'); } }
  const depts = d.data?.departments || [];
  return (
    <Page title="User management" subtitle="Create accounts, assign roles and departments, and switch accounts on or off." action={<button className={btn.primary} onClick={() => setModal(true)}>Create account</button>}>
      <Card>{u.error && <ErrorBox message={u.error} onRetry={u.reload} />}{u.loading ? <Spinner /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Department</th><th>Active</th><th /></tr></thead>
          <tbody>{u.data.users.map((x) => (
            <tr key={x.id} className="border-b border-line last:border-0"><td className="py-2 font-semibold">{x.name}</td><td>{x.email}</td>
              <td><select aria-label={`Role of ${x.name}`} className="rounded border border-line px-2 py-1" value={x.role} disabled={x.id === user.id} onChange={(e) => patch(x.id, { role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
              <td><select aria-label={`Department of ${x.name}`} className="rounded border border-line px-2 py-1" value={x.department_id || ''} onChange={(e) => patch(x.id, { department_id: e.target.value ? Number(e.target.value) : null })}><option value="">None</option>{depts.map((dd) => <option key={dd.id} value={dd.id}>{dd.name}</option>)}</select></td>
              <td><input type="checkbox" aria-label={`${x.name} is active`} checked={x.is_active} disabled={x.id === user.id} onChange={(e) => patch(x.id, { is_active: e.target.checked })} /></td>
              <td><button className="font-semibold underline" onClick={() => reset(x.id)}>Reset password</button></td></tr>))}</tbody></table></div>)}
      </Card>
      {modal && <Modal title="Create account" onClose={() => setModal(false)}><form onSubmit={create} className="space-y-3">
        <Field label="Name" id="n"><input id="n" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Email" id="e"><input id="e" type="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Role" id="r"><select id="r" className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <Field label="Department" id="dp"><select id="dp" className={input} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">None</option>{depts.map((dd) => <option key={dd.id} value={dd.id}>{dd.name}</option>)}</select></Field></div>
        <Field label="Temporary password" id="p" hint="At least 8 characters. Ask the person to change it after logging in."><input id="p" className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={8} required /></Field>
        {err && <ErrorBox message={err} />}<button className={btn.primary}>Create account</button></form></Modal>}
    </Page>
  );
}

export function Config() {
  const [tab, setTab] = useState('contacts');
  const tabs = [['contacts', 'Emergency contacts'], ['departments', 'Departments'], ['routing', 'Routing rules'], ['escalation', 'Escalation']];
  return (
    <Page title="Configuration" subtitle="These settings control how alerts are routed and what students see.">
      <div className="flex flex-wrap gap-2" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}>{l}</button>)}</div>
      {tab === 'contacts' && <Contacts />}{tab === 'departments' && <Departments />}{tab === 'routing' && <Routing />}{tab === 'escalation' && <Escalation />}
    </Page>
  );
}

function Contacts() {
  const { toast } = useApp(); const c = useAsync(() => api('/admin/contacts'), []); const [vals, setVals] = useState({}); const [nw, setNw] = useState({ label: '', phone: '' });
  const save = async (x) => { try { await api(`/admin/contacts/${x.id}`, { method: 'PATCH', body: { phone: vals[x.id] ?? x.phone } }); toast('Saved', 'success'); c.reload(); } catch (e) { toast(e.message, 'error'); } };
  const add = async (e) => { e.preventDefault(); try { await api('/admin/contacts', { method: 'POST', body: nw }); setNw({ label: '', phone: '' }); c.reload(); } catch (x) { toast(x.message, 'error'); } };
  const del = async (id) => { if (confirm('Remove this contact?')) { await api(`/admin/contacts/${id}`, { method: 'DELETE' }); c.reload(); } };
  return <Card title="Numbers shown on the public SOS page">{c.loading ? <Spinner /> : (<div className="space-y-3">
    {c.data.contacts.map((x) => <div key={x.id} className="flex flex-wrap items-center gap-2"><span className="w-56 text-sm font-semibold">{x.label}</span><input aria-label={`${x.label} phone`} className={`${input} max-w-xs`} inputMode="tel" placeholder="Phone number" value={vals[x.id] ?? x.phone ?? ''} onChange={(e) => setVals({ ...vals, [x.id]: e.target.value })} /><button className={btn.primary} onClick={() => save(x)}>Save</button><button className={btn.ghost} onClick={() => del(x.id)}>Remove</button></div>)}
    <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><input aria-label="New contact label" className={`${input} max-w-[14rem]`} placeholder="New contact name" value={nw.label} onChange={(e) => setNw({ ...nw, label: e.target.value })} required /><input aria-label="New contact phone" className={`${input} max-w-xs`} placeholder="Phone" value={nw.phone} onChange={(e) => setNw({ ...nw, phone: e.target.value })} /><button className={btn.ghost}>Add contact</button></form></div>)}</Card>;
}

function Departments() {
  const { toast } = useApp(); const d = useAsync(() => api('/admin/departments'), []); const [nw, setNw] = useState({ name: '', code: '', phone: '' }); const [vals, setVals] = useState({});
  const add = async (e) => { e.preventDefault(); try { await api('/admin/departments', { method: 'POST', body: nw }); setNw({ name: '', code: '', phone: '' }); d.reload(); } catch (x) { toast(x.message, 'error'); } };
  const patch = async (id, body) => { try { await api(`/admin/departments/${id}`, { method: 'PATCH', body }); toast('Saved', 'success'); d.reload(); } catch (x) { toast(x.message, 'error'); } };
  return <Card title="Departments">{d.loading ? <Spinner /> : (<>
    <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">Name</th><th>Code</th><th>Staff</th><th>Phone</th><th>Active</th></tr></thead><tbody>{d.data.departments.map((x) => (
      <tr key={x.id} className="border-b border-line last:border-0"><td className="py-2 font-semibold">{x.name}</td><td className="font-mono text-xs">{x.code}</td><td>{x.staff_count}</td>
        <td><input aria-label={`${x.name} phone`} className="w-36 rounded border border-line px-2 py-1" value={vals[x.id] ?? x.phone ?? ''} onChange={(e) => setVals({ ...vals, [x.id]: e.target.value })} onBlur={() => vals[x.id] !== undefined && vals[x.id] !== (x.phone || '') && patch(x.id, { phone: vals[x.id] })} /></td>
        <td><input type="checkbox" aria-label={`${x.name} active`} checked={x.is_active} onChange={(e) => patch(x.id, { is_active: e.target.checked })} /></td></tr>))}</tbody></table></div>
    <form onSubmit={add} className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3"><input aria-label="Department name" className={`${input} max-w-[14rem]`} placeholder="Department name" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} required /><input aria-label="Department code" className={`${input} max-w-[8rem]`} placeholder="CODE" value={nw.code} onChange={(e) => setNw({ ...nw, code: e.target.value })} required /><button className={btn.primary}>Add department</button></form></>)}</Card>;
}

function Routing() {
  const { toast } = useApp(); const r = useAsync(() => api('/admin/routing'), []); const d = useAsync(() => api('/admin/departments'), []);
  const save = async (rule, ch) => { try { await api(`/admin/routing/${rule.id}`, { method: 'PATCH', body: { ...rule, ...ch } }); toast('Rule saved', 'success'); r.reload(); } catch (e) { toast(e.message, 'error'); } };
  if (r.loading || d.loading) return <Spinner />;
  const opts = d.data.departments;
  return <Card title="Which department handles each category"><div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-sm"><thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">Category</th><th>Primary</th><th>Supporting</th><th>Priority</th><th>Confidential</th><th>On</th></tr></thead><tbody>{r.data.rules.map((x) => (
    <tr key={x.id} className="border-b border-line last:border-0"><td className="py-2 font-semibold">{TYPE_LABEL[x.incident_type] || x.label}<span className="block text-xs font-normal text-slate-500">{x.kind.toLowerCase()}</span></td>
      <td><select aria-label={`Primary for ${x.label}`} className="rounded border border-line px-2 py-1" value={x.primary_department_id} onChange={(e) => save(x, { primary_department_id: Number(e.target.value) })}>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
      <td><select aria-label={`Supporting for ${x.label}`} className="rounded border border-line px-2 py-1" value={x.supporting_department_id || ''} onChange={(e) => save(x, { supporting_department_id: e.target.value ? Number(e.target.value) : null })}><option value="">None</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
      <td><select aria-label={`Priority for ${x.label}`} className="rounded border border-line px-2 py-1" value={x.default_priority} onChange={(e) => save(x, { default_priority: e.target.value })}>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}</select></td>
      <td><input type="checkbox" aria-label="Confidential" checked={x.is_confidential} onChange={(e) => save(x, { is_confidential: e.target.checked })} /></td>
      <td><input type="checkbox" aria-label="Rule active" checked={x.is_active} onChange={(e) => save(x, { is_active: e.target.checked })} /></td></tr>))}</tbody></table></div>
    <p className="mt-3 text-xs text-slate-500">Changes apply to new reports. Existing reports keep the department they were routed to.</p></Card>;
}

function Escalation() {
  const { toast } = useApp(); const e = useAsync(() => api('/admin/escalation'), []); const [vals, setVals] = useState({});
  const save = async (x) => { try { await api(`/admin/escalation/${x.id}`, { method: 'PATCH', body: { ack_minutes: Number(vals[x.id] ?? x.ack_minutes) } }); toast('Saved', 'success'); e.reload(); } catch (er) { toast(er.message, 'error'); } };
  return <Card title="Minutes allowed before an unacknowledged report is marked delayed and escalated">{e.loading ? <Spinner /> : <div className="space-y-2">{e.data.rules.map((x) => <div key={x.id} className="flex items-center gap-3"><span className="w-24 text-sm font-semibold">{x.priority}</span><input aria-label={`${x.priority} minutes`} type="number" min="1" className="w-28 rounded-lg border border-line px-3 py-2 text-sm" value={vals[x.id] ?? x.ack_minutes} onChange={(ev) => setVals({ ...vals, [x.id]: ev.target.value })} /><span className="text-sm text-slate-600">minutes</span><button className={btn.primary} onClick={() => save(x)}>Save</button></div>)}<p className="pt-2 text-xs text-slate-500">The server checks every 30 seconds.</p></div>}</Card>;
}

export function Audit() {
  const a = useAsync(() => api('/admin/audit'), []);
  return <Page title="Audit log" subtitle="The latest 300 recorded actions.">
    <Card>{a.error && <ErrorBox message={a.error} onRetry={a.reload} />}{a.loading ? <Spinner /> : (
      <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead className="border-b border-line text-xs text-slate-500"><tr><th className="py-2">When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>{a.data.logs.map((l) => (
        <tr key={l.id} className="border-b border-line last:border-0"><td className="whitespace-nowrap py-2">{fmt(l.created_at)}</td><td>{l.actor || '-'}</td><td className="font-mono text-xs font-bold">{l.action}</td><td>{l.entity ? `${l.entity} #${l.entity_id}` : ''}</td><td className="max-w-xs truncate text-xs text-slate-500">{l.details ? JSON.stringify(l.details) : ''}</td></tr>))}</tbody></table></div>)}</Card></Page>;
}
