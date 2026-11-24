export const TYPE_LABEL = {
  MEDICAL: 'Medical', FIRE: 'Fire', ACCIDENT: 'Accident', HARASSMENT: 'Harassment / women safety', RAGGING: 'Ragging or bullying',
  HOSTEL: 'Hostel issue', SECURITY_CONCERN: 'Security concern', MAINTENANCE: 'Maintenance', THEFT: 'Theft or lost belongings',
  INFRASTRUCTURE: 'Infrastructure', GENERAL: 'General complaint', OTHER: 'Other',
};
export const STATUS_LABEL = {
  CREATED: 'Alert created', SUBMITTED: 'Submitted', ACKNOWLEDGED: 'Acknowledged', UNDER_REVIEW: 'Under review', ASSIGNED: 'Assigned',
  IN_PROGRESS: 'Response in progress', ACTION_IN_PROGRESS: 'Action in progress', RESPONSE_PROVIDED: 'Response provided',
  RESOLVED: 'Resolved', CLOSED: 'Closed', REJECTED: 'Rejected', CANCELLED: 'Cancelled', REOPENED: 'Reopened',
};
export const COMPLAINT_FLOW = ['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ASSIGNED', 'ACTION_IN_PROGRESS', 'RESPONSE_PROVIDED', 'RESOLVED', 'CLOSED'];
export const EMERGENCY_FLOW = ['CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const DONE = ['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'];

export const STATUS_STYLE = {
  CREATED: 'bg-red-100 text-red-800', SUBMITTED: 'bg-blue-100 text-blue-800', ACKNOWLEDGED: 'bg-sky-100 text-sky-800',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-800', ASSIGNED: 'bg-violet-100 text-violet-800', IN_PROGRESS: 'bg-amber-100 text-amber-900',
  ACTION_IN_PROGRESS: 'bg-amber-100 text-amber-900', RESPONSE_PROVIDED: 'bg-teal-100 text-teal-800', RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-slate-200 text-slate-700', REJECTED: 'bg-rose-100 text-rose-800', CANCELLED: 'bg-slate-200 text-slate-600', REOPENED: 'bg-orange-100 text-orange-800',
};
export const PRIORITY_STYLE = {
  CRITICAL: 'bg-signal text-white', HIGH: 'bg-orange-100 text-orange-900', MEDIUM: 'bg-yellow-100 text-yellow-900', LOW: 'bg-slate-100 text-slate-700',
};
export const COMPLAINT_TYPES = ['HARASSMENT', 'RAGGING', 'HOSTEL', 'SECURITY_CONCERN', 'MAINTENANCE', 'THEFT', 'INFRASTRUCTURE', 'GENERAL', 'OTHER'];
export const ROLE_LABEL = { STUDENT: 'Student', SECURITY: 'Security', WARDEN: 'Warden', MEDICAL: 'Medical staff', ADMIN: 'Super admin' };

export const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const mins = (v) => (v == null ? 'n/a' : v < 1 ? '<1 min' : `${v} min`);
export const secs = (v) => (v == null ? '-' : v < 60 ? `${v}s` : `${Math.floor(v / 60)}m ${v % 60}s`);
export const isStaff = (u) => u && u.role !== 'STUDENT';
