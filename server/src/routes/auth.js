import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { q } from '../db.js';
import { auth, sign } from '../auth.js';
import { audit, bad, str, HttpError } from '../util.js';

const r = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a minute and try again.' } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const strong = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100;

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department_id: u.department_id,
  department_name: u.department_name, registration_no: u.registration_no, hostel: u.hostel, phone: u.phone, responder_id: u.responder_id });

r.post('/register', limiter, async (req, res) => {
  if (process.env.ENABLE_REGISTRATION === 'false') throw new HttpError(403, 'Registration is turned off');
  const name = str(req.body.name, 100), email = str(req.body.email, 200).toLowerCase();
  const reg = str(req.body.registration_no, 40), hostel = str(req.body.hostel, 100), phone = str(req.body.phone, 20);
  if (name.length < 2) throw bad('Enter your full name');
  if (!EMAIL.test(email)) throw bad('Enter a valid email address');
  if (!reg) throw bad('Enter your registration number');
  if (!strong(req.body.password)) throw bad('Password must be at least 8 characters');
  const hash = await bcrypt.hash(req.body.password, 10);
  try {
    // Role is always STUDENT here; staff accounts are created by an administrator.
    const { rows } = await q(`INSERT INTO users(name, email, password_hash, role, registration_no, hostel, phone) VALUES($1,$2,$3,'STUDENT',$4,$5,$6) RETURNING id`, [name, email, hash, reg, hostel, phone]);
    await audit(rows[0].id, 'REGISTER', 'user', rows[0].id, null, req.ip);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw e;
  }
});

r.post('/login', limiter, async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [email]);
  const u = rows[0];
  // Same message for unknown email and wrong password, so accounts cannot be guessed.
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) {
    await audit(u?.id, 'LOGIN_FAILED', 'user', u?.id, { email }, req.ip);
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (!u.is_active) throw new HttpError(403, 'This account has been deactivated. Contact the administrator.');
  await audit(u.id, 'LOGIN', 'user', u.id, null, req.ip);
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

r.post('/logout', auth, async (req, res) => {
  await audit(req.user.id, 'LOGOUT', 'user', req.user.id, null, req.ip);
  res.json({ ok: true });
});

r.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

r.patch('/me', auth, async (req, res) => {
  const name = str(req.body.name, 100), phone = str(req.body.phone, 20), hostel = str(req.body.hostel, 100);
  if (name.length < 2) throw bad('Enter your name');
  await q('UPDATE users SET name=$1, phone=$2, hostel=$3 WHERE id=$4', [name, phone, hostel, req.user.id]);
  res.json({ ok: true });
});

r.post('/change-password', auth, async (req, res) => {
  const { rows } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current || ''), rows[0].password_hash))) throw bad('Current password is incorrect');
  if (!strong(req.body.next)) throw bad('New password must be at least 8 characters');
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(req.body.next, 10), req.user.id]);
  await audit(req.user.id, 'PASSWORD_CHANGED', 'user', req.user.id, null, req.ip);
  res.json({ ok: true });
});

r.post('/forgot-password', limiter, async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const { rows } = await q('SELECT id FROM users WHERE email=$1 AND is_active', [email]);
  const out = { ok: true, message: 'If this email is registered, a reset link has been prepared.' };
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    await q(`INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES($1,$2, now() + interval '30 minutes')`, [rows[0].id, sha(token)]);
    // No email service is configured. In development the token is returned so you can test the flow.
    // For production, send `${CLIENT_ORIGIN}/login?reset=${token}` by email here instead.
    if (process.env.NODE_ENV !== 'production') { out.devResetToken = token; console.log('[dev] password reset token for', email, token); }
  }
  res.json(out);
});

r.post('/reset-password', limiter, async (req, res) => {
  if (!strong(req.body.password)) throw bad('Password must be at least 8 characters');
  const { rows } = await q(`SELECT id, user_id FROM password_resets WHERE token_hash=$1 AND NOT used AND expires_at > now()`, [sha(String(req.body.token || ''))]);
  if (!rows[0]) throw bad('This reset link is invalid or has expired');
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(req.body.password, 10), rows[0].user_id]);
  await q('UPDATE password_resets SET used = TRUE WHERE id=$1', [rows[0].id]);
  await audit(rows[0].user_id, 'PASSWORD_RESET', 'user', rows[0].user_id, null, req.ip);
  res.json({ ok: true });
});

export default r;
