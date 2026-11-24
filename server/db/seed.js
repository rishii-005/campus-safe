import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const DEMO_PASSWORD = 'Password@123';
const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

const depts = [
  ['SECURITY', 'Campus Security'], ['MEDICAL', 'Medical Centre'],
  ['WARDEN', 'Warden Office'], ['ADMINISTRATION', 'Administration'],
];
for (const [code, name] of depts) {
  await pool.query('INSERT INTO departments(code, name) VALUES($1,$2) ON CONFLICT (code) DO NOTHING', [code, name]);
}
const { rows: dr } = await pool.query('SELECT id, code FROM departments');
const D = Object.fromEntries(dr.map((r) => [r.code, r.id]));

// [name, email, role, dept, isResponder]
const users = [
  ['Super Admin', 'admin@campus.test', 'ADMIN', 'ADMINISTRATION', false],
  ['Ravi Security (Coordinator)', 'security@campus.test', 'SECURITY', 'SECURITY', true],
  ['Meena Security', 'security2@campus.test', 'SECURITY', 'SECURITY', true],
  ['Anita Warden', 'warden@campus.test', 'WARDEN', 'WARDEN', true],
  ['Dr. Kapoor', 'medical@campus.test', 'MEDICAL', 'MEDICAL', true],
  ['Nurse Sharma', 'medical2@campus.test', 'MEDICAL', 'MEDICAL', true],
];
for (const [name, email, role, dept, isResp] of users) {
  const { rows } = await pool.query(
    `INSERT INTO users(name, email, password_hash, role, department_id) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [name, email, hash, role, D[dept]]);
  if (isResp) await pool.query('INSERT INTO responders(user_id, department_id) VALUES($1,$2) ON CONFLICT (user_id) DO NOTHING', [rows[0].id, D[dept]]);
}
await pool.query(
  `INSERT INTO users(name, email, password_hash, role, registration_no, hostel, phone) VALUES('Demo Student','student@campus.test',$1,'STUDENT','12300001','Hostel A','')
   ON CONFLICT (email) DO NOTHING`, [hash]);

// type, label, kind, primary, supporting, priority, confidential
const rules = [
  ['MEDICAL', 'Medical emergency', 'EMERGENCY', 'MEDICAL', 'SECURITY', 'CRITICAL', false],
  ['FIRE', 'Fire emergency', 'EMERGENCY', 'SECURITY', 'ADMINISTRATION', 'CRITICAL', false],
  ['ACCIDENT', 'Accident emergency', 'EMERGENCY', 'SECURITY', 'MEDICAL', 'HIGH', false],
  ['HARASSMENT', 'Harassment / women safety', 'BOTH', 'SECURITY', 'WARDEN', 'HIGH', true],
  ['RAGGING', 'Ragging or bullying', 'COMPLAINT', 'SECURITY', 'WARDEN', 'HIGH', true],
  ['HOSTEL', 'Hostel-related issue', 'COMPLAINT', 'WARDEN', null, 'MEDIUM', false],
  ['SECURITY_CONCERN', 'Security concern', 'COMPLAINT', 'SECURITY', null, 'MEDIUM', false],
  ['MAINTENANCE', 'Maintenance issue', 'COMPLAINT', 'ADMINISTRATION', null, 'LOW', false],
  ['THEFT', 'Theft or lost belongings', 'COMPLAINT', 'SECURITY', null, 'MEDIUM', false],
  ['INFRASTRUCTURE', 'Infrastructure problem', 'COMPLAINT', 'ADMINISTRATION', null, 'LOW', false],
  ['GENERAL', 'General complaint', 'COMPLAINT', 'ADMINISTRATION', null, 'LOW', false],
  ['OTHER', 'Other campus concern', 'COMPLAINT', 'ADMINISTRATION', null, 'LOW', false],
];
for (const [t, label, kind, p, s, pr, conf] of rules) {
  await pool.query(
    `INSERT INTO department_routing_rules(incident_type, label, kind, primary_department_id, supporting_department_id, default_priority, is_confidential)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (incident_type) DO NOTHING`, [t, label, kind, D[p], s ? D[s] : null, pr, conf]);
}
for (const [p, m] of [['CRITICAL', 2], ['HIGH', 5], ['MEDIUM', 30], ['LOW', 120]]) {
  await pool.query('INSERT INTO escalation_rules(priority, ack_minutes) VALUES($1,$2) ON CONFLICT (priority) DO NOTHING', [p, m]);
}
const { rows: c } = await pool.query('SELECT count(*)::int n FROM emergency_contacts');
if (c[0].n === 0) {
  // Phone numbers are intentionally empty: the administrator sets the real ones in Configuration.
  for (const [i, [label, cat]] of [['Campus Security', 'SECURITY'], ['Campus Medical Centre', 'MEDICAL'], ['Fire / Emergency Services', 'FIRE'], ['Women Safety / Student Support', 'SUPPORT']].entries()) {
    await pool.query('INSERT INTO emergency_contacts(label, category, phone, sort_order) VALUES($1,$2,$3,$4)', [label, cat, '', i]);
  }
}
const { rows: s } = await pool.query('SELECT count(*)::int n FROM simulation_scenarios');
if (s[0].n === 0) {
  const sc = [
    ['Medical emergency near hostel', 'MEDICAL', 'A student collapses outside the hostel gate.', 'Work through every step in order: the alert reaches Medical Staff, they acknowledge, a responder is assigned, responds, and the case is resolved.'],
    ['Fire incident in an academic block', 'FIRE', 'Smoke is reported from a lab in the academic block.', 'Security acknowledges first, assigns a responder, coordinates with Administration, then resolves.'],
    ['Accident near cafeteria', 'ACCIDENT', 'A student falls from a bicycle near the cafeteria and is injured.', 'Security leads and Medical Staff supports. Complete all five steps in order.'],
    ['Harassment complaint', 'HARASSMENT', 'A student reports being followed on the way to the library.', 'Handled confidentially by designated security personnel with the authorised warden.'],
  ];
  for (const x of sc) await pool.query('INSERT INTO simulation_scenarios(title, incident_type, description, instructions) VALUES($1,$2,$3,$4)', x);
}
console.log(`Seed complete. Demo logins (password ${DEMO_PASSWORD}): admin@, security@, warden@, medical@, student@ + campus.test`);
await pool.end();
