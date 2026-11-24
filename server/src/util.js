import crypto from 'crypto';
import { q } from './db.js';

export const COMPLAINT_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ASSIGNED', 'ACTION_IN_PROGRESS',
  'RESPONSE_PROVIDED', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'REOPENED'];
export const EMERGENCY_STATUSES = ['CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'];
export const DONE_STATUSES = ['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'];
export const SOS_TYPES = ['MEDICAL', 'FIRE', 'ACCIDENT', 'HARASSMENT'];
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

export const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function makeReference(prefix) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
  return `CS-${prefix}-${d}-${rand}`;
}

export async function audit(actorId, action, entity, entityId, details, ip) {
  try {
    await q('INSERT INTO audit_logs(actor_id, action, entity, entity_id, details, ip) VALUES($1,$2,$3,$4,$5,$6)',
      [actorId || null, action, entity || null, entityId != null ? String(entityId) : null, details ? JSON.stringify(details) : null, ip || null]);
  } catch (e) { console.error('audit failed', e.message); }
}

export const STATUS_LABELS = {
  SUBMITTED: 'Submitted', ACKNOWLEDGED: 'Acknowledged', UNDER_REVIEW: 'Under review', ASSIGNED: 'Assigned',
  ACTION_IN_PROGRESS: 'Action in progress', RESPONSE_PROVIDED: 'Response provided', RESOLVED: 'Resolved',
  CLOSED: 'Closed', REJECTED: 'Rejected', CANCELLED: 'Cancelled', REOPENED: 'Reopened',
  CREATED: 'Alert created', IN_PROGRESS: 'Response in progress',
};
