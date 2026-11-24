import { pool, q } from './db.js';

let io = null;
export const setIO = (instance) => { io = instance; };

// 1) Save to PostgreSQL first  2) then push over Socket.IO.
export async function notifyUsers(userIds, { title, body, type, incidentId }, client) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const saved = [];
  for (const id of ids) {
    const { rows } = await (client || pool).query(
      'INSERT INTO notifications(user_id, title, body, type, incident_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [id, title, body || null, type || null, incidentId || null]);
    saved.push(rows[0]);
  }
  saved.forEach((n) => io?.to(`user:${n.user_id}`).emit('notification', n));
  return saved;
}

// Everyone who should see an incident: active staff of its departments, plus all admins.
export async function deptUserIds(deptIds, exceptUserId) {
  const ids = deptIds.filter(Boolean);
  const { rows } = await q(
    `SELECT id FROM users WHERE is_active AND role <> 'STUDENT' AND (department_id = ANY($1::int[]) OR role = 'ADMIN') AND id <> COALESCE($2, -1)`,
    [ids, exceptUserId || null]);
  return rows.map((r) => r.id);
}

export async function adminIds() {
  const { rows } = await q(`SELECT id FROM users WHERE is_active AND role = 'ADMIN'`);
  return rows.map((r) => r.id);
}

// Tell connected dashboards to refresh. Rooms are the authorization boundary.
export function broadcast(inc, event = 'incident:changed') {
  if (!io) return;
  const rooms = [`dept:${inc.department_id}`, inc.supporting_department_id && `dept:${inc.supporting_department_id}`, 'admins', inc.student_id && `user:${inc.student_id}`].filter(Boolean);
  const payload = { id: inc.id, reference: inc.incident_reference, status: inc.status };
  rooms.forEach((r) => io.to(r).emit(event, payload));
}

export function emitMessage(inc, msg) {
  if (!io) return;
  const rooms = [`dept:${inc.department_id}`, inc.supporting_department_id && `dept:${inc.supporting_department_id}`, 'admins'];
  if (!msg.is_internal && inc.student_id) rooms.push(`user:${inc.student_id}`);
  rooms.filter(Boolean).forEach((r) => io.to(r).emit('message:new', { incidentId: inc.id, message: msg }));
}
