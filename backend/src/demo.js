const bcrypt = require('bcryptjs');

const DEFAULT_TZ = 'Asia/Jakarta';
// Hari (per koneksi database) saat data demo terakhir diisi ulang.
const seededDay = new WeakMap();

/** Tanggal hari ini (YYYY-MM-DD) pada zona waktu tertentu, bukan zona waktu server. */
function todayIn(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(isoDay, n) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Dibaca saat dibutuhkan agar server tetap bisa jalan bila DEMO_MODE=false.
const loadData = () => require('../../frontend/demo-data.json');

/**
 * Menjamin akun demo ada dan datanya segar. Dipanggil saat server start dan setiap
 * login akun demo; pengisian ulang hanya terjadi sekali per hari, jadi tanggal
 * tugas/sesi selalu relatif terhadap hari ini dan sama dengan pratinjau di landing page.
 * Mengembalikan true hanya bila akunnya baru dibuat.
 */
function ensureDemoAccount(db, demo) {
  if (!demo.enabled) return false;
  const today = todayIn(demo.timezone || DEFAULT_TZ);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(demo.email);
  if (existing && seededDay.get(db) === today) return false;

  const data = loadData();
  const day = (n) => addDays(today, n);
  let created = false;

  db.transaction(() => {
    let uid;
    if (existing) {
      uid = existing.id;
      db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?')
        .run(data.user.name, bcrypt.hashSync(demo.password, 10), uid);
      for (const table of ['tasks', 'notes', 'sessions']) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(uid);
    } else {
      uid = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(data.user.name, demo.email, bcrypt.hashSync(demo.password, 10)).lastInsertRowid;
      created = true;
    }

    const task = db.prepare('INSERT INTO tasks (user_id, title, category, due_date, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.tasks) task.run(uid, t.title, t.category, day(t.day), t.priority, t.status, t.notes || '');

    const note = db.prepare("INSERT INTO notes (user_id, title, category, body, updated_at) VALUES (?, ?, ?, ?, datetime('now', ?))");
    for (const n of data.notes) note.run(uid, n.title, n.category, n.body, `-${n.daysAgo || 0} days`);

    const sess = db.prepare('INSERT INTO sessions (user_id, title, category, date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of data.sessions) sess.run(uid, s.title, s.category, day(s.day), s.start, s.end);
  })();

  seededDay.set(db, today);
  return created;
}

module.exports = { ensureDemoAccount };
