import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../context.jsx';
import { btn, input, Field, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('reset') ? 'reset' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '', registration_no: '', hostel: '', phone: '', token: params.get('reset') || '' });
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const { login, toast } = useApp(); const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'login') { await login(f.email, f.password); nav('/portal'); }
      else if (mode === 'register') { await api('/auth/register', { method: 'POST', auth: false, body: f }); toast('Account created. You can log in now.', 'success'); setMode('login'); }
      else if (mode === 'forgot') {
        const d = await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email: f.email } });
        setMsg(d.message); if (d.devResetToken) { setF({ ...f, token: d.devResetToken }); setMsg(d.message + ' (Development mode: the reset code is filled in for you.)'); setMode('reset'); }
      } else { await api('/auth/reset-password', { method: 'POST', auth: false, body: { token: f.token, password: f.password } }); toast('Password changed. Please log in.', 'success'); setMode('login'); }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const title = { login: 'Log in to Campus Portal', register: 'Create a student account', forgot: 'Reset your password', reset: 'Choose a new password' }[mode];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <Link to="/" className="mb-4 flex items-center gap-2 font-extrabold text-ink"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal text-white"><ShieldCheck className="h-5 w-5" /></span> Campus Safe</Link>
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        <p className="mb-4 mt-1 text-sm text-slate-600">{mode === 'login' ? 'Your role is set by your account. You do not pick it here.' : mode === 'register' ? 'Staff accounts are created by the administrator.' : ''}</p>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && <><Field label="Full name" id="name"><input id="name" className={input} value={f.name} onChange={set('name')} required /></Field>
            <Field label="Registration number" id="reg"><input id="reg" className={input} value={f.registration_no} onChange={set('registration_no')} required /></Field></>}
          {mode !== 'reset' && <Field label="Email" id="email"><input id="email" type="email" autoComplete="email" className={input} value={f.email} onChange={set('email')} required /></Field>}
          {mode === 'reset' && <Field label="Reset code" id="tok"><input id="tok" className={input} value={f.token} onChange={set('token')} required /></Field>}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && <Field label={mode === 'reset' ? 'New password' : 'Password'} id="pw" hint={mode !== 'login' ? 'At least 8 characters' : undefined}><input id="pw" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={input} value={f.password} onChange={set('password')} required minLength={mode === 'login' ? undefined : 8} /></Field>}
          {mode === 'register' && <div className="grid grid-cols-2 gap-3"><Field label="Hostel (optional)" id="h"><input id="h" className={input} value={f.hostel} onChange={set('hostel')} /></Field><Field label="Phone (optional)" id="ph"><input id="ph" className={input} value={f.phone} onChange={set('phone')} inputMode="tel" /></Field></div>}
          {err && <ErrorBox message={err} />}
          {msg && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{msg}</p>}
          <button disabled={busy} className={`${btn.primary} w-full`}>{busy ? 'Please wait…' : { login: 'Log in', register: 'Create account', forgot: 'Send reset link', reset: 'Save new password' }[mode]}</button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          {mode === 'login' ? <><button className="font-semibold text-ink underline" onClick={() => { setMode('register'); setErr(''); }}>Create student account</button><button className="font-semibold text-ink underline" onClick={() => { setMode('forgot'); setErr(''); }}>Forgot password?</button></>
            : <button className="font-semibold text-ink underline" onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>Back to log in</button>}
        </div>
        {import.meta.env.DEV && mode === 'login' && (
          <details className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Demo accounts (seed data, development only)</summary>
            <p className="mt-2">Password for all: <code>Password@123</code></p><p>admin@, security@, warden@, medical@, student@ + <code>campus.test</code></p></details>
        )}
      </div>
    </div>
  );
}
