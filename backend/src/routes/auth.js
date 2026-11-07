const express = require('express');
const bcrypt = require('bcryptjs');
const { validate } = require('../validate');
const { signToken, requireAuth } = require('../middleware/auth');
const { ensureDemoAccount } = require('../demo');

const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);
const dayOffset = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function authRouter(db, demo) {
  const router = express.Router();
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

  // Data awal agar dashboard tidak kosong saat pertama kali masuk.
  const seed = db.transaction((userId) => {
    const task = db.prepare(
      'INSERT INTO tasks (user_id, title, category, due_date, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    task.run(userId, 'Kenali BelajarKuy: tambahkan tugas pertamamu', 'Umum', dayOffset(1), 'medium', 'todo', 'Klik "Tambah tugas" untuk mulai.');
    task.run(userId, 'Susun jadwal belajar minggu ini', 'Umum', dayOffset(2), 'low', 'todo', '');
    db.prepare('INSERT INTO notes (user_id, title, category, body) VALUES (?, ?, ?, ?)')
      .run(userId, 'Selamat datang!', 'Umum', 'Catat ide dan rangkuman materi kuliahmu di sini.');
  });

  router.post('/register', (req, res) => {
    const d = validate(req.body, {
      name: { required: true, min: 2, max: 60 },
      email: { type: 'email', required: true, max: 120 },
      password: { required: true, min: 8, max: 72 },
    });
    const email = d.email.toLowerCase();
    if (byEmail.get(email)) {
      return res.status(409).json({ error: 'Email sudah terdaftar.', errors: { email: 'Email sudah terdaftar' } });
    }
    const hash = bcrypt.hashSync(d.password, 10);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(d.name, email, hash);
    seed(lastInsertRowid);
    const user = byId.get(lastInsertRowid);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  router.post('/login', (req, res) => {
    const d = validate(req.body, {
      email: { type: 'email', required: true, max: 120 },
      password: { required: true, max: 72 },
    });
    const email = d.email.toLowerCase();
    // Akun demo: pastikan datanya segar (tanggal relatif hari ini) sebelum dipakai.
    if (demo && email === demo.email) ensureDemoAccount(db, demo);
    const user = byEmail.get(email);
    // Tetap jalankan compare agar waktu respons tidak membocorkan keberadaan email.
    const ok = bcrypt.compareSync(d.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Email atau kata sandi salah.' });
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  router.get('/me', requireAuth, (req, res) => {
    const user = byId.get(req.userId);
    if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    res.json({ user: publicUser(user) });
  });

  return router;
}

module.exports = { authRouter };
