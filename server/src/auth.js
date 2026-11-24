import jwt from 'jsonwebtoken';
import { q } from './db.js';

export const STAFF = ['SECURITY', 'WARDEN', 'MEDICAL', 'ADMIN'];

export const sign = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' });

export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    // Always re-read the user so deactivated accounts and role changes apply immediately.
    const { rows } = await q(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.registration_no, u.hostel, u.phone, u.is_active,
              d.name AS department_name, r.id AS responder_id
       FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN responders r ON r.user_id = u.id
       WHERE u.id = $1`, [p.id]);
    if (!rows[0] || !rows[0].is_active) return res.status(401).json({ error: 'This account is not active' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do this' });
