import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Lock, MapPin, Send, AlertTriangle, Copy } from 'lucide-react';
import { api, download } from '../lib/api.js';
import { useApp, useAsync, useSocketEvent } from '../context.jsx';
import { COMPLAINT_FLOW, EMERGENCY_FLOW, STATUS_LABEL, TYPE_LABEL, ROLE_LABEL, fmt, isStaff, DONE } from '../lib/constants.js';
import { Card, Field, StatusBadge, PriorityBadge, Spinner, ErrorBox, btn, input } from '../components/ui.jsx';
import { ProgressTracker, Timeline } from '../components/Tracker.jsx';

export default function IncidentDetail() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const staff = isStaff(user);
  const { data, loading, error, reload } = useAsync(() => api(`/incidents/${id}`), [id]);
  useSocketEvent('incident:changed', (e) => { if (String(e.id) === String(id)) reload(); });

  // Wrap every action: show errors as toasts, refresh on success.
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok, 'success'); reload(); } catch (e) { toast(e.message, 'error'); } };

  if (loading) return <Spinner />;
  if (error) return <div className="p-6"><ErrorBox message={error} onRetry={reload} /><Link className={`${btn.ghost} mt-3`} to="/portal/incidents">Back to list</Link></div>;
  const { incident: i, updates, assignments, evidence, pendingAssignmentId, statuses } = data;
  const emergency = i.incident_source === 'PUBLIC_SOS';
  const done = DONE.includes(i.status);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <Link to="/portal/incidents" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-extrabold text-ink">{i.incident_reference}</h1>
        <StatusBadge status={i.status} /><PriorityBadge priority={i.priority} />
        {i.is_confidential && <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-white"><Lock className="h-3 w-3" /> Confidential</span>}
        {i.is_delayed && <span className="inline-flex items-center gap-1 text-sm font-bold text-signal"><AlertTriangle className="h-4 w-4" /> Not acknowledged in time</span>}
      </div>
      <Card><ProgressTracker flow={emergency ? EMERGENCY_FLOW : COMPLAINT_FLOW} current={i.status} /></Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card title={i.title || TYPE_LABEL[i.incident_type]}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info k="Category" v={`${TYPE_LABEL[i.incident_type] || i.incident_type} (${emergency ? 'SOS alert' : 'complaint'})`} />
              <Info k="Created" v={fmt(i.created_at)} />
              <Info k="Handling department" v={i.department_name || '-'} />
              <Info k="Supporting department" v={i.supporting_department_name || 'None'} />
              <Info k="Assigned officer" v={i.responder_name || 'Not assigned yet'} />
              {staff && i.student_name && <Info k="Student" v={`${i.student_name}${i.student_reg ? ` (${i.student_reg})` : ''}`} />}
              {!emergency && i.incident_time && <Info k="Happened around" v={fmt(i.incident_time)} />}
              {i.acknowledged_at && <Info k="Acknowledged" v={fmt(i.acknowledged_at)} />}
              {i.resolved_at && <Info k="Resolved" v={fmt(i.resolved_at)} />}
            </dl>
            {i.description && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{i.description}</p>}
            {(emergency || i.manual_location) && (
              <div className="mt-4 rounded-lg border border-line p-3 text-sm">
                <p className="mb-1 flex items-center gap-1 font-bold text-ink"><MapPin className="h-4 w-4" /> Location (text only)</p>
                {i.latitude != null ? (
                  <p className="flex flex-wrap items-center gap-2">GPS {Number(i.latitude).toFixed(5)}, {Number(i.longitude).toFixed(5)}{i.location_accuracy ? ` (accuracy ±${Math.round(i.location_accuracy)} m)` : ''}
                    <button className="inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs" onClick={() => { navigator.clipboard?.writeText(`${i.latitude}, ${i.longitude}`); toast('Coordinates copied'); }}><Copy className="h-3 w-3" />Copy</button></p>
                ) : emergency && <p className="font-semibold text-signal">GPS not available. {i.location_status === 'DENIED' ? 'The sender denied location permission.' : 'Location is incomplete.'}</p>}
                {i.manual_location && <p>Given as: <b>{i.manual_location}</b></p>}
                {staff && i.contact_info && <p>Contact the sender on: <b>{i.contact_info}</b></p>}
              </div>
            )}
            {evidence.length > 0 && (
              <div className="mt-4"><p className="mb-1 text-sm font-bold text-ink">Evidence</p>
                <ul className="space-y-1">{evidence.map((e) => <li key={e.id}><button className="inline-flex items-center gap-2 text-sm text-blue-700 underline" onClick={() => act(() => download(`/incidents/${i.id}/evidence/${e.id}`, e.original_name))}><Download className="h-4 w-4" />{e.original_name} <span className="text-slate-400">({Math.round(e.size_bytes / 1024)} KB)</span></button></li>)}</ul></div>
            )}
          </Card>
          <Card title="Status history"><Timeline updates={updates} /></Card>
          {staff && assignments.length > 0 && <Card title="Assignments"><ul className="space-y-1 text-sm">{assignments.map((a) => <li key={a.id}>{a.responder_name} · <b>{a.status.toLowerCase()}</b> · {fmt(a.created_at)}</li>)}</ul></Card>}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {staff ? <StaffActions i={i} statuses={statuses} done={done} pendingAssignmentId={pendingAssignmentId} act={act} /> : <StudentActions i={i} act={act} />}
          {!(emergency && !staff) && <Messages incident={i} staff={staff} emergency={emergency} />}
        </div>
      </div>
    </div>
  );
}

const Info = ({ k, v }) => <div><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>;

function StudentActions({ i, act }) {
  const [reason, setReason] = useState('');
  const canCancel = i.status === 'SUBMITTED';
  const canReopen = ['RESOLVED', 'CLOSED'].includes(i.status);
  if (!canCancel && !canReopen) return null;
  const change = (status, comment) => act(() => api(`/incidents/${i.id}/status`, { method: 'PATCH', body: { status, comment } }), 'Updated');
  return (
    <Card title="Your options">
      {canCancel && <button className={btn.ghost} onClick={() => confirm('Cancel this complaint?') && change('CANCELLED')}>Cancel complaint</button>}
      {canReopen && (
        <form onSubmit={(e) => { e.preventDefault(); change('REOPENED', reason); }} className="space-y-2">
          <p className="text-sm text-slate-600">Not satisfied with the outcome? Ask the department to look again.</p>
          <textarea className={input} rows={3} required placeholder="What still needs action?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className={btn.primary}>Reopen complaint</button>
        </form>
      )}
    </Card>
  );
}

function StaffActions({ i, statuses, done, pendingAssignmentId, act }) {
  const { user } = useApp();
  const [status, setStatus] = useState(''); const [comment, setComment] = useState(''); const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState(''); const [resp, setResp] = useState(''); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const { data: rs } = useAsync(() => api(`/responders?forIncident=${i.id}`), [i.id]);
  const emergency = i.incident_source === 'PUBLIC_SOS';
  const post = (path, body, ok) => act(() => api(`/incidents/${i.id}/${path}`, { method: 'POST', body }), ok);

  return (
    <Card title="Actions">
      <div className="space-y-5">
        {pendingAssignmentId && (
          <div className="rounded-lg border-2 border-ink p-3"><p className="mb-2 text-sm font-bold">You have been assigned to this report.</p>
            <div className="flex gap-2"><button className={btn.primary} onClick={() => post('assignment/respond', { accept: true }, 'Accepted. Status set to in progress')}>Accept</button>
              <button className={btn.ghost} onClick={() => post('assignment/respond', { accept: false, comment: prompt('Why can you not take this?') || '' }, 'Declined')}>Decline</button></div></div>
        )}
        {['CREATED', 'SUBMITTED'].includes(i.status) && <button className={`${btn.danger} w-full`} onClick={() => post('acknowledge', {}, 'Acknowledged')}>Acknowledge {emergency ? 'alert' : 'complaint'}</button>}
        {!done && (
          <form onSubmit={(e) => { e.preventDefault(); post('assign', { responderId: Number(resp) }, 'Responder assigned'); }} className="space-y-2">
            <Field label="Assign a responder" id="resp"><select id="resp" className={input} value={resp} onChange={(e) => setResp(e.target.value)} required>
              <option value="">Choose…</option>
              {rs?.responders.map((r) => <option key={r.id} value={r.id} disabled={r.availability === 'OFFLINE'}>{r.name} · {r.department_name} · {r.availability.toLowerCase()} · {r.active_count}/{r.max_workload} active</option>)}
            </select></Field>
            <button className={btn.primary} disabled={!resp}>Assign</button>
          </form>
        )}
        <form onSubmit={(e) => { e.preventDefault(); act(() => api(`/incidents/${i.id}/status`, { method: 'PATCH', body: { status, comment, internal } }), 'Status updated').then(() => { setComment(''); setStatus(''); }); }} className="space-y-2">
          <Field label="Update status" id="st"><select id="st" className={input} value={status} onChange={(e) => setStatus(e.target.value)} required>
            <option value="">Choose new status…</option>{statuses.filter((s) => s !== i.status).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
          <textarea className={input} rows={2} placeholder={status === 'REJECTED' ? 'Reason (required)' : emergency ? 'Update (optional)' : 'Message the student will see (optional)'} value={comment} onChange={(e) => setComment(e.target.value)} required={status === 'REJECTED'} />
          {!emergency && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal only (hide from student)</label>}
          <button className={btn.primary} disabled={!status}>Update status</button>
        </form>
        {!done && (
          <form onSubmit={(e) => { e.preventDefault(); post('resolve', { resolution }, 'Marked resolved').then(() => setResolution('')); }} className="space-y-2">
            <Field label="Resolve" id="res"><textarea id="res" className={input} rows={2} placeholder="What was done? (shown to the student)" value={resolution} onChange={(e) => setResolution(e.target.value)} required /></Field>
            <button className="inline-flex items-center justify-center rounded-lg bg-safe px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Mark resolved</button>
          </form>
        )}
        <form onSubmit={(e) => { e.preventDefault(); post('notes', { body: note }, 'Note saved').then(() => setNote('')); }} className="space-y-2">
          <Field label="Internal note" id="note" hint="Never shown to students."><textarea id="note" className={input} rows={2} value={note} onChange={(e) => setNote(e.target.value)} required /></Field>
          <button className={btn.ghost}>Add note</button>
        </form>
        {!done && (
          <form onSubmit={(e) => { e.preventDefault(); post('escalate', { reason }, 'Escalated to administrators').then(() => setReason('')); }} className="space-y-2 border-t border-line pt-4">
            <Field label="Escalate to administrators" id="esc"><input id="esc" className={input} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
            <button className={btn.ghost}>Escalate</button>
          </form>
        )}
      </div>
    </Card>
  );
}

function Messages({ incident, staff, emergency }) {
  const { user, toast } = useApp();
  const [msgs, setMsgs] = useState([]); const [body, setBody] = useState(''); const [internal, setInternal] = useState(true);
  const end = useRef(null);
  const load = () => api(`/incidents/${incident.id}/messages`).then((d) => setMsgs(d.messages)).catch(() => {});
  useEffect(() => { load(); }, [incident.id]);
  useSocketEvent('message:new', (e) => { if (e.incidentId === incident.id) load(); });
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);
  async function send(e) {
    e.preventDefault();
    try { await api(`/incidents/${incident.id}/messages`, { method: 'POST', body: { body, internal: staff ? internal : false } }); setBody(''); load(); } catch (x) { toast(x.message, 'error'); }
  }
  return (
    <Card title={staff ? 'Team and student messages' : 'Messages with the department'}>
      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
        {!msgs.length && <p className="text-sm text-slate-500">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`rounded-lg p-2.5 text-sm ${m.sender_id === user.id ? 'bg-blue-50' : 'bg-slate-50'} ${m.is_internal ? 'border-l-4 border-amber' : ''}`}>
            <p className="text-xs text-slate-500"><b className="text-slate-800">{m.sender_name}</b> · {ROLE_LABEL[m.sender_role]} · {fmt(m.created_at)}{m.is_internal && ' · internal'}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}<div ref={end} />
      </div>
      <form onSubmit={send} className="space-y-2">
        <textarea className={input} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" maxLength={2000} required aria-label="Message" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {staff && !emergency ? <select className="rounded-lg border border-line px-2 py-2 text-sm" value={internal ? 'i' : 's'} onChange={(e) => setInternal(e.target.value === 'i')} aria-label="Who can see this"><option value="i">Internal team only</option><option value="s">Visible to student</option></select> : <span className="text-xs text-slate-500">{staff ? 'Internal team only' : ''}</span>}
          <button className={btn.primary}><Send className="h-4 w-4" /> Send</button>
        </div>
      </form>
    </Card>
  );
}
