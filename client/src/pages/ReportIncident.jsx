import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { api } from '../lib/api.js';
import { COMPLAINT_TYPES, TYPE_LABEL } from '../lib/constants.js';
import { Card, Field, Page, ErrorBox, btn, input } from '../components/ui.jsx';

const MAX = 5 * 1024 * 1024;
const OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export default function ReportIncident() {
  const [f, setF] = useState({ type: 'GENERAL', title: '', description: '', location: '', incidentTime: '', confidential: false });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pick(e) {
    const list = [...e.target.files];
    if (list.length > 5) return setErr('You can attach up to 5 files');
    const bad = list.find((x) => !OK.includes(x.type) || x.size > MAX);
    if (bad) { e.target.value = ''; return setErr(`"${bad.name}" cannot be attached. Use JPG, PNG, WebP, PDF or Word files up to 5 MB each.`); }
    setErr(''); setFiles(list);
  }
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => v !== '' && fd.append(k, v));
    files.forEach((x) => fd.append('files', x));
    try { setDone(await api('/incidents', { method: 'POST', body: fd })); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (done) return (
    <Page title="Complaint submitted">
      <Card><div className="flex flex-col items-center gap-3 p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-safe" /><p>Your complaint ID is</p><p className="font-mono text-3xl font-extrabold text-ink">{done.reference}</p>
        <p className="max-w-md text-sm text-slate-600">You will get a notification every time its status changes.</p>
        <div className="flex gap-2"><Link className={btn.primary} to={`/portal/incidents/${done.id}`}>Track this complaint</Link><button className={btn.ghost} onClick={() => nav('/portal/incidents')}>My complaints</button></div>
      </div></Card>
    </Page>
  );

  return (
    <Page title="Report a non-emergency incident" subtitle="If someone is in danger right now, use the SOS page instead.">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Category" id="type"><select id="type" className={input} value={f.type} onChange={set('type')}>{COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
            <Field label="Title" id="title"><input id="title" className={input} value={f.title} onChange={set('title')} maxLength={150} required /></Field>
          </div>
          <Field label="What happened?" id="desc" hint="Include who, what and anything that helps us act."><textarea id="desc" rows={5} className={input} value={f.description} onChange={set('description')} maxLength={5000} required /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Building, hostel or area" id="loc"><input id="loc" className={input} value={f.location} onChange={set('location')} maxLength={200} required /></Field>
            <Field label="When did it happen? (approximate)" id="when"><input id="when" type="datetime-local" className={input} value={f.incidentTime} onChange={set('incidentTime')} /></Field>
          </div>
          <Field label="Evidence or documents (optional)" id="files" hint="Up to 5 files. JPG, PNG, WebP, PDF or Word, 5 MB each.">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-400 p-3 text-sm"><Paperclip className="h-4 w-4" />{files.length ? files.map((x) => x.name).join(', ') : 'Choose files'}
              <input id="files" type="file" multiple className="sr-only" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" onChange={pick} /></label>
          </Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} />
            <span><b>Keep this confidential.</b> Only the staff who must handle it can see it. Harassment and ragging reports are always confidential.</span></label>
          {err && <ErrorBox message={err} />}
          <button disabled={busy} className={btn.primary}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
        </form>
      </Card>
    </Page>
  );
}
