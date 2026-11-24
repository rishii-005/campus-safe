import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { q, tx } from '../db.js';
import { auth, requireRole, STAFF } from '../auth.js';
import { audit, bad, forbidden, notFound, HttpError, makeReference, str, COMPLAINT_STATUSES, EMERGENCY_STATUSES, DONE_STATUSES, PRIORITIES, STATUS_LABELS } from '../util.js';
import { broadcast, notifyUsers, adminIds, emitMessage } from '../notify.js';
import { canView, visibility, loadIncident, setStatus, notifyDepartments } from '../services.js';

const r = Router();
r.use(auth);

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(here, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Only these types are accepted; the stored name is random and never taken from the user.
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[file.mimetype]) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Only JPG, PNG, WebP, PDF and Word files are allowed'))),
});

const isStaff = (u) => STAFF.includes(u.role);
const isEmergency = (i) => i.incident_source === 'PUBLIC_SOS';
const statusesFor = (i) => (isEmergency(i) ? EMERGENCY_STATUSES : COMPLAINT_STATUSES);

async function getAllowed(req) {
  const inc = await loadIncident(req.params.id);
  if (!inc || !canView(req.user, inc)) throw notFound('Incident not found');
  return inc;
}
async function getForStaff(req) {
  const inc = await getAllowed(req);
  if (!isStaff(req.user)) throw forbidden();
  return inc;
}

// ---------- create a non-emergency complaint (students) ----------
r.post('/', requireRole('STUDENT'), upload.array('files', 5), async (req, res) => {
  const type = str(req.body.type, 30).toUpperCase();
  const title = str(req.body.title, 150), description = str(req.body.description, 5000);
  const location = str(req.body.location, 200);
  if (title.length < 4) throw bad('Enter a short title (at least 4 characters)');
  if (description.length < 10) throw bad('Describe what happened (at least 10 characters)');
  if (!location) throw bad('Enter the building, hostel or area');
  const { rows: rule } = await q(`SELECT * FROM department_routing_rules WHERE incident_type=$1 AND is_active AND kind IN ('COMPLAINT','BOTH')`, [type]);
  if (!rule[0]) throw bad('Choose a valid category');
  const when = req.body.incidentTime ? new Date(req.body.incidentTime) : null;
  if (when && Number.isNaN(when.getTime())) throw bad('The incident date is not valid');
  const confidential = rule[0].is_confidential || req.body.confidential === 'true';
  const reference = makeReference('CMP');

  const inc = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO incidents(incident_reference, incident_type, incident_source, student_id, department_id, supporting_department_id, title, description,
         priority, status, manual_location, location_status, is_confidential, incident_time)
       VALUES($1,$2,'AUTHENTICATED_COMPLAINT',$3,$4,$5,$6,$7,$8,'SUBMITTED',$9,'MANUAL',$10,$11) RETURNING *`,
      [reference, type, req.user.id, rule[0].primary_department_id, rule[0].supporting_department_id, title, description, rule[0].default_priority, location, confidential, when]);
    await c.query(`INSERT INTO incident_updates(incident_id, status, comment, actor_id, actor_label) VALUES($1,'SUBMITTED','Complaint submitted',$2,$3)`, [rows[0].id, req.user.id, req.user.name]);
    for (const f of req.files || []) {
      await c.query('INSERT INTO evidence_files(incident_id, uploaded_by, original_name, stored_name, mime_type, size_bytes) VALUES($1,$2,$3,$4,$5,$6)',
        [rows[0].id, req.user.id, f.originalname.slice(0, 200), f.filename, f.mimetype, f.size]);
    }
    return rows[0];
  });
  await notifyUsers([req.user.id], { title: `Complaint submitted: ${reference}`, body: 'We have received your complaint. You will be notified at every update.', type: 'STATUS', incidentId: inc.id });
  await notifyDepartments(inc, { title: `New complaint: ${inc.title}`, body: `${reference} | ${rule[0].label} | ${location}`, type: 'COMPLAINT' });
  broadcast(inc, 'incident:new');
  await audit(req.user.id, 'COMPLAINT_CREATED', 'incident', inc.id, { type }, req.ip);
  res.status(201).json({ id: inc.id, reference });
});

// ---------- lists ----------
r.get('/my', async (req, res) => {
  const { rows } = await q(`SELECT i.*, d.name AS department_name FROM incidents i LEFT JOIN departments d ON d.id=i.department_id
    WHERE i.student_id=$1 AND NOT i.is_simulation ORDER BY i.created_at DESC LIMIT 200`, [req.user.id]);
  res.json({ incidents: rows });
});

r.get('/stats', async (req, res) => {
  const v = visibility(req.user);
  const { rows } = await q(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED'))::int AS active,
      count(*) FILTER (WHERE incident_source='PUBLIC_SOS' AND status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS active_emergencies,
      count(*) FILTER (WHERE status IN ('CREATED','SUBMITTED'))::int AS pending_ack,
      count(*) FILTER (WHERE status = 'ASSIGNED')::int AS assigned,
      count(*) FILTER (WHERE status IN ('IN_PROGRESS','ACTION_IN_PROGRESS'))::int AS in_progress,
      count(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))::int AS resolved,
      count(*) FILTER (WHERE priority IN ('CRITICAL','HIGH') AND status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED'))::int AS high_priority,
      count(*) FILTER (WHERE is_delayed AND status IN ('CREATED','SUBMITTED'))::int AS delayed
    FROM incidents i WHERE ${v.sql}`, v.params);
  res.json({ stats: rows[0] });
});

r.get('/', async (req, res) => {
  const v = visibility(req.user);
  const where = [v.sql]; const params = [...v.params];
  const add = (sql, val) => { params.push(val); where.push(sql.replaceAll('?', `$${params.length}`)); };
  const f = req.query;
  if (f.status) add('i.status = ?', String(f.status));
  if (f.type) add('i.incident_type = ?', String(f.type));
  if (f.priority) add('i.priority = ?', String(f.priority));
  if (f.source) add('i.incident_source = ?', String(f.source));
  if (f.department && req.user.role === 'ADMIN') add('(i.department_id = ? OR i.supporting_department_id = ?)', Number(f.department));
  if (f.from) add('i.created_at >= ?::timestamptz', String(f.from));
  if (f.to) add(`i.created_at < (?::date + 1)`, String(f.to));
  if (f.active === 'true') where.push(`i.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED')`);
  if (f.q) add('(i.incident_reference ILIKE ? OR i.title ILIKE ? OR i.manual_location ILIKE ?)', `%${String(f.q).slice(0, 60)}%`);
  const { rows } = await q(
    `SELECT i.id, i.incident_reference, i.incident_type, i.incident_source, i.title, i.priority, i.status, i.created_at, i.is_delayed, i.is_confidential,
            i.location_status, i.manual_location, d.name AS department_name
     FROM incidents i LEFT JOIN departments d ON d.id = i.department_id
     WHERE ${where.join(' AND ')} ORDER BY (i.status IN ('CREATED','SUBMITTED')) DESC, i.created_at DESC LIMIT 500`, params);
  res.json({ incidents: rows });
});

// ---------- detail ----------
r.get('/:id', async (req, res) => {
  const inc = await getAllowed(req);
  const staff = isStaff(req.user);
  const { rows: updates } = await q(
    `SELECT u.id, u.status, u.comment, u.is_internal, u.created_at, COALESCE(us.name, u.actor_label) AS actor
     FROM incident_updates u LEFT JOIN users us ON us.id = u.actor_id
     WHERE u.incident_id=$1 ${staff ? '' : 'AND NOT u.is_internal'} ORDER BY u.created_at, u.id`, [inc.id]);
  const { rows: assignments } = await q(
    `SELECT a.id, a.status, a.created_at, a.responded_at, ru.name AS responder_name, ru.id AS responder_user_id
     FROM incident_assignments a JOIN responders r ON r.id=a.responder_id JOIN users ru ON ru.id=r.user_id
     WHERE a.incident_id=$1 ORDER BY a.created_at`, [inc.id]);
  const { rows: evidence } = await q('SELECT id, original_name, mime_type, size_bytes, created_at FROM evidence_files WHERE incident_id=$1 ORDER BY id', [inc.id]);
  const pending = assignments.find((a) => a.status === 'PENDING' && a.responder_user_id === req.user.id);
  const { contact_info, anonymous_session_id, ...safe } = inc;
  res.json({ incident: staff ? { ...safe, contact_info } : safe, updates, assignments: staff ? assignments : [], evidence,
    pendingAssignmentId: pending?.id || null, statuses: statusesFor(inc) });
});

r.get('/:id/evidence/:fid', async (req, res) => {
  const inc = await getAllowed(req);
  const { rows } = await q('SELECT * FROM evidence_files WHERE id=$1 AND incident_id=$2', [req.params.fid, inc.id]);
  if (!rows[0]) throw notFound('File not found');
  await audit(req.user.id, 'EVIDENCE_VIEWED', 'incident', inc.id, { file: rows[0].id }, req.ip);
  res.setHeader('Content-Type', rows[0].mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].original_name)}"`);
  res.sendFile(path.join(UPLOAD_DIR, rows[0].stored_name));
});

// ---------- status changes ----------
r.patch('/:id/status', async (req, res) => {
  const inc = await getAllowed(req);
  const status = str(req.body.status, 30).toUpperCase();
  const comment = str(req.body.comment, 2000);
  if (!statusesFor(inc).includes(status)) throw bad('That status is not valid for this report');
  if (inc.status === status) throw bad('The report is already in this status');
  if (status === 'REJECTED' && !comment) throw bad('Please give a reason for rejecting');

  if (req.user.role === 'STUDENT') {
    // Students may only cancel before anyone acts, or ask to reopen a finished report.
    const ok = (status === 'CANCELLED' && inc.status === 'SUBMITTED') || (status === 'REOPENED' && ['RESOLVED', 'CLOSED'].includes(inc.status));
    if (!ok || isEmergency(inc)) throw forbidden('You cannot change this report to that status');
    if (status === 'REOPENED' && !comment) throw bad('Tell us why you are reopening this report');
    const updated = await setStatus(inc, status, { actor: req.user, comment });
    await notifyDepartments(updated, { title: `${updated.incident_reference}: ${STATUS_LABELS[status]} by student`, body: comment || 'The student changed this report.', type: 'STATUS' });
    return res.json({ incident: updated });
  }
  if (!isStaff(req.user)) throw forbidden();
  const internal = req.body.internal === true;
  const updated = await setStatus(inc, status, { actor: req.user, comment, internal });
  await audit(req.user.id, 'STATUS_CHANGED', 'incident', inc.id, { from: inc.status, to: status }, req.ip);
  res.json({ incident: updated });
});

r.post('/:id/acknowledge', async (req, res) => {
  const inc = await getForStaff(req);
  if (!['CREATED', 'SUBMITTED'].includes(inc.status)) throw bad('This report has already been acknowledged');
  const updated = await setStatus(inc, 'ACKNOWLEDGED', { actor: req.user, comment: `Acknowledged by ${req.user.department_name || 'staff'}` });
  await audit(req.user.id, 'ACKNOWLEDGED', 'incident', inc.id, null, req.ip);
  res.json({ incident: updated });
});

r.post('/:id/resolve', async (req, res) => {
  const inc = await getForStaff(req);
  const comment = str(req.body.resolution, 2000);
  if (comment.length < 3) throw bad('Add resolution details');
  if (DONE_STATUSES.includes(inc.status)) throw bad('This report is already finished');
  const updated = await setStatus(inc, 'RESOLVED', { actor: req.user, comment });
  await audit(req.user.id, 'RESOLVED', 'incident', inc.id, null, req.ip);
  res.json({ incident: updated });
});

r.post('/:id/escalate', async (req, res) => {
  const inc = await getForStaff(req);
  const reason = str(req.body.reason, 1000);
  if (!reason) throw bad('Give a reason for escalating');
  const { rows } = await q(`UPDATE incidents SET escalated_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [inc.id]);
  await q(`INSERT INTO incident_updates(incident_id, status, comment, is_internal, actor_id) VALUES($1,$2,$3,TRUE,$4)`, [inc.id, inc.status, `ESCALATED: ${reason}`, req.user.id]);
  await notifyUsers(await adminIds(), { title: `Escalated: ${inc.incident_reference}`, body: reason, type: 'ESCALATION', incidentId: inc.id });
  broadcast(rows[0]);
  await audit(req.user.id, 'ESCALATED', 'incident', inc.id, { reason }, req.ip);
  res.json({ ok: true });
});

r.post('/:id/notes', async (req, res) => {
  const inc = await getForStaff(req);
  const body = str(req.body.body, 3000);
  if (!body) throw bad('Write a note first');
  await q(`INSERT INTO incident_updates(incident_id, status, comment, is_internal, actor_id) VALUES($1,$2,$3,TRUE,$4)`, [inc.id, inc.status, body, req.user.id]);
  broadcast(inc);
  res.status(201).json({ ok: true });
});

// ---------- assignment ----------
r.post('/:id/assign', async (req, res) => {
  const inc = await getForStaff(req);
  if (DONE_STATUSES.includes(inc.status)) throw bad('This report is already finished');
  const { rows: rr } = await q(
    `SELECT r.*, u.name, u.id AS uid FROM responders r JOIN users u ON u.id = r.user_id WHERE r.id=$1 AND u.is_active`, [Number(req.body.responderId)]);
  const resp = rr[0];
  if (!resp) throw bad('Choose a responder');
  if (resp.availability === 'OFFLINE') throw bad('This responder is offline');
  if (![inc.department_id, inc.supporting_department_id].includes(resp.department_id) && req.user.role !== 'ADMIN') throw bad('This responder is not in a department handling this report');

  const updated = await tx(async (c) => {
    await c.query(`UPDATE incident_assignments SET status='REASSIGNED', responded_at=now() WHERE incident_id=$1 AND status IN ('PENDING','ACCEPTED')`, [inc.id]);
    await c.query('INSERT INTO incident_assignments(incident_id, responder_id, assigned_by) VALUES($1,$2,$3)', [inc.id, resp.id, req.user.id]);
    const { rows } = await c.query(
      `UPDATE incidents SET assigned_responder_id=$2, assigned_at=now(), status='ASSIGNED', updated_at=now(),
         acknowledged_at=COALESCE(acknowledged_at, now()), is_delayed=FALSE WHERE id=$1 RETURNING *`, [inc.id, resp.id]);
    await c.query(`INSERT INTO incident_updates(incident_id, status, comment, actor_id) VALUES($1,'ASSIGNED',$2,$3)`, [inc.id, `Assigned to ${resp.name}`, req.user.id]);
    return rows[0];
  });
  await notifyUsers([resp.uid], { title: `New assignment: ${inc.incident_reference}`, body: `${inc.title || inc.incident_type} — please accept or decline.`, type: 'ASSIGNMENT', incidentId: inc.id });
  if (inc.student_id) await notifyUsers([inc.student_id], { title: `${inc.incident_reference}: Officer assigned`, body: `${resp.name} has been assigned to your report.`, type: 'STATUS', incidentId: inc.id });
  broadcast(updated);
  await audit(req.user.id, 'ASSIGNED', 'incident', inc.id, { responder: resp.id }, req.ip);
  res.json({ incident: updated });
});

r.post('/:id/assignment/respond', async (req, res) => {
  const inc = await getForStaff(req);
  const { rows } = await q(
    `SELECT a.id, r.id AS rid FROM incident_assignments a JOIN responders r ON r.id=a.responder_id
     WHERE a.incident_id=$1 AND a.status='PENDING' AND r.user_id=$2`, [inc.id, req.user.id]);
  if (!rows[0]) throw bad('You have no pending assignment on this report');
  const accept = req.body.accept === true;
  await q(`UPDATE incident_assignments SET status=$2, responded_at=now() WHERE id=$1`, [rows[0].id, accept ? 'ACCEPTED' : 'REJECTED']);
  let updated;
  if (accept) {
    updated = await setStatus(inc, isEmergency(inc) ? 'IN_PROGRESS' : 'ACTION_IN_PROGRESS', { actor: req.user, comment: `${req.user.name} accepted the assignment and started work` });
  } else {
    await q('UPDATE incidents SET assigned_responder_id=NULL WHERE id=$1', [inc.id]);
    updated = await setStatus({ ...inc }, 'ACKNOWLEDGED', { actor: req.user, comment: `${req.user.name} declined the assignment: ${str(req.body.comment, 300) || 'no reason given'}`, internal: true });
    await notifyDepartments(updated, { title: `Assignment declined: ${inc.incident_reference}`, body: 'Please assign another responder.', type: 'ASSIGNMENT' }, req.user.id);
  }
  res.json({ incident: updated });
});

// ---------- messages ----------
r.get('/:id/messages', async (req, res) => {
  const inc = await getAllowed(req);
  const staff = isStaff(req.user);
  const { rows } = await q(
    `SELECT m.id, m.body, m.is_internal, m.created_at, m.sender_id, u.name AS sender_name, u.role AS sender_role
     FROM incident_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.incident_id=$1 ${staff ? '' : 'AND NOT m.is_internal'} ORDER BY m.created_at, m.id`, [inc.id]);
  // Reading the thread clears its message notifications (this is how unread indicators work).
  await q(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND incident_id=$2 AND type='MESSAGE'`, [req.user.id, inc.id]);
  res.json({ messages: rows });
});

r.post('/:id/messages', async (req, res) => {
  const inc = await getAllowed(req);
  const body = str(req.body.body, 2000);
  if (!body) throw bad('Write a message first');
  const staff = isStaff(req.user);
  if (isEmergency(inc) && !staff) throw forbidden();
  const internal = staff ? req.body.internal !== false : false;
  const { rows } = await q('INSERT INTO incident_messages(incident_id, sender_id, body, is_internal) VALUES($1,$2,$3,$4) RETURNING *', [inc.id, req.user.id, body, internal]);
  const msg = { ...rows[0], sender_name: req.user.name, sender_role: req.user.role };
  emitMessage(inc, msg);
  const title = `New message on ${inc.incident_reference}`;
  if (!internal && inc.student_id && inc.student_id !== req.user.id) await notifyUsers([inc.student_id], { title, body: body.slice(0, 120), type: 'MESSAGE', incidentId: inc.id });
  if (internal || !staff) await notifyDepartments(inc, { title, body: body.slice(0, 120), type: 'MESSAGE' }, req.user.id);
  res.status(201).json({ message: msg });
});

export default r;
