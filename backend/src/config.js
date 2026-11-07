require('dotenv').config();
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.startsWith('ganti-dengan')) {
  if (isProd) {
    console.error('JWT_SECRET wajib diisi di mode production.');
    process.exit(1);
  }
  // Mode development: secret acak per proses (token lama tidak berlaku setelah restart).
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[peringatan] JWT_SECRET belum diatur; memakai secret sementara. Atur di file .env.');
}

const demo = {
  // Aktif secara default supaya akun demo selalu tersedia. Isi DEMO_MODE=false untuk mematikannya.
  enabled: process.env.DEMO_MODE !== 'false',
  // Zona waktu untuk menentukan "hari ini" pada data contoh demo.
  timezone: process.env.DEMO_TIMEZONE || 'Asia/Jakarta',
  email: (process.env.DEMO_EMAIL || 'demo@belajarkuy.com').toLowerCase(),
  // Sengaja publik: ditampilkan di halaman login agar pengunjung bisa mencoba.
  password: process.env.DEMO_PASSWORD || 'demo12345',
};

module.exports = {
  isProd,
  demo,
  // Di balik proxy (Render, dll.) agar IP klien & rate limit benar.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : isProd ? 1 : 0,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: process.env.DB_PATH || './data/belajarkuy.db',
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
};
