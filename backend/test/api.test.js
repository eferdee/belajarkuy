const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { ensureDemoAccount } = require('../src/demo');
const demoData = require('../../frontend/demo-data.json');

const demo = { enabled: true, email: 'demo@belajarkuy.com', password: 'demo12345' };
let server, base;
before(async () => {
  const db = openDb(':memory:');
  ensureDemoAccount(db, demo);
  assert.equal(ensureDemoAccount(db, demo), false); // idempoten
  server = createApp(db, { authLimit: 1000, demo }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const register = (name, email) => api('/api/auth/register', { method: 'POST', body: { name, email, password: 'rahasia123' } });

test('registrasi, login, dan /me', async () => {
  const r = await register('Farid', 'Farid@Example.com');
  assert.equal(r.status, 201);
  assert.equal(r.data.user.email, 'farid@example.com');

  assert.equal((await register('Lain', 'farid@example.com')).status, 409);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'farid@example.com', password: 'salah-banget' } })).status, 401);

  const l = await api('/api/auth/login', { method: 'POST', body: { email: 'farid@example.com', password: 'rahasia123' } });
  assert.equal(l.status, 200);
  const me = await api('/api/auth/me', { token: l.data.token });
  assert.equal(me.data.user.name, 'Farid');
});

test('validasi registrasi', async () => {
  const r = await api('/api/auth/register', { method: 'POST', body: { name: 'A', email: 'bukan-email', password: '123' } });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.data.errors).sort(), ['email', 'name', 'password']);
});

test('endpoint data wajib login', async () => {
  assert.equal((await api('/api/tasks')).status, 401);
  assert.equal((await api('/api/tasks', { token: 'palsu' })).status, 401);
});

test('CRUD tugas + data seed', async () => {
  const { data: { token } } = await register('Budi', 'budi@example.com');
  const seeded = await api('/api/tasks', { token });
  assert.equal(seeded.data.length, 2);

  const c = await api('/api/tasks', { method: 'POST', token, body: { title: 'Laporan', due_date: '2026-12-01', priority: 'high' } });
  assert.equal(c.status, 201);
  assert.equal(c.data.status, 'todo');
  assert.equal(c.data.category, 'Umum');

  const p = await api(`/api/tasks/${c.data.id}`, { method: 'PATCH', token, body: { status: 'completed' } });
  assert.equal(p.data.status, 'completed');
  assert.equal(p.data.title, 'Laporan');

  assert.equal((await api('/api/tasks', { method: 'POST', token, body: { title: 'x', priority: 'urgent' } })).status, 400);
  assert.equal((await api('/api/tasks', { method: 'POST', token, body: { title: 'x', due_date: '2026-02-31' } })).status, 400);

  assert.equal((await api(`/api/tasks/${c.data.id}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await api(`/api/tasks/${c.data.id}`, { token })).status, 404);
});

test('data antar pengguna terisolasi', async () => {
  const a = (await register('Andi', 'andi@example.com')).data.token;
  const b = (await register('Beni', 'beni@example.com')).data.token;
  const t = await api('/api/tasks', { method: 'POST', token: a, body: { title: 'Rahasia Andi' } });
  assert.equal((await api(`/api/tasks/${t.data.id}`, { token: b })).status, 404);
  assert.equal((await api(`/api/tasks/${t.data.id}`, { method: 'PATCH', token: b, body: { title: 'x' } })).status, 404);
  assert.equal((await api(`/api/tasks/${t.data.id}`, { method: 'DELETE', token: b })).status, 404);
  assert.equal((await api(`/api/tasks/${t.data.id}`, { token: a })).status, 200);
});

test('catatan dan sesi belajar', async () => {
  const { data: { token } } = await register('Citra', 'citra@example.com');
  const n = await api('/api/notes', { method: 'POST', token, body: { title: 'Normalisasi', body: '1NF 2NF 3NF', category: 'Basis Data' } });
  assert.equal(n.status, 201);
  const nu = await api(`/api/notes/${n.data.id}`, { method: 'PATCH', token, body: { body: 'BCNF' } });
  assert.equal(nu.data.body, 'BCNF');

  const ok = await api('/api/sessions', { method: 'POST', token, body: { title: 'Belajar SQL', date: '2026-11-10', start_time: '09:00', end_time: '10:30' } });
  assert.equal(ok.status, 201);
  const bad = await api('/api/sessions', { method: 'POST', token, body: { title: 'x', date: '2026-11-10', start_time: '10:00', end_time: '09:00' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.errors.end_time);
  const badPatch = await api(`/api/sessions/${ok.data.id}`, { method: 'PATCH', token, body: { end_time: '08:00' } });
  assert.equal(badPatch.status, 400);
});

test('JSON rusak dan endpoint tak dikenal', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak' });
  assert.equal(res.status, 400);
  assert.equal((await api('/api/nope')).status, 404);
});

test('akun demo: config publik, login, dan data contoh', async () => {
  const cfg = await api('/api/config');
  assert.deepEqual(cfg.data.demo, { email: demo.email, password: demo.password });
  const l = await api('/api/auth/login', { method: 'POST', body: { email: demo.email, password: demo.password } });
  assert.equal(l.status, 200);
  const tasks = await api('/api/tasks', { token: l.data.token });
  assert.equal(tasks.data.length, demoData.tasks.length);
  assert.equal((await api('/api/sessions', { token: l.data.token })).data.length, demoData.sessions.length);
  assert.equal((await api('/api/notes', { token: l.data.token })).data.length, demoData.notes.length);
  assert.equal(l.data.user.name, demoData.user.name);
});

test('akun demo: sesi hari ini ada, dan data diisi ulang bersih', async () => {
  const { data: { token } } = await api('/api/auth/login', { method: 'POST', body: { email: demo.email, password: demo.password } });
  const sessions = await api('/api/sessions', { token });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const expected = demoData.sessions.filter((s) => s.day === 0).length;
  assert.equal(sessions.data.filter((s) => s.date === today).length, expected);

  // Login berulang pada hari yang sama tidak menggandakan data.
  await api('/api/auth/login', { method: 'POST', body: { email: demo.email, password: demo.password } });
  assert.equal((await api('/api/tasks', { token })).data.length, demoData.tasks.length);
});

test('akun demo nonaktif: tidak ada konfigurasi publik dan tidak dibuat', async () => {
  const db = openDb(':memory:');
  const off = { enabled: false, email: demo.email, password: demo.password };
  assert.equal(ensureDemoAccount(db, off), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  db.close();
});
