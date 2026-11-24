import { Router } from 'express';
import { q } from '../db.js';
import { auth, requireRole } from '../auth.js';
import { audit, bad, forbidden, notFound, str, SOS_TYPES } from '../util.js';

// Simulations are stored in their own tables and never create real incidents or real notifications.
const r = Router();
r.use(auth);

export const STEPS = [
  { key: 'ALERT', label: 'Simulated alert received', target: 0 },
  { key: 'ACKNOWLEDGE', label: 'Department acknowledges', target: 60 },
  { key: 'ASSIGN', label: 'Responder assigned', target: 120 },
  { key: 'RESPONSE', label: 'Responder on the way / responding', target: 240 },
  { key: 'RESOLVE', label: 'Incident resolved', target: 600 },
];

async function loadSession(id, user) {
  const { rows } = await q(`SELECT s.*, sc.title, sc.incident_type, u.name AS user_name FROM simulation_sessions s
    JOIN simulation_scenarios sc ON sc.id=s.scenario_id JOIN users u ON u.id=s.user_id WHERE s.id=$1`, [Number(id)]);
  if (!rows[0]) throw notFound('Simulation not found');
  if (rows[0].user_id !== user.id && user.role !== 'ADMIN') throw forbidden();
  return rows[0];
}

function scorecard(session, events) {
  const start = new Date(session.started_at).getTime();
  const byStep = Object.fromEntries(events.map((e) => [e.step, e]));
  const steps = STEPS.map((s) => ({ ...s, done: !!byStep[s.key], seconds: byStep[s.key] ? Math.round((new Date(byStep[s.key].created_at).getTime() - start) / 1000) : null }));
  const order = events.map((e) => STEPS.findIndex((s) => s.key === e.step));
  let outOfOrder = 0; for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) outOfOrder++;
  const missed = steps.filter((s) => !s.done).map((s) => s.label);
  const done = steps.length - missed.length;
  const efficiency = done ? Math.round(((done - outOfOrder) / done) * 100) : 0;
  const score = Math.max(0, done * 20 - outOfOrder * 5);
  const t = (k) => steps.find((s) => s.key === k)?.seconds ?? null;
  return { steps, missed, outOfOrder, efficiency, score,
    timeToAcknowledge: t('ACKNOWLEDGE'), timeToAssign: t('ASSIGN'), timeToResponse: t('RESPONSE'), timeToResolve: t('RESOLVE') };
}

r.get('/', async (req, res) => {
  const { rows } = await q(`SELECT * FROM simulation_scenarios ${req.user.role === 'ADMIN' ? '' : 'WHERE is_active'} ORDER BY id`);
  res.json({ scenarios: rows, steps: STEPS });
});

r.post('/', requireRole('ADMIN'), async (req, res) => {
  const title = str(req.body.title, 150), type = str(req.body.incident_type, 20).toUpperCase();
  if (title.length < 4) throw bad('Enter a scenario title');
  if (!SOS_TYPES.includes(type)) throw bad('Choose an emergency category');
  const { rows } = await q('INSERT INTO simulation_scenarios(title, incident_type, description, instructions) VALUES($1,$2,$3,$4) RETURNING *',
    [title, type, str(req.body.description, 1000), str(req.body.instructions, 2000)]);
  await audit(req.user.id, 'SCENARIO_CREATED', 'simulation_scenario', rows[0].id, null, req.ip);
  res.status(201).json({ scenario: rows[0] });
});

r.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  await q('UPDATE simulation_scenarios SET is_active=$1 WHERE id=$2', [req.body.is_active === true, Number(req.params.id)]);
  res.json({ ok: true });
});

r.get('/sessions', async (req, res) => {
  const admin = req.user.role === 'ADMIN';
  const { rows } = await q(`SELECT s.id, s.status, s.score, s.started_at, s.completed_at, sc.title, u.name AS user_name
    FROM simulation_sessions s JOIN simulation_scenarios sc ON sc.id=s.scenario_id JOIN users u ON u.id=s.user_id
    ${admin ? '' : 'WHERE s.user_id=$1'} ORDER BY s.started_at DESC LIMIT 100`, admin ? [] : [req.user.id]);
  res.json({ sessions: rows });
});

r.post('/:id/start', async (req, res) => {
  const { rows: sc } = await q('SELECT id FROM simulation_scenarios WHERE id=$1 AND is_active', [Number(req.params.id)]);
  if (!sc[0]) throw notFound('Scenario not found');
  const { rows } = await q('INSERT INTO simulation_sessions(scenario_id, user_id) VALUES($1,$2) RETURNING *', [sc[0].id, req.user.id]);
  await q(`INSERT INTO simulation_events(session_id, step) VALUES($1,'ALERT')`, [rows[0].id]);
  res.status(201).json({ session: rows[0] });
});

r.get('/sessions/:sid', async (req, res) => {
  const s = await loadSession(req.params.sid, req.user);
  const { rows: ev } = await q('SELECT step, created_at FROM simulation_events WHERE session_id=$1 ORDER BY created_at, id', [s.id]);
  res.json({ session: s, events: ev, scorecard: scorecard(s, ev) });
});

r.post('/sessions/:sid/step', async (req, res) => {
  const s = await loadSession(req.params.sid, req.user);
  if (s.status !== 'IN_PROGRESS') throw bad('This simulation is already complete');
  const step = str(req.body.step, 20).toUpperCase();
  if (!STEPS.some((x) => x.key === step)) throw bad('Unknown step');
  await q('INSERT INTO simulation_events(session_id, step) VALUES($1,$2) ON CONFLICT (session_id, step) DO NOTHING', [s.id, step]);
  res.json({ ok: true });
});

r.post('/sessions/:sid/complete', async (req, res) => {
  const s = await loadSession(req.params.sid, req.user);
  if (s.status === 'COMPLETED') return res.json({ ok: true });
  const { rows: ev } = await q('SELECT step, created_at FROM simulation_events WHERE session_id=$1 ORDER BY created_at, id', [s.id]);
  const card = scorecard(s, ev);
  await q(`UPDATE simulation_sessions SET status='COMPLETED', completed_at=now(), score=$2 WHERE id=$1`, [s.id, card.score]);
  res.json({ ok: true, scorecard: card });
});

export default r;
