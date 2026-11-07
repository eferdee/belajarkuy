# BelajarKuy

Platform produktivitas akademik mahasiswa: kelola tugas & tenggat, kalender akademik, perencana belajar, dan catatan. Sekarang dengan **backend sungguhan** (REST API + database + autentikasi), sehingga data tersimpan di server dan bisa diakses dari perangkat mana pun.

## Teknologi
- **Frontend**: HTML, CSS, JavaScript murni (tanpa build step)
- **Backend**: Node.js + Express
- **Database**: SQLite (`better-sqlite3`), file tunggal, tanpa instalasi server database
- **Autentikasi**: JWT + hash kata sandi `bcryptjs`
- **Keamanan dasar**: `helmet`, rate limit pada endpoint masuk/daftar, validasi input, data tiap pengguna terisolasi

## Cara menjalankan
Prasyarat: **Node.js 18+**.

```bash
cd backend
npm install
cp .env.example .env     # lalu isi JWT_SECRET (lihat di bawah)
npm start
```

Buka **http://localhost:3000**. Backend juga menyajikan folder `frontend/`, jadi cukup satu server.

Membuat `JWT_SECRET` acak:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
> Tanpa `.env`, mode development memakai secret sementara (login hilang setiap server restart). Di `NODE_ENV=production`, `JWT_SECRET` wajib diisi.

Mode pengembangan (auto-restart): `npm run dev`. Menjalankan tes: `npm test`.

## Struktur folder
```text
belajarkuy/
├── render.yaml             # konfigurasi deploy Render
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js              # UI + pemanggilan API
│   └── demo-data.json      # data contoh: akun demo + pratinjau landing page
└── backend/
    ├── package.json
    ├── .env.example
    ├── src/
    │   ├── server.js       # titik masuk
    │   ├── app.js          # konfigurasi Express
    │   ├── config.js       # pembacaan environment
    │   ├── db.js           # skema SQLite
    │   ├── demo.js         # akun demo otomatis (membaca frontend/demo-data.json)
    │   ├── validate.js     # validasi input
    │   ├── middleware/auth.js
    │   └── routes/         # auth, crud (generik), resources
    └── test/api.test.js    # tes API (node:test)
```

## Akun demo & pratinjau landing page
Akun demo aktif secara default (`demo@belajarkuy.com` / `demo12345`). Pengunjung bisa mencobanya lewat tombol **Coba akun demo** di landing page atau di modal masuk.

- **Satu sumber data**: `frontend/demo-data.json` mengisi akun demo (backend) sekaligus pratinjau di landing page, jadi angka dan isinya selalu sama. Tanggal ditulis relatif (`day: 0` = hari ini).
- **Selalu segar**: data demo diisi ulang otomatis sekali per hari (saat server start dan saat login demo), sehingga jadwal "hari ini" tidak pernah kosong.
- **Landing = dashboard asli**: pratinjau di hero adalah halaman Ringkasan yang sebenarnya (`index.html?preview=1`, dimuat di iframe), dan kartu fitur memakai fungsi tampilan yang sama dengan dashboard. Mengubah dashboard otomatis mengubah landing.
- Untuk mengganti isi demo, edit `frontend/demo-data.json`. Untuk mematikan akun demo (mis. dipakai pengguna sungguhan), isi `DEMO_MODE=false`.

## Dokumentasi API
Semua endpoint di bawah `/api`. Selain `/auth/*` dan `/health`, wajib header `Authorization: Bearer <token>`.

| Metode | Endpoint | Keterangan |
|---|---|---|
| POST | `/auth/register` | `{name, email, password}` → `{token, user}` (kata sandi min. 8 karakter) |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | Data pengguna yang sedang login |
| GET/POST | `/tasks` | Daftar / buat tugas |
| GET/PATCH/DELETE | `/tasks/:id` | Detail / ubah sebagian / hapus |
| GET/POST | `/notes` · `/notes/:id` | Catatan (pola sama seperti tugas) |
| GET/POST | `/sessions` · `/sessions/:id` | Sesi belajar (pola sama) |
| GET | `/health` | Cek status server |

**Bentuk data**
- Tugas: `title`, `category`, `due_date` (`YYYY-MM-DD`, opsional), `priority` (`low|medium|high`), `status` (`todo|in_progress|completed`), `notes`
- Catatan: `title`, `category`, `body`
- Sesi belajar: `title`, `category`, `date`, `start_time`, `end_time` (`HH:MM`, jam selesai harus setelah jam mulai)

Error validasi berformat `400 {"error": "...", "errors": {"field": "pesan"}}`.

## Konfigurasi (`backend/.env`)
| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `JWT_SECRET` | — | Kunci penandatangan token (wajib di production) |
| `JWT_EXPIRES_IN` | `7d` | Masa berlaku token |
| `DB_PATH` | `./data/belajarkuy.db` | Lokasi file database |
| `CORS_ORIGIN` | kosong | Domain frontend bila dihosting terpisah (pisahkan dengan koma) |
| `DEMO_MODE` | `true` | Akun demo otomatis + tombol **Coba akun demo**. Isi `false` untuk mematikan |
| `DEMO_TIMEZONE` | `Asia/Jakarta` | Zona waktu untuk menentukan "hari ini" pada data demo |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | `demo@belajarkuy.com` / `demo12345` | Kredensial akun demo (publik) |
| `TRUST_PROXY` | `1` di production | Jumlah proxy di depan server (untuk rate limit yang benar) |

Jika frontend dihosting terpisah dari backend, tambahkan sebelum `app.js` di `index.html`:
```html
<script>window.BELAJARKUY_API_URL = "https://api.contoh.com/api";</script>
```

## Deploy ke Render (gratis, cocok untuk portofolio)
1. Push repo ke GitHub (pastikan `.env` tidak ikut).
2. Di Render: **New → Blueprint**, pilih repo ini. Render membaca `render.yaml`, membuat web service **Free**, dan membuat `JWT_SECRET` acak otomatis.
3. Setelah selesai, buka URL `*.onrender.com`. Di halaman login ada tombol **Coba akun demo**.

Perlu diketahui pada tier Free:
- Service tidur setelah 15 menit tanpa trafik; kunjungan berikutnya butuh sekitar 1 menit untuk bangun.
- Disk bersifat sementara: database SQLite **terhapus** saat redeploy/restart/tidur. Karena itu `DEMO_MODE=true` membuat akun demo (dengan data contoh) otomatis setiap server start. Akun yang didaftarkan pengunjung ikut hilang. Cantumkan "data demo bisa direset" di README portofoliomu.
- Akun demo bersifat publik dan datanya diisi ulang tiap hari, jadi edit pengunjung pada akun demo tidak permanen.
- Akun demo dipakai bersama; kredensialnya (`demo@belajarkuy.com` / `demo12345`) bersifat publik. Jangan simpan data pribadi.
- Untuk data yang awet, ganti SQLite dengan Postgres atau pakai compute plan berbayar dengan persistent disk.
- Jangan tambahkan kartu pembayaran bila ingin memastikan tetap $0.

## Yang berubah dari prototype
- Seluruh antarmuka diterjemahkan ke Bahasa Indonesia.
- Data tidak lagi di `localStorage`; kini di database SQLite per pengguna.
- Login/daftar sungguhan (sebelumnya hanya pintu masuk ke dashboard).
- Tugas, catatan, dan sesi belajar bisa **dihapus** (dengan konfirmasi); sesi belajar kini punya **input jam mulai & selesai** dan bisa diubah.
- Agenda kalender default menampilkan agenda mendatang.

## Catatan untuk production
- Pasang di balik HTTPS dan isi `JWT_SECRET` yang kuat.
- Token JWT disimpan di `localStorage` (sederhana, tetapi rentan jika ada celah XSS). Konten pengguna sudah di-escape di frontend; untuk keamanan lebih, pertimbangkan cookie `HttpOnly`.
- Cadangkan file database secara berkala (`backend/data/`).
- Belum ada fitur lupa kata sandi / verifikasi email.
