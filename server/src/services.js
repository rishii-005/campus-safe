import { tx, q } from './db.js';
import { broadcast, notifyUsers, deptUserIds } from './notify.js';
import { STATUS_LABELS } from './util.js';

// Can this logged-in user see this incident?
export function canView(user, inc) {
  if (inc.is_simulation) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'STUDENT') return inc.student_id === user.id;
  return !!user.department_id && (inc.department_id === user.department_id || inc.supporting_department_id === user.department_id);
}

// SQL fragment limiting a query to what a user may see. Returns { sql, params }.
export function visibility(user, startIndex = 1, alias = 'i') {
  if (user.role === 'ADMIN') return { sql: `${alias}.is_simulation = FALSE`, params: [] };
  if (user.role === 'STUDENT') return { sql: `${alias}.is_simulation = FALSE AND ${alias}.student_id = $${startIndex}`, params: [user.id] };
  return {
    sql: `${alias}.is_simulation = FALSE AND (${alias}.department_id = $${startIndex} OR ${alias}.supporting_department_id = $${startIndex})`,
    params: [user.department_id || -1],
  };
}

export async function loadIncident(id, client) {
  const { rows } = await (client || { query: q }).query(
    `SELECT i.*, d.name AS department_name, sd.name AS supporting_department_name,
            ru.name AS responder_name, s.name AS student_name, s.registration_no AS student_reg
     FROM incidents i
     LEFT JOIN departments d ON d.id = i.department_id
     LEFT JOIN departments sd ON sd.id = i.supporting_department_id
     LEFT JOIN responders r ON r.id = i.assigned_responder_id
     LEFT JOIN users ru ON ru.id = r.user_id
     LEFT JOIN users s ON s.id = i.student_id
     WHERE i.id = $1`, [id]);
  return rows[0] || null;
}

// Change status + record who did it + notify the student. Used by every status path.
export async function setStatus(inc, status, { actor, comment, internal = false, actorLabel }) {
  const updated = await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE incidents SET status = $2, updated_at = now(),
         acknowledged_at = COALESCE(acknowledged_at, CASE WHEN $2 NOT IN ('CREATED','SUBMITTED','CANCELLED') THEN now() END),
         is_delayed = CASE WHEN $2 NOT IN ('CREATED','SUBMITTED') THEN FALSE ELSE is_delayed END,
         resolved_at = CASE WHEN $2 = 'RESOLVED' THEN now() WHEN $2 = 'REOPENED' THEN NULL ELSE resolved_at END,
         closed_at = CASE WHEN $2 = 'CLOSED' THEN now() WHEN $2 = 'REOPENED' THEN NULL ELSE closed_at END,
         cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END
       WHERE id = $1 RETURNING *`, [inc.id, status]);
    await c.query(
      'INSERT INTO incident_updates(incident_id, status, comment, is_internal, actor_id, actor_label) VALUES($1,$2,$3,$4,$5,$6)',
      [inc.id, status, comment || null, internal, actor?.id || null, actorLabel || actor?.name || null]);
    return rows[0];
  });
  broadcast(updated);
  if (updated.student_id && !internal && actor?.id !== updated.student_id) {
    await notifyUsers([updated.student_id], {
      title: `${updated.incident_reference}: ${STATUS_LABELS[status] || status}`,
      body: comment || `Your report is now "${STATUS_LABELS[status] || status}".`,
      type: 'STATUS', incidentId: updated.id,
    });
  }
  return updated;
}

export async function notifyDepartments(inc, payload, exceptUserId) {
  const ids = await deptUserIds([inc.department_id, inc.supporting_department_id], exceptUserId);
  return notifyUsers(ids, { ...payload, incidentId: inc.id });
}
