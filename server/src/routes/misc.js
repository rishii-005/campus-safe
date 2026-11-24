import { Router } from 'express';
import { q } from '../db.js';
import { auth, requireRole, STAFF } from '../auth.js';
import { bad, forbidden, notFound, str } from '../util.js';

export const responders = Router();
responders.use(auth, requireRole(...STAFF));

responders.get('/', async (req, res) => {
  const params = []; const where = [];
  if (req.user.role !== 'ADMIN') { params.push(req.user.department_id || -1); where.push(`r.department_id = $${params.length}`); }
  // For assignment pickers: show responders from every department handling a given incident.
  if (req.query.forIncident) {
    params.length = 0; where.length = 0;
    const { rows } = await q('SELECT department_id, supporting_department_id FROM incidents WHERE id=$1', [Number(req.query.forIncident)]);
    if (rows[0]) { params.push([rows[0].department_id, rows[0].supporting_department_id].filter(Boolean)); where.push(`r.department_id = ANY($${params.length}::int[])`); }
  }
  const { rows } = await q(
    `SELECT r.id, r.availability, r.max_workload, r.department_id, d.name AS department_name, u.id AS user_id, u.name, u.phone,
        (SELECT count(*)::int FROM incident_assignments a JOIN incidents i ON i.id=a.incident_id
           WHERE a.responder_id=r.id AND a.status IN ('PENDING','ACCEPTED') AND i.assigned_responder_id=r.id AND i.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED')) AS active_count,
        (SELECT count(*)::int FROM incident_assignments a WHERE a.responder_id=r.id) AS total_count,
        (SELECT i.incident_reference FROM incidents i WHERE i.assigned_responder_id=r.id AND i.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED') ORDER BY i.updated_at DESC LIMIT 1) AS current_incident
     FROM responders r JOIN users u ON u.id=r.user_id JOIN departments d ON d.id=r.department_id
     WHERE u.is_active ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY d.name, u.name`, params);
  res.json({ responders: rows });
});

responders.post('/', async (req, res) => {
  if (!['ADMIN', 'SECURITY', 'MEDICAL', 'WARDEN'].includes(req.user.role)) throw forbidden();
  const { rows: u } = await q(`SELECT id, role, department_id FROM users WHERE id=$1 AND is_active AND role <> 'STUDENT'`, [Number(req.body.userId)]);
  if (!u[0]) throw bad('Choose a staff member');
  if (req.user.role !== 'ADMIN' && u[0].department_id !== req.user.department_id) throw forbidden('You can only add responders from your own department');
  if (!u[0].department_id) throw bad('This staff member has no department');
  const { rows } = await q(`INSERT INTO responders(user_id, department_id, max_workload) VALUES($1,$2,$3) ON CONFLICT (user_id) DO NOTHING RETURNING id`, [u[0].id, u[0].department_id, Math.min(Math.max(Number(req.body.maxWorkload) || 3, 1), 20)]);
  res.status(201).json({ id: rows[0]?.id || null });
});

responders.patch('/:id/availability', async (req, res) => {
  const a = str(req.body.availability, 10).toUpperCase();
  if (!['AVAILABLE', 'BUSY', 'OFFLINE'].includes(a)) throw bad('Choose Available, Busy or Offline');
  const { rows } = await q('SELECT user_id, department_id FROM responders WHERE id=$1', [Number(req.params.id)]);
  if (!rows[0]) throw notFound('Responder not found');
  const own = rows[0].user_id === req.user.id;
  const sameDept = rows[0].department_id === req.user.department_id;
  if (!(req.user.role === 'ADMIN' || own || sameDept)) throw forbidden();
  await q('UPDATE responders SET availability=$1 WHERE id=$2', [a, Number(req.params.id)]);
  res.json({ ok: true });
});

export const notifications = Router();
notifications.use(auth);

notifications.get('/', async (req, res) => {
  const { rows } = await q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  const { rows: c } = await q('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT is_read', [req.user.id]);
  res.json({ notifications: rows, unread: c[0].n });
});
notifications.post('/read-all', async (req, res) => {
  await q('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
});
notifications.patch('/:id/read', async (req, res) => {
  await q('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
});
