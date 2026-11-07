const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { authRouter } = require('./routes/auth');
const { tasksRouter, notesRouter, sessionsRouter } = require('./routes/resources');

function createApp(db, { authLimit = 30, demo = config.demo } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  // CSP dinonaktifkan karena frontend memakai style inline & Google Fonts.
  app.use(helmet({ contentSecurityPolicy: false }));
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Konfigurasi publik untuk frontend (akun demo bersifat publik secara sengaja).
  app.get('/api/config', (req, res) =>
    res.json({ demo: demo.enabled ? { email: demo.email, password: demo.password } : null })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
  });
  app.use('/api/auth', authLimiter, authRouter(db, demo));

  app.use('/api/tasks', requireAuth, tasksRouter(db));
  app.use('/api/notes', requireAuth, notesRouter(db));
  app.use('/api/sessions', requireAuth, sessionsRouter(db));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

  // Frontend statis (satu server untuk semuanya).
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status === 400 && err.errors) return res.status(400).json({ error: err.message, errors: err.errors });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format JSON tidak valid.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Data terlalu besar.' });
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  });

  return app;
}

module.exports = { createApp };
