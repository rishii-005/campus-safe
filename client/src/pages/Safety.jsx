import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Flame, CarFront, ShieldAlert, Users, ClipboardCheck, Phone, ChevronDown } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../context.jsx';
import { Card, Page } from '../components/ui.jsx';

// General awareness content. Have your campus medical and safety teams review and approve these texts before real use.
const TOPICS = [
  { id: 'medical', label: 'Medical emergency', Icon: HeartPulse, steps: ['Send an SOS from the home page or call the Medical Centre first.', 'Stay with the person and keep them calm.', 'If they do not respond or are not breathing, call emergency services at once. Start CPR only if you are trained.', 'Press firmly on heavy bleeding with a clean cloth.', 'Do not give food or drink to someone who is unconscious.', 'Do not move someone with a suspected neck or back injury unless they are in immediate danger.'] },
  { id: 'fire', label: 'Fire safety', Icon: Flame, steps: ['Raise the alarm and send an SOS.', 'Leave by the stairs. Never use a lift.', 'Stay low if there is smoke. Close doors behind you if it is safe.', 'Do not go back for belongings.', 'Go to your assembly point and wait for instructions.', 'Use an extinguisher only if the fire is small, you know how, and you have a clear way out.'] },
  { id: 'accident', label: 'Accidents', Icon: CarFront, steps: ['Check the area is safe for you before helping.', 'Send an SOS and describe where you are.', 'Do not move an injured person unless there is immediate danger such as fire or traffic.', 'Control bleeding with firm pressure.', 'Keep the person warm and talking until help arrives.'] },
  { id: 'women', label: "Women's safety", Icon: ShieldAlert, steps: ['Move towards people and well-lit areas.', 'Use the Harassment / Women Safety button on the SOS page, or call the support number.', 'Tell someone you trust where you are.', 'Keep evidence: messages, photos, date, time and place.', 'You can also file a confidential report in this portal. It is only seen by authorised staff.', 'It is never your fault.'] },
  { id: 'ragging', label: 'Anti-ragging', Icon: Users, steps: ['Ragging and bullying are prohibited and punishable.', 'Report it through Report an incident. Ragging reports are always confidential.', 'You can also tell the warden or campus security.', 'Keep notes on what happened, when and who was present.', 'Ask the administration for your institution\'s anti-ragging committee contacts.'] },
  { id: 'prep', label: 'Be prepared', Icon: ClipboardCheck, steps: ['Save the campus emergency numbers in your phone.', 'Know two ways out of your hostel and classroom block.', 'Find your assembly point. The administration sets and publishes these.', 'Keep your phone charged and allow location when the SOS page asks.', 'Practise in the Simulation centre.'] },
];
const FAQ = [
  ['Should I use this page during an emergency?', 'No. Go to the home page and press the SOS button first. This page is for learning and for later.'],
  ['What if my phone location is off?', 'The alert still goes out. You will be asked to type your building or hostel so the team can find you.'],
  ['Is the SOS alert anonymous?', 'Yes. You do not log in. It uses a random reference on your device. You may add a phone number so the team can call you.'],
  ['Does an SOS call an ambulance or the fire brigade?', 'No. It alerts campus teams. If life is in danger, also call the emergency numbers shown on the SOS page.'],
  ['Who can see harassment reports?', 'Only designated security personnel and the authorised warden or support officer, plus administrators.'],
];

export default function Safety() {
  const [t, setT] = useState(TOPICS[0]);
  const [open, setOpen] = useState(-1);
  const { data } = useAsync(() => api('/public/contacts', { auth: false }), []);
  return (
    <Page title="Safety and guidance" subtitle="First steps for common emergencies, and answers to common questions.">
      <div className="rounded-lg bg-signal p-3 text-sm font-semibold text-white">In an emergency, do not read this page. <Link to="/" className="underline">Open the SOS page</Link> and send an alert now.</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Choose a topic" className="lg:col-span-1"><div className="grid grid-cols-2 gap-2">{TOPICS.map((x) => (
          <button key={x.id} onClick={() => setT(x)} aria-pressed={t.id === x.id} className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center text-sm font-semibold ${t.id === x.id ? 'border-ink bg-ink text-white' : 'border-line hover:bg-slate-50'}`}><x.Icon className="h-6 w-6" />{x.label}</button>))}</div></Card>
        <Card title={t.label} className="lg:col-span-2"><ol className="list-decimal space-y-2 pl-5 text-sm">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="mt-4 rounded-lg bg-amber/10 p-3 text-xs text-slate-700">This is general awareness guidance. It does not replace trained medical, fire or security professionals. When in doubt, call for qualified help.</p></Card>
      </div>
      <Card title="Common questions"><div className="divide-y divide-line">{FAQ.map(([q, a], i) => (
        <div key={q}><button className="flex w-full items-center justify-between gap-3 py-3 text-left font-semibold text-ink" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{q}<ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} /></button>{open === i && <p className="pb-3 text-sm text-slate-700">{a}</p>}</div>))}</div></Card>
      <Card title="Campus emergency contacts"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data?.contacts.map((c) => c.phone ? <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm font-semibold hover:bg-slate-50"><Phone className="h-4 w-4" />{c.label}<span className="ml-auto">{c.phone}</span></a> : <div key={c.id} className="rounded-lg border border-dashed border-line p-3 text-sm text-slate-500">{c.label}: number not set yet</div>)}</div></Card>
    </Page>
  );
}
