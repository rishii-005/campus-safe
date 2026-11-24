import 'dotenv/config';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { q } from './db.js';
import { setIO, notifyUsers, deptUserIds, broadcast } from './notify.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import incidentRoutes from './routes/incidents.js';
import { responders, notifications } from './routes/misc.js';
import adminRoutes from './routes/admin.js';
import simulationRoutes from './routes/simulations.js';
import { HttpError } from './util.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) { console.error('Set JWT_SECRET (16+ characters) in server/.env'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL in server/.env'); process.exit(1); }

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
const app = express();
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/responders', responders);
app.use('/api/notifications', notifications);
app.use('/api/admin', adminRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Optional single-server deployment: if the client has been built, serve it too.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 5 MB or smaller' : 'Upload problem: ' + err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: origins } });
setIO(io);

// Socket authorization: a valid token is required; rooms come from the account, never from the client.
io.use(async (socket, next) => {
  try {
    const p = jwt.verify(String(socket.handshake.auth?.token || ''), process.env.JWT_SECRET);
    const { rows } = await q('SELECT id, role, department_id, is_active FROM users WHERE id=$1', [p.id]);
    if (!rows[0]?.is_active) return next(new Error('unauthorized'));
    socket.user = rows[0];
    next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  const u = socket.user;
  socket.join(`user:${u.id}`);
  if (u.role !== 'STUDENT' && u.department_id) socket.join(`dept:${u.department_id}`);
  if (u.role === 'ADMIN') socket.join('admins');
});

// Auto-escalation: unacknowledged reports past their priority's time limit are flagged and sent up.
async function escalationSweep() {
  try {
    const { rows } = await q(`SELECT i.* FROM incidents i JOIN escalation_rules e ON e.priority = i.priority
      WHERE i.status IN ('CREATED','SUBMITTED') AND NOT i.is_delayed AND NOT i.is_simulation AND i.created_at < now() - (e.ack_minutes || ' minutes')::interval`);
    for (const inc of rows) {
      const { rows: [u] } = await q(`UPDATE incidents SET is_delayed=TRUE, escalated_at=now(), updated_at=now() WHERE id=$1 AND NOT is_delayed RETURNING *`, [inc.id]);
      if (!u) continue;
      await q(`INSERT INTO incident_updates(incident_id, status, comment, is_internal, actor_label) VALUES($1,$2,'AUTO-ESCALATED: not acknowledged within the time limit',TRUE,'System')`, [inc.id, inc.status]);
      const { rows: alt } = await q(`SELECT u.name FROM responders r JOIN users u ON u.id=r.user_id WHERE r.availability='AVAILABLE' AND r.department_id = ANY($1::int[]) LIMIT 1`, [[inc.department_id, inc.supporting_department_id].filter(Boolean)]);
      const ids = await deptUserIds([inc.department_id, inc.supporting_department_id]);
      await notifyUsers(ids, { title: `DELAYED: ${inc.incident_reference} not acknowledged`, body: alt[0] ? `Suggested available responder: ${alt[0].name}` : 'No available responder found. Please act now.', type: 'ESCALATION', incidentId: inc.id });
      broadcast(u);
    }
  } catch (e) { console.error('escalation sweep failed', e.message); }
}
setInterval(escalationSweep, 30_000);

const port = Number(process.env.PORT) || 5000;
server.listen(port, () => console.log(`Campus Safe API running on http://localhost:${port}`));
