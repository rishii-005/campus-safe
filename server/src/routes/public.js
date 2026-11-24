import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { q, tx } from '../db.js';
import { bad, notFound, HttpError, makeReference, num, str, SOS_TYPES, DONE_STATUSES } from '../util.js';
import { broadcast, notifyUsers, deptUserIds } from '../notify.js';
import { loadIncident, notifyDepartments } from '../services.js';

const r = Router();
const createLimiter = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many alerts from this connection. If this is an emergency, call campus security directly.' } });
const readLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

const LABEL = { MEDICAL: 'Medical emergency', FIRE: 'Fire emergency', ACCIDENT: 'Accident emergency', HARASSMENT: 'Harassment / women safety alert' };
const okLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
const okLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
const FAIL_STATES = ['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'PENDING'];

function locationText(i) {
  const parts = [];
  if (i.latitude != null) parts.push(`GPS ${Number(i.latitude).toFixed(5)}, ${Number(i.longitude).toFixed(5)}${i.location_accuracy ? ` (±${Math.round(i.location_accuracy)} m)` : ''}`);
  if (i.manual_location) parts.push(`Location given: ${i.manual_location}`);
  return parts.length ? parts.join(' | ') : 'Location NOT available (incomplete)';
}

r.get('/contacts', readLimiter, async (_req, res) => {
  const { rows } = await q('SELECT id, label, category, phone FROM emergency_contacts ORDER BY sort_order, id');
  res.json({ contacts: rows });
});

// Create an anonymous SOS. No login, no form: only the category is required.
r.post('/emergency', createLimiter, async (req, res) => {
  const type = str(req.body.type, 20).toUpperCase();
  const sessionId = str(req.body.sessionId, 64);
  if (!SOS_TYPES.includes(type)) throw bad('Unknown emergency type');
  if (sessionId.length < 8) throw bad('Missing session reference');

  // Duplicate protection: same device + same category within 2 minutes returns the existing alert.
  const dup = await q(`SELECT incident_reference, status, created_at, location_status FROM incidents
    WHERE anonymous_session_id=$1 AND incident_type=$2 AND created_at > now() - interval '2 minutes' AND status NOT IN ('CANCELLED','RESOLVED','CLOSED')
    ORDER BY created_at DESC LIMIT 1`, [sessionId, type]);
  if (dup.rows[0]) {
    const d = dup.rows[0];
    return res.json({ reference: d.incident_reference, type, status: d.status, createdAt: d.created_at, locationStatus: d.location_status, deliveryStatus: 'ALREADY_SENT', duplicate: true });
  }

  const { rows: rule } = await q('SELECT * FROM department_routing_rules WHERE incident_type=$1 AND is_active', [type]);
  if (!rule[0]) throw new HttpError(503, 'Emergency routing is not configured. Please call campus security directly.');

  const lat = num(req.body.latitude), lng = num(req.body.longitude);
  const hasCoords = okLat(lat) && okLng(lng);
  const manual = str(req.body.manualLocation, 200);
  let locationStatus = hasCoords ? 'CAPTURED' : (FAIL_STATES.includes(req.body.locationStatus) ? req.body.locationStatus : 'UNAVAILABLE');
  if (!hasCoords && manual) locationStatus = 'MANUAL';

  const reference = makeReference('EM');
  const inc = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO incidents(incident_reference, incident_type, incident_source, anonymous_session_id, department_id, supporting_department_id,
         title, priority, status, latitude, longitude, location_accuracy, location_status, manual_location, is_confidential)
       VALUES($1,$2,'PUBLIC_SOS',$3,$4,$5,$6,$7,'CREATED',$8,$9,$10,$11,$12,$13) RETURNING *`,
      [reference, type, sessionId, rule[0].primary_department_id, rule[0].supporting_department_id, LABEL[type], rule[0].default_priority,
        hasCoords ? lat : null, hasCoords ? lng : null, hasCoords ? num(req.body.accuracy) : null, locationStatus, manual || null, rule[0].is_confidential]);
    await c.query(`INSERT INTO incident_updates(incident_id, status, comment, actor_label) VALUES($1,'CREATED','SOS alert created from the public emergency page','Anonymous student')`, [rows[0].id]);
    return rows[0];
  });

  const sent = await notifyDepartments(inc, {
    title: `New ${LABEL[type]}`, type: 'SOS',
    body: `${reference} | ${locationText(inc)}`,
  });
  broadcast(inc, 'incident:new');
  res.status(201).json({ reference, type, status: inc.status, createdAt: inc.created_at, locationStatus,
    deliveryStatus: sent.length ? 'DELIVERED_TO_DEPARTMENT' : 'RECORDED_NO_ONLINE_RECIPIENTS' });
});

async function findOwned(ref, sessionId) {
  const { rows } = await q('SELECT id FROM incidents WHERE incident_reference=$1 AND anonymous_session_id=$2 AND incident_source = \'PUBLIC_SOS\'', [ref, str(sessionId, 64)]);
  if (!rows[0]) throw notFound('Alert not found');
  return loadIncident(rows[0].id);
}

r.post('/emergency/:ref/cancel', readLimiter, async (req, res) => {
  const inc = await findOwned(req.params.ref, req.body.sessionId);
  if (inc.status !== 'CREATED' || Date.now() - new Date(inc.created_at).getTime() > 60_000) {
    throw new HttpError(409, 'The cancellation window has closed. If this was accidental, please call campus security.');
  }
  const updated = await tx(async (c) => {
    const { rows } = await c.query(`UPDATE incidents SET status='CANCELLED', cancelled_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [inc.id]);
    await c.query(`INSERT INTO incident_updates(incident_id, status, comment, actor_label) VALUES($1,'CANCELLED','Cancelled by the sender as an accidental trigger','Anonymous student')`, [inc.id]);
    return rows[0];
  });
  await notifyDepartments(updated, { title: `Alert cancelled: ${updated.incident_reference}`, body: 'The sender reported this was an accidental trigger. It is NOT resolved.', type: 'SOS' });
  broadcast(updated);
  res.json({ ok: true, status: 'CANCELLED' });
});

// Add or refresh location / optional contact after the alert exists. Never delays the alert itself.
r.patch('/emergency/:ref/location', readLimiter, async (req, res) => {
  const inc = await findOwned(req.params.ref, req.body.sessionId);
  if (DONE_STATUSES.includes(inc.status)) throw new HttpError(409, 'This alert is no longer active');
  const lat = num(req.body.latitude), lng = num(req.body.longitude);
  const hasCoords = okLat(lat) && okLng(lng);
  const manual = str(req.body.manualLocation, 200) || inc.manual_location;
  const contact = str(req.body.contactInfo, 40) || inc.contact_info;
  let status = inc.location_status;
  if (hasCoords) status = 'CAPTURED';
  else if (manual && inc.location_status !== 'CAPTURED') status = 'MANUAL';
  else if (FAIL_STATES.includes(req.body.locationStatus) && inc.location_status !== 'CAPTURED') status = req.body.locationStatus;
  const { rows } = await q(
    `UPDATE incidents SET latitude=COALESCE($2, latitude), longitude=COALESCE($3, longitude), location_accuracy=COALESCE($4, location_accuracy),
       location_status=$5, manual_location=$6, contact_info=$7, updated_at=now() WHERE id=$1 RETURNING *`,
    [inc.id, hasCoords ? lat : null, hasCoords ? lng : null, hasCoords ? num(req.body.accuracy) : null, status, manual || null, contact || null]);
  const changedKind = status !== inc.location_status || (manual && manual !== inc.manual_location) || (contact && contact !== inc.contact_info);
  if (changedKind) {
    await q(`INSERT INTO incident_updates(incident_id, status, comment, actor_label) VALUES($1,$2,$3,'Anonymous student')`,
      [inc.id, rows[0].status, `Location updated: ${locationText(rows[0])}${contact ? ` | Contact: ${contact}` : ''}`]);
    // Only notify on meaningful changes; live GPS refreshes just update the row.
    if (status !== inc.location_status || manual !== inc.manual_location || contact !== inc.contact_info) {
      await notifyDepartments(rows[0], { title: `Location update: ${inc.incident_reference}`, body: locationText(rows[0]), type: 'SOS' });
    }
  }
  broadcast(rows[0]);
  res.json({ ok: true, locationStatus: status });
});

r.get('/emergency/:ref/status', readLimiter, async (req, res) => {
  const inc = await findOwned(req.params.ref, req.query.sessionId);
  const { rows: ups } = await q(`SELECT status, comment, created_at FROM incident_updates WHERE incident_id=$1 AND NOT is_internal ORDER BY created_at`, [inc.id]);
  res.json({ reference: inc.incident_reference, type: inc.incident_type, status: inc.status, createdAt: inc.created_at,
    acknowledgedAt: inc.acknowledged_at, locationStatus: inc.location_status, department: inc.department_name, updates: ups });
});

export default r;
