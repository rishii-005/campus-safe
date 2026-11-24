import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Flame, CarFront, ShieldAlert, Phone, ShieldCheck, Loader2, CheckCircle2, MapPin, Clock, Radio } from 'lucide-react';
import { api } from '../lib/api.js';
import { fmt } from '../lib/constants.js';

const SOS = [
  { type: 'MEDICAL', label: 'Medical emergency', hint: 'Collapse, breathing trouble, severe injury', Icon: HeartPulse, bg: 'bg-[#d7263d] hover:bg-[#b81c31]' },
  { type: 'FIRE', label: 'Fire emergency', hint: 'Fire, smoke, electrical hazard', Icon: Flame, bg: 'bg-[#c2410c] hover:bg-[#a43609]' },
  { type: 'ACCIDENT', label: 'Accident', hint: 'Road accident, fall, injury', Icon: CarFront, bg: 'bg-[#1d4ed8] hover:bg-[#1a41b4]' },
  { type: 'HARASSMENT', label: 'Harassment / women safety', hint: 'Threat, harassment, unsafe situation', Icon: ShieldAlert, bg: 'bg-[#6d28d9] hover:bg-[#5b21b6]' },
];
const NAME = Object.fromEntries(SOS.map((s) => [s.type, s.label]));

// Anonymous reference for this browser. It is not a login and holds no personal data.
function sessionId() {
  let id = localStorage.getItem('cs_session');
  if (!id) { id = crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2); localStorage.setItem('cs_session', id); }
  return id;
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 'UNAVAILABLE' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject({ code: e.code === 1 ? 'DENIED' : e.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE' }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
}

const patchLocation = (ref, body) => api(`/public/emergency/${ref}/location`, { method: 'PATCH', auth: false, body: { sessionId: sessionId(), ...body } }).catch(() => {});

export default function Home() {
  const [busy, setBusy] = useState(null);
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);

  useEffect(() => { api('/public/contacts', { auth: false }).then((d) => setContacts(d.contacts)).catch(() => {}); }, []);

  async function trigger(type) {
    if (busy) return;
    setBusy(type); setError('');
    // Location capture starts inside the click, so the browser can show its permission prompt right away.
    const geo = getLocation();
    geo.catch(() => {});
    // Never hold the alert back for GPS: wait at most 2.5 s, then send and attach location when it arrives.
    const first = await Promise.race([
      geo.then((loc) => ({ loc })).catch((e) => ({ fail: e.code })),
      new Promise((r) => setTimeout(() => r({ late: true }), 2500)),
    ]);
    try {
      const res = await api('/public/emergency', { method: 'POST', auth: false, body: { type, sessionId: sessionId(), ...(first.loc || {}), locationStatus: first.fail || (first.late ? 'PENDING' : undefined) } });
      setAlert({ ...res, type, sentAt: Date.now(), loc: first.loc || null });
      if (first.late && !res.duplicate) geo.then((l) => patchLocation(res.reference, l)).catch((e) => patchLocation(res.reference, { locationStatus: e.code }));
    } catch (e) {
      setError(e.message);
    } finally { setBusy(null); }
  }

  if (alert) return <Confirmation alert={alert} contacts={contacts} onDone={() => setAlert(null)} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal"><ShieldCheck className="h-6 w-6" /></div>
          <div className="leading-tight"><p className="text-lg font-extrabold">Campus Safe</p><p className="text-xs text-blue-100 sm:text-sm">Campus Emergency Assistance</p></div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-sm text-blue-100 sm:flex"><span className="pulse-dot h-2.5 w-2.5 rounded-full bg-green-400" /> Alerts are monitored</span>
          <Link to="/login" className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-blue-50">Campus portal</Link>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-3 pb-2 sm:gap-3 sm:px-6">
        {SOS.map(({ type, label, hint, Icon, bg }) => (
          <button key={type} onClick={() => trigger(type)} disabled={!!busy} aria-label={`Send ${label} alert`}
            className={`${bg} flex min-h-0 flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center transition-colors disabled:opacity-70 sm:gap-2`}>
            {busy === type ? <Loader2 className="h-10 w-10 animate-spin sm:h-16 sm:w-16" /> : <Icon className="h-10 w-10 sm:h-16 sm:w-16" strokeWidth={1.75} />}
            <span className="text-base font-extrabold leading-tight sm:text-3xl">{busy === type ? 'Sending alert…' : label}</span>
            <span className="hidden text-sm text-white/85 [@media(min-height:640px)]:block sm:text-base">{hint}</span>
          </button>
        ))}
      </main>

      {error && (
        <div role="alert" className="mx-3 mb-2 rounded-lg bg-white p-3 text-sm font-semibold text-red-800 sm:mx-6">
          {error} <span className="font-normal">Please call campus security using the numbers below.</span>
        </div>
      )}

      <section className="grid grid-cols-2 gap-1.5 px-3 pb-2 sm:grid-cols-4 sm:gap-3 sm:px-6" aria-label="Emergency contacts">
        {contacts.map((c) => c.phone ? (
          <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 hover:bg-white/20">
            <Phone className="h-4 w-4 shrink-0" /><span className="min-w-0 leading-tight"><span className="block truncate text-xs text-blue-100">{c.label}</span><span className="block text-sm font-bold">{c.phone}</span></span>
          </a>
        ) : (
          <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-blue-200"><Phone className="h-4 w-4 shrink-0" /><span className="min-w-0 leading-tight"><span className="block truncate text-xs">{c.label}</span><span className="block text-xs">Number not set yet</span></span></div>
        ))}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 bg-ink-2 px-4 py-2.5 sm:px-6">
        <p className="text-xs text-blue-100 sm:text-sm"><span className="font-bold text-white">Report a non-emergency incident.</span> <span className="hidden sm:inline">For complaints, safety concerns and maintenance issues, log in to the Campus Portal.</span></p>
        <Link to="/login" className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-ink hover:bg-blue-50">Go to Campus Portal</Link>
      </footer>
    </div>
  );
}

function Confirmation({ alert, contacts, onDone }) {
  const sid = sessionId();
  const [info, setInfo] = useState(null);
  const [left, setLeft] = useState(Math.max(0, 5 - Math.floor((Date.now() - alert.sentAt) / 1000)));
  const [cancelState, setCancelState] = useState('');
  const [manual, setManual] = useState('');
  const [contact, setContact] = useState('');
  const [saved, setSaved] = useState(false);
  const [locStatus, setLocStatus] = useState(alert.locationStatus);
  const done = info && ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(info.status);
  const doneRef = useRef(false); doneRef.current = done || cancelState === 'cancelled';

  // Cancellation countdown (the alert has ALREADY been sent; cancelling just withdraws it).
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((l) => l - 1), 1000); return () => clearTimeout(t); }, [left]);

  // Poll status so the sender sees acknowledgement without refreshing.
  useEffect(() => {
    let stop = false;
    const tick = () => api(`/public/emergency/${alert.reference}/status?sessionId=${sid}`, { auth: false }).then((d) => { if (!stop) { setInfo(d); setLocStatus(d.locationStatus); } }).catch(() => {});
    tick(); const i = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(i); };
  }, [alert.reference, sid]);

  // While this page stays open, send fresh GPS at most every 20 s. Nothing runs after the page closes.
  useEffect(() => {
    if (!navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition((p) => {
      if (doneRef.current || Date.now() - last < 20000) return;
      last = Date.now();
      patchLocation(alert.reference, { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [alert.reference]);

  async function cancel() {
    try { await api(`/public/emergency/${alert.reference}/cancel`, { method: 'POST', auth: false, body: { sessionId: sid } }); setCancelState('cancelled'); }
    catch (e) { setCancelState(e.message); }
  }
  async function saveExtra(e) {
    e.preventDefault();
    await patchLocation(alert.reference, { manualLocation: manual, contactInfo: contact });
    setSaved(true); if (manual && locStatus !== 'CAPTURED') setLocStatus('MANUAL');
  }

  const locText = locStatus === 'CAPTURED' ? 'GPS location captured and shared' : locStatus === 'MANUAL' ? 'Shared as text you entered (no GPS)' : locStatus === 'PENDING' ? 'Getting your GPS location…' : 'GPS location not available';
  const cancelled = cancelState === 'cancelled' || info?.status === 'CANCELLED';
  const status = info?.status || alert.status;

  return (
    <div className="min-h-dvh bg-paper p-4 sm:p-6">
      <div className="mx-auto max-w-xl space-y-3">
        <div className={`rounded-2xl p-5 text-white ${cancelled ? 'bg-slate-600' : 'bg-ink'}`}>
          <div className="flex items-center gap-2 text-lg font-extrabold"><CheckCircle2 className="h-6 w-6 text-green-400" /> {cancelled ? 'Alert cancelled' : 'Alert sent'}</div>
          <p className="mt-1 text-blue-100">{cancelled ? 'The team has been told this was an accidental trigger.' : `The ${info?.department || 'campus'} team has been notified of your ${NAME[alert.type].toLowerCase()}.`}</p>
          <p className="mt-3 text-xs text-blue-200">Your reference</p>
          <p className="font-mono text-2xl font-bold tracking-wide">{alert.reference}</p>
        </div>

        {!cancelled && !done && left > 0 && (
          <button onClick={cancel} className="w-full rounded-xl border-2 border-slate-400 bg-white py-3 font-bold text-slate-800 hover:bg-slate-50">Sent by mistake? Cancel alert ({left}s)</button>
        )}
        {cancelState && cancelState !== 'cancelled' && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{cancelState}</p>}

        <div className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
          <Row icon={Radio} k="Alert category" v={NAME[alert.type]} />
          <Row icon={Clock} k="Created" v={fmt(alert.createdAt)} />
          <Row icon={MapPin} k="Location" v={locText} />
          <Row icon={ShieldCheck} k="Delivery" v={alert.deliveryStatus === 'DELIVERED_TO_DEPARTMENT' || alert.deliveryStatus === 'ALREADY_SENT' ? 'Delivered to the responsible team' : 'Recorded. No team member is online right now, so call the numbers below.'} />
          <Row icon={CheckCircle2} k="Status" v={cancelled ? 'Cancelled' : info?.acknowledgedAt ? `Acknowledged at ${fmt(info.acknowledgedAt)}` : status === 'CREATED' ? 'Waiting for the team to acknowledge' : status.replace('_', ' ').toLowerCase()} />
        </div>

        {!cancelled && !done && (
          <form onSubmit={saveExtra} className="space-y-2 rounded-2xl border border-line bg-white p-4">
            <p className="font-bold text-ink">{locStatus === 'CAPTURED' ? 'Add details (optional)' : 'Tell us where you are'}</p>
            <label className="block text-sm"><span className="sr-only">Building, hostel, floor or area</span>
              <input value={manual} onChange={(e) => setManual(e.target.value)} maxLength={200} placeholder="Building, hostel, floor or area" className="w-full rounded-lg border border-line px-3 py-2.5" /></label>
            <label className="block text-sm"><span className="sr-only">Phone number to reach you</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={40} inputMode="tel" placeholder="Phone number to reach you (optional)" className="w-full rounded-lg border border-line px-3 py-2.5" /></label>
            <button disabled={!manual && !contact} className="w-full rounded-lg bg-ink py-2.5 font-semibold text-white disabled:opacity-50">{saved ? 'Sent. Update again' : 'Send to the team'}</button>
          </form>
        )}

        {info?.updates?.length > 1 && (
          <ol className="space-y-1 rounded-2xl border border-line bg-white p-4 text-sm">
            {info.updates.map((u, i) => <li key={i}><span className="font-semibold">{fmt(u.created_at)}</span> · {u.comment}</li>)}
          </ol>
        )}

        <p className="rounded-xl bg-amber/10 p-3 text-sm text-slate-800">This alert reached campus teams. It does not mean outside emergency services have been called. If life is in danger, call:</p>
        <div className="grid grid-cols-2 gap-2">
          {contacts.filter((c) => c.phone).map((c) => <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 rounded-lg bg-ink p-3 text-sm font-bold text-white"><Phone className="h-4 w-4" /><span>{c.label}<br /><span className="font-normal">{c.phone}</span></span></a>)}
        </div>
        <button onClick={onDone} className="w-full rounded-xl bg-white py-3 font-bold text-ink ring-1 ring-line hover:bg-slate-50">Back to home</button>
      </div>
    </div>
  );
}

const Row = ({ icon: Icon, k, v }) => (
  <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div><p className="text-xs text-slate-500">{k}</p><p className="font-semibold text-slate-900">{v}</p></div></div>
);
