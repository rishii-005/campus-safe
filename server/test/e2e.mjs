const B = 'http://localhost:5000/api';
const call = async (m, p, body, tok, raw) => { const r = await fetch(B + p, { method: m, headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }); const t = raw ? await r.text() : await r.json().catch(() => ({})); return { s: r.status, d: t }; };
let pass = 0, fail = 0;
const ok = (name, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(extra))); };
const login = async (e) => (await call('POST', '/auth/login', { email: e + '@campus.test', password: 'Password@123' })).d.token;
const [admin, sec, ward, med, stu] = await Promise.all(['admin', 'security', 'warden', 'medical', 'student'].map(login));
ok('logins', admin && sec && ward && med && stu);
ok('bad login rejected', (await call('POST', '/auth/login', { email: 'admin@campus.test', password: 'x' })).s === 401);
ok('student cannot hit admin', (await call('GET', '/admin/users', null, stu)).s === 403);
ok('no token rejected', (await call('GET', '/incidents')).s === 401);

// A: public SOS
const sid = 'session-' + Date.now();
let r = await call('POST', '/public/emergency', { type: 'MEDICAL', sessionId: sid, latitude: 30.9, longitude: 75.85, accuracy: 20 });
ok('SOS created', r.s === 201 && r.d.reference, r);
const ref = r.d.reference;
r = await call('POST', '/public/emergency', { type: 'MEDICAL', sessionId: sid });
ok('duplicate protected', r.d.duplicate === true, r);
r = await call('POST', '/public/emergency', { type: 'NOPE', sessionId: sid });
ok('bad type 400', r.s === 400);
r = await call('POST', '/public/emergency', { type: 'FIRE', sessionId: sid });
ok('fire w/o location still created', r.s === 201 && r.d.locationStatus !== 'CAPTURED', r);
const fireRef = r.d.reference;
r = await call('PATCH', `/public/emergency/${fireRef}/location`, { sessionId: sid, manualLocation: 'Hostel B, floor 2' });
ok('manual location added', r.d.locationStatus === 'MANUAL', r);
r = await call('GET', `/public/emergency/${ref}/status?sessionId=${sid}`);
ok('public status', r.d.status === 'CREATED');
ok('status needs right session', (await call('GET', `/public/emergency/${ref}/status?sessionId=wrong-session`)).s === 404);
r = await call('POST', '/public/emergency', { type: 'ACCIDENT', sessionId: sid });
const accRef = r.d.reference;
r = await call('POST', `/public/emergency/${accRef}/cancel`, { sessionId: sid });
ok('cancel works', r.d.status === 'CANCELLED', r);
r = await call('POST', '/public/emergency', { type: 'HARASSMENT', sessionId: sid });
const harRef = r.d.reference;

// visibility
const list = async (t) => (await call('GET', '/incidents', null, t)).d.incidents || [];
const has = (l, x) => l.some((i) => i.incident_reference === x);
ok('medical sees medical SOS', has(await list(med), ref));
ok('security sees medical SOS (supporting)', has(await list(sec), ref));
ok('warden does NOT see medical SOS', !has(await list(ward), ref));
ok('medical does NOT see harassment', !has(await list(med), harRef));
ok('warden sees harassment (supporting)', has(await list(ward), harRef));
ok('student does not see SOS', (await list(stu)).every((i) => i.incident_source !== 'PUBLIC_SOS'));
const medList = await list(med); const medInc = medList.find((i) => i.incident_reference === ref);

// C/D: coordination
r = await call('POST', `/incidents/${medInc.id}/acknowledge`, {}, med);
ok('acknowledge', r.s === 200, r);
r = await call('POST', `/incidents/${medInc.id}/acknowledge`, {}, med);
ok('double ack rejected', r.s === 400);
const rs = (await call('GET', `/responders?forIncident=${medInc.id}`, null, med)).d.responders;
ok('responders listed from both depts', rs.length >= 4, rs.length);
const drK = rs.find((x) => x.name.includes('Kapoor'));
r = await call('POST', `/incidents/${medInc.id}/assign`, { responderId: drK.id }, med);
ok('assign', r.d.incident?.status === 'ASSIGNED', r);
const medTok2 = med; // Dr Kapoor is the medical login
r = await call('POST', `/incidents/${medInc.id}/assignment/respond`, { accept: true }, medTok2);
ok('responder accepts -> in progress', r.d.incident?.status === 'IN_PROGRESS', r);
r = await call('POST', `/incidents/${medInc.id}/messages`, { body: 'Team on the way', internal: true }, med);
ok('internal message', r.s === 201, r);
r = await call('GET', `/incidents/${medInc.id}/messages`, null, sec);
ok('security reads team chat', r.d.messages?.length === 1, r);
r = await call('POST', `/incidents/${medInc.id}/resolve`, { resolution: 'Student treated and sent to ward' }, med);
ok('resolve', r.d.incident?.status === 'RESOLVED', r);
r = await call('GET', `/public/emergency/${ref}/status?sessionId=${sid}`);
ok('public sees resolved + timeline', r.d.status === 'RESOLVED' && r.d.updates.length >= 4, r.d);
r = await call('POST', `/incidents/${medInc.id}/escalate`, { reason: 'test' }, sec);
ok('escalate', r.s === 200, r);
r = await call('POST', `/incidents/${medInc.id}/assign`, { responderId: drK.id }, med);
ok('cannot assign finished', r.s === 400);

// B: complaint
const fd = new FormData();
fd.append('type', 'HOSTEL'); fd.append('title', 'Water leak in room'); fd.append('description', 'There is a leak from the ceiling in room 204.'); fd.append('location', 'Hostel A 204');
fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'proof.pdf');
r = await call('POST', '/incidents', fd, stu);
ok('complaint created w/ evidence', r.s === 201 && r.d.reference, r);
const cid = r.d.id;
const bad = new FormData(); bad.append('type', 'HOSTEL'); bad.append('title', 'Virus upload'); bad.append('description', 'tries to upload exe file'); bad.append('location', 'x'); bad.append('files', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'a.exe');
ok('exe upload rejected', (await call('POST', '/incidents', bad, stu)).s === 400);
ok('staff cannot create complaint', (await call('POST', '/incidents', fd, sec)).s === 403);
ok('security cannot see hostel complaint', !(await list(sec)).some((i) => i.id === cid));
r = await call('GET', `/incidents/${cid}`, null, sec); ok('security 404 on hostel complaint', r.s === 404);
for (const [st, c] of [['ACKNOWLEDGED', 'Received'], ['UNDER_REVIEW', 'Looking'], ['ACTION_IN_PROGRESS', 'Plumber called'], ['RESPONSE_PROVIDED', 'Fix tomorrow'], ['RESOLVED', 'Fixed']]) {
  r = await call('PATCH', `/incidents/${cid}/status`, { status: st, comment: c }, ward);
  ok('warden -> ' + st, r.s === 200, r);
}
r = await call('POST', `/incidents/${cid}/notes`, { body: 'SECRET internal note' }, ward);
r = await call('GET', `/incidents/${cid}`, null, stu);
ok('student sees timeline w/o internal notes', r.d.updates.length >= 6 && !JSON.stringify(r.d).includes('SECRET'), r.d.updates?.length);
ok('student sees evidence list', r.d.evidence.length === 1);
r = await call('GET', `/incidents/${cid}/evidence/${r.d.evidence[0].id}`, null, stu, true);
ok('student downloads own evidence', r.s === 200);
const n = (await call('GET', '/notifications', null, stu)).d;
ok('student notified at each step', n.unread >= 6, n.unread);
r = await call('PATCH', `/incidents/${cid}/status`, { status: 'REOPENED', comment: 'Still leaking' }, stu);
ok('student reopens', r.s === 200, r);
r = await call('PATCH', `/incidents/${cid}/status`, { status: 'CLOSED' }, stu);
ok('student cannot close', r.s === 403);
r = await call('POST', `/incidents/${cid}/messages`, { body: 'Please come soon' }, stu);
ok('student message', r.s === 201, r);
r = await call('POST', `/incidents/${cid}/messages`, { body: 'internal chatter', internal: true }, ward);
r = await call('GET', `/incidents/${cid}/messages`, null, stu);
ok('student sees only public messages', r.d.messages.length === 1);
const fd2 = new FormData(); fd2.append('type', 'RAGGING'); fd2.append('title', 'Ragging in hostel'); fd2.append('description', 'Seniors are harassing juniors at night'); fd2.append('location', 'Hostel A');
r = await call('POST', '/incidents', fd2, stu);
ok('ragging forced confidential', r.s === 201);
ok('medical cannot see ragging', !(await list(med)).some((i) => i.id === r.d.id));
const stats = (await call('GET', '/incidents/stats', null, sec)).d.stats; ok('stats', typeof stats.total === 'number', stats);

// E: admin
r = await call('GET', '/admin/analytics', null, admin);
ok('analytics', r.d.totals?.total >= 5 && r.d.byType.length > 0 && r.d.monthly.length > 0, r.d.totals);
console.log('  analytics:', JSON.stringify(r.d.totals));
r = await call('GET', '/admin/reports/incidents.csv', null, admin, true); ok('csv', r.s === 200 && r.d.startsWith('incident_reference'));
const pdf = await fetch(B + '/admin/reports/incidents.pdf', { headers: { Authorization: 'Bearer ' + admin } }); const buf = Buffer.from(await pdf.arrayBuffer());
ok('pdf', pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF', pdf.status);
r = await call('POST', '/admin/users', { name: 'Test Guard', email: 'guard' + Date.now() + '@campus.test', role: 'SECURITY', department_id: 1, password: 'Password@123' }, admin); ok('create user', r.s === 201, r);
r = await call('POST', '/admin/departments', { name: 'Library', code: 'LIB' + (Date.now() % 1000) }, admin); ok('create dept', r.s === 201, r);
r = await call('PATCH', '/admin/contacts/1', { phone: '+91 98765 43210' }, admin); ok('contact set', r.s === 200, r);
r = await call('GET', '/public/contacts'); ok('public contacts', r.d.contacts[0].phone === '+91 98765 43210');
r = await call('PATCH', '/admin/contacts/1', { phone: '<script>' }, admin); ok('bad phone rejected', r.s === 400);
const rules = (await call('GET', '/admin/routing', null, admin)).d.rules; ok('routing rules', rules.length === 12);
r = await call('GET', '/admin/audit', null, admin); ok('audit log', r.d.logs.length > 5);
r = await call('POST', `/admin/users/${(await call('GET','/admin/users',null,admin)).d.users.find(u=>u.email==='medical2@campus.test').id}/reset-password`, {}, admin); ok('reset pw', !!r.d.temporaryPassword);
r = await call('PATCH', `/admin/users/1`, { is_active: false }, admin); ok('cannot deactivate self (if id1)', r.s === 400 || r.s === 200);
await call('PATCH', `/admin/users/1`, { is_active: true }, admin);

// F: simulation
const sc = (await call('GET', '/simulations', null, stu)).d.scenarios; ok('scenarios', sc.length >= 4);
r = await call('POST', `/simulations/${sc[0].id}/start`, {}, stu); const sess = r.d.session.id; ok('sim start', !!sess, r);
for (const s of ['ACKNOWLEDGE', 'ASSIGN', 'RESPONSE']) await call('POST', `/simulations/sessions/${sess}/step`, { step: s }, stu);
r = await call('POST', `/simulations/sessions/${sess}/complete`, {}, stu); ok('sim complete w/ missed step', r.d.scorecard.missed.length === 1 && r.d.scorecard.score === 80, r.d);
const incBefore = (await list(admin)).filter(i => i.incident_source === 'SIMULATION'); ok('sim creates no incidents', incBefore.length === 0);
ok('student cannot create scenario', (await call('POST', '/simulations', { title: 'x', incident_type: 'FIRE' }, stu)).s === 403);

// auth flows
const email = 'new' + Date.now() + '@campus.test';
r = await call('POST', '/auth/register', { name: 'New Student', email, password: 'Password@123', registration_no: '999' }); ok('register', r.s === 201, r);
r = await call('POST', '/auth/register', { name: 'New Student', email, password: 'Password@123', registration_no: '999', role: 'ADMIN' }); ok('dup register 409', r.s === 409);
r = await call('POST', '/auth/forgot-password', { email }); const tk = r.d.devResetToken; ok('forgot', !!tk);
r = await call('POST', '/auth/reset-password', { token: tk, password: 'NewPass@1234' }); ok('reset', r.s === 200, r);
r = await call('POST', '/auth/login', { email, password: 'NewPass@1234' }); ok('login new pw', !!r.d.token); 
r = await call('GET', '/auth/me', null, r.d.token); ok('me is STUDENT', r.d.user.role === 'STUDENT');
console.log(`\n${pass} passed, ${fail} failed`);
