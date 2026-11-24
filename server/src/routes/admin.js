import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { q } from '../db.js';
import { auth, requireRole } from '../auth.js';
import { audit, bad, notFound, str, HttpError, PRIORITIES } from '../util.js';

const r = Router();
r.use(auth, requireRole('ADMIN'));
const ROLES = ['STUDENT', 'SECURITY', 'WARDEN', 'MEDICAL', 'ADMIN'];
const range = (req) => [req.query.from ? String(req.query.from) : '2000-01-01', req.query.to ? String(req.query.to) : '2999-12-31'];
const W = `created_at >= $1::timestamptz AND created_at < ($2::date + 1) AND NOT is_simulation`;

r.get('/analytics', async (req, res) => {
  const p = range(req);
  const one = async (sql) => (await q(sql, p)).rows;
  const [totals] = await one(`SELECT count(*)::int total,
      count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED'))::int active,
      count(*) FILTER (WHERE status IN ('CREATED','SUBMITTED'))::int pending,
      count(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))::int resolved,
      count(*) FILTER (WHERE status = 'CANCELLED')::int cancelled,
      count(*) FILTER (WHERE incident_source='AUTHENTICATED_COMPLAINT')::int complaints,
      count(*) FILTER (WHERE incident_source='PUBLIC_SOS')::int emergencies,
      round((avg(extract(epoch FROM acknowledged_at - created_at)) / 60)::numeric, 1)::float avg_ack,
      round((avg(extract(epoch FROM assigned_at - created_at)) / 60)::numeric, 1)::float avg_assign,
      round((avg(extract(epoch FROM resolved_at - created_at)) / 60)::numeric, 1)::float avg_resolve
    FROM incidents WHERE ${W}`);
  const byType = await one(`SELECT incident_type AS name, count(*)::int AS value FROM incidents WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`);
  const byDepartment = await one(`SELECT COALESCE(d.name,'Unrouted') AS name, count(*)::int AS value FROM incidents i LEFT JOIN departments d ON d.id=i.department_id
    WHERE i.created_at >= $1::timestamptz AND i.created_at < ($2::date + 1) AND NOT i.is_simulation GROUP BY 1 ORDER BY 2 DESC`);
  const monthly = await one(`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, count(*)::int AS total,
      count(*) FILTER (WHERE incident_source='PUBLIC_SOS')::int AS emergencies, count(*) FILTER (WHERE incident_source='AUTHENTICATED_COMPLAINT')::int AS complaints
    FROM incidents WHERE ${W} GROUP BY 1 ORDER BY 1`);
  const byLocation = await one(`SELECT initcap(lower(trim(manual_location))) AS name, count(*)::int AS value FROM incidents WHERE ${W} AND manual_location IS NOT NULL AND trim(manual_location) <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  const [aging] = await one(`SELECT count(*) FILTER (WHERE now() - created_at < interval '1 day')::int AS under_1d,
      count(*) FILTER (WHERE now() - created_at >= interval '1 day' AND now() - created_at < interval '3 days')::int AS d1_3,
      count(*) FILTER (WHERE now() - created_at >= interval '3 days')::int AS over_3d
    FROM incidents WHERE ${W} AND incident_source='AUTHENTICATED_COMPLAINT' AND status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED')`);
  const { rows: [sim] } = await q(`SELECT count(*)::int AS sessions, count(*) FILTER (WHERE status='COMPLETED')::int AS completed, round(avg(score))::int AS avg_score FROM simulation_sessions`);
  res.json({ totals, byType, byDepartment, monthly, byLocation, aging, simulation: sim });
});

// ---------- users ----------
r.get('/users', async (_req, res) => {
  const { rows } = await q(`SELECT u.id, u.name, u.email, u.role, u.is_active, u.is_verified, u.department_id, d.name AS department_name, u.registration_no, u.created_at
    FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.created_at DESC`);
  res.json({ users: rows });
});

r.post('/users', async (req, res) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 200).toLowerCase(), role = str(req.body.role, 20).toUpperCase();
  if (name.length < 2) throw bad('Enter a name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email');
  if (!ROLES.includes(role)) throw bad('Choose a role');
  const dept = req.body.department_id ? Number(req.body.department_id) : null;
  if (role !== 'STUDENT' && role !== 'ADMIN' && !dept) throw bad('Staff accounts need a department');
  if (!req.body.password || String(req.body.password).length < 8) throw bad('Password must be at least 8 characters');
  try {
    const { rows } = await q(`INSERT INTO users(name, email, password_hash, role, department_id, registration_no) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, email, await bcrypt.hash(String(req.body.password), 10), role, dept, str(req.body.registration_no, 40) || null]);
    await audit(req.user.id, 'USER_CREATED', 'user', rows[0].id, { role }, req.ip);
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw e;
  }
});

r.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await q('SELECT * FROM users WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('User not found');
  const role = req.body.role ? String(req.body.role).toUpperCase() : rows[0].role;
  if (!ROLES.includes(role)) throw bad('Invalid role');
  const active = typeof req.body.is_active === 'boolean' ? req.body.is_active : rows[0].is_active;
  if (id === req.user.id && (!active || role !== 'ADMIN')) throw bad('You cannot deactivate or demote your own account');
  await q(`UPDATE users SET name=$1, role=$2, department_id=$3, is_active=$4, is_verified=$5 WHERE id=$6`,
    [req.body.name ? str(req.body.name, 100) : rows[0].name, role, req.body.department_id !== undefined ? (req.body.department_id || null) : rows[0].department_id,
      active, typeof req.body.is_verified === 'boolean' ? req.body.is_verified : rows[0].is_verified, id]);
  await audit(req.user.id, 'USER_UPDATED', 'user', id, { role, active }, req.ip);
  res.json({ ok: true });
});

r.post('/users/:id/reset-password', async (req, res) => {
  const temp = crypto.randomBytes(6).toString('base64url') + '#9';
  const { rowCount } = await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(temp, 10), Number(req.params.id)]);
  if (!rowCount) throw notFound('User not found');
  await audit(req.user.id, 'PASSWORD_RESET_BY_ADMIN', 'user', req.params.id, null, req.ip);
  res.json({ temporaryPassword: temp });
});

// ---------- departments ----------
r.get('/departments', async (_req, res) => {
  const { rows } = await q(`SELECT d.*, (SELECT count(*)::int FROM users u WHERE u.department_id=d.id AND u.is_active) AS staff_count FROM departments d ORDER BY d.name`);
  res.json({ departments: rows });
});
r.post('/departments', async (req, res) => {
  const name = str(req.body.name, 100), code = str(req.body.code, 30).toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (name.length < 2 || code.length < 2) throw bad('Enter a department name and a short code');
  try {
    const { rows } = await q('INSERT INTO departments(code, name, phone, email) VALUES($1,$2,$3,$4) RETURNING *', [code, name, str(req.body.phone, 30), str(req.body.email, 100)]);
    await audit(req.user.id, 'DEPARTMENT_CREATED', 'department', rows[0].id, null, req.ip);
    res.status(201).json({ department: rows[0] });
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'That department code already exists'); throw e; }
});
r.patch('/departments/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM departments WHERE id=$1', [Number(req.params.id)]);
  if (!rows[0]) throw notFound('Department not found');
  await q('UPDATE departments SET name=$1, phone=$2, email=$3, is_active=$4 WHERE id=$5',
    [req.body.name ? str(req.body.name, 100) : rows[0].name, req.body.phone !== undefined ? str(req.body.phone, 30) : rows[0].phone,
      req.body.email !== undefined ? str(req.body.email, 100) : rows[0].email, typeof req.body.is_active === 'boolean' ? req.body.is_active : rows[0].is_active, rows[0].id]);
  await audit(req.user.id, 'DEPARTMENT_UPDATED', 'department', rows[0].id, null, req.ip);
  res.json({ ok: true });
});

// ---------- routing, escalation, contacts ----------
r.get('/routing', async (_req, res) => {
  const { rows } = await q(`SELECT * FROM department_routing_rules ORDER BY id`);
  res.json({ rules: rows });
});
r.patch('/routing/:id', async (req, res) => {
  const pr = str(req.body.default_priority, 10).toUpperCase();
  if (!PRIORITIES.includes(pr)) throw bad('Invalid priority');
  if (!req.body.primary_department_id) throw bad('Choose a primary department');
  await q(`UPDATE department_routing_rules SET primary_department_id=$1, supporting_department_id=$2, default_priority=$3, is_confidential=$4, is_active=$5 WHERE id=$6`,
    [Number(req.body.primary_department_id), req.body.supporting_department_id ? Number(req.body.supporting_department_id) : null, pr, req.body.is_confidential === true, req.body.is_active !== false, Number(req.params.id)]);
  await audit(req.user.id, 'ROUTING_UPDATED', 'routing_rule', req.params.id, req.body, req.ip);
  res.json({ ok: true });
});
r.get('/escalation', async (_req, res) => {
  const { rows } = await q(`SELECT * FROM escalation_rules ORDER BY array_position(ARRAY['CRITICAL','HIGH','MEDIUM','LOW'], priority)`);
  res.json({ rules: rows });
});
r.patch('/escalation/:id', async (req, res) => {
  const m = Number(req.body.ack_minutes);
  if (!Number.isInteger(m) || m < 1 || m > 10080) throw bad('Enter whole minutes between 1 and 10080');
  await q('UPDATE escalation_rules SET ack_minutes=$1 WHERE id=$2', [m, Number(req.params.id)]);
  await audit(req.user.id, 'ESCALATION_UPDATED', 'escalation_rule', req.params.id, { m }, req.ip);
  res.json({ ok: true });
});
r.get('/contacts', async (_req, res) => {
  const { rows } = await q('SELECT * FROM emergency_contacts ORDER BY sort_order, id');
  res.json({ contacts: rows });
});
r.post('/contacts', async (req, res) => {
  const label = str(req.body.label, 100);
  if (!label) throw bad('Enter a label');
  const { rows } = await q('INSERT INTO emergency_contacts(label, category, phone, sort_order) VALUES($1,$2,$3,(SELECT COALESCE(max(sort_order),0)+1 FROM emergency_contacts)) RETURNING *', [label, str(req.body.category, 30), str(req.body.phone, 30)]);
  res.status(201).json({ contact: rows[0] });
});
r.patch('/contacts/:id', async (req, res) => {
  const phone = str(req.body.phone, 30);
  if (phone && !/^[+0-9()\-\s]{3,30}$/.test(phone)) throw bad('Phone numbers can only contain digits, spaces, + ( ) and -');
  await q('UPDATE emergency_contacts SET label=COALESCE($1,label), phone=$2 WHERE id=$3', [req.body.label ? str(req.body.label, 100) : null, phone, Number(req.params.id)]);
  await audit(req.user.id, 'CONTACT_UPDATED', 'emergency_contact', req.params.id, null, req.ip);
  res.json({ ok: true });
});
r.delete('/contacts/:id', async (req, res) => {
  await q('DELETE FROM emergency_contacts WHERE id=$1', [Number(req.params.id)]);
  res.json({ ok: true });
});

r.get('/audit', async (req, res) => {
  const { rows } = await q(`SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at, u.name AS actor
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC, a.id DESC LIMIT 300`);
  res.json({ logs: rows });
});

// ---------- reports ----------
async function reportRows(req) {
  const p = range(req);
  const { rows } = await q(`SELECT i.incident_reference, i.incident_source, i.incident_type, i.priority, i.status, d.name AS department,
      i.manual_location, i.created_at, i.acknowledged_at, i.resolved_at
    FROM incidents i LEFT JOIN departments d ON d.id=i.department_id
    WHERE i.created_at >= $1::timestamptz AND i.created_at < ($2::date + 1) AND NOT i.is_simulation ORDER BY i.created_at DESC LIMIT 5000`, p);
  return rows;
}
// Stops spreadsheet apps from running cells that start with = + - @ as formulas.
const cell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
r.get('/reports/incidents.csv', async (req, res) => {
  const rows = await reportRows(req);
  const cols = ['incident_reference', 'incident_source', 'incident_type', 'priority', 'status', 'department', 'manual_location', 'created_at', 'acknowledged_at', 'resolved_at'];
  const csv = [cols.join(','), ...rows.map((row) => cols.map((c) => cell(row[c])).join(','))].join('\n');
  await audit(req.user.id, 'REPORT_EXPORT', 'report', 'csv', null, req.ip);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="campus-safe-incidents.csv"');
  res.send(csv);
});
r.get('/reports/incidents.pdf', async (req, res) => {
  const rows = await reportRows(req);
  await audit(req.user.id, 'REPORT_EXPORT', 'report', 'pdf', null, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="campus-safe-incidents.pdf"');
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.pipe(res);
  doc.fontSize(18).text('Campus Safe: Incident Report');
  doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | ${rows.length} records${rows.length >= 5000 ? ' (limited to 5000)' : ''}`).moveDown();
  const x = [36, 170, 250, 330, 400, 520, 640]; const head = ['Reference', 'Type', 'Priority', 'Status', 'Department', 'Created', 'Resolved'];
  const line = (vals, bold) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#000'); vals.forEach((v, i) => doc.text(String(v ?? ''), x[i], y, { width: x[i + 1] ? x[i + 1] - x[i] - 4 : 120, lineBreak: false })); doc.y = y + 13; doc.x = 36; };
  line(head, true);
  for (const row of rows) {
    if (doc.y > 540) { doc.addPage(); line(head, true); }
    line([row.incident_reference, row.incident_type, row.priority, row.status, row.department, row.created_at?.toISOString().slice(0, 16).replace('T', ' '), row.resolved_at?.toISOString().slice(0, 16).replace('T', ' ')]);
  }
  doc.end();
});

export default r;
