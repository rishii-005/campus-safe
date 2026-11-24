import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../context.jsx';
import { ROLE_LABEL } from '../lib/constants.js';
import { Card, Field, Page, ErrorBox, btn, input } from '../components/ui.jsx';

export default function Settings() {
  const { user, toast } = useApp();
  const [p, setP] = useState({ name: user.name, phone: user.phone || '', hostel: user.hostel || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [err, setErr] = useState(''); const [err2, setErr2] = useState('');
  async function saveProfile(e) { e.preventDefault(); setErr(''); try { await api('/auth/me', { method: 'PATCH', body: p }); toast('Profile saved', 'success'); } catch (x) { setErr(x.message); } }
  async function savePw(e) { e.preventDefault(); setErr2(''); try { await api('/auth/change-password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); toast('Password changed', 'success'); } catch (x) { setErr2(x.message); } }
  return (
    <Page title="Account settings" subtitle={`${user.email} · ${ROLE_LABEL[user.role]}${user.registration_no ? ` · ${user.registration_no}` : ''}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profile"><form onSubmit={saveProfile} className="space-y-3">
          <Field label="Name" id="n"><input id="n" className={input} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required /></Field>
          <Field label="Phone" id="ph"><input id="ph" className={input} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="Hostel" id="h"><input id="h" className={input} value={p.hostel} onChange={(e) => setP({ ...p, hostel: e.target.value })} /></Field>
          {err && <ErrorBox message={err} />}<button className={btn.primary}>Save changes</button></form></Card>
        <Card title="Change password"><form onSubmit={savePw} className="space-y-3">
          <Field label="Current password" id="c"><input id="c" type="password" className={input} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <Field label="New password" id="x" hint="At least 8 characters"><input id="x" type="password" className={input} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} /></Field>
          {err2 && <ErrorBox message={err2} />}<button className={btn.primary}>Change password</button></form></Card>
      </div>
    </Page>
  );
}
