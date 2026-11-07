/* BelajarKuy — frontend (terhubung ke REST API) */
const API_URL = window.BELAJARKUY_API_URL || "/api";
const TOKEN_KEY = "bk_token";
// ?preview = dashboard asli yang dipakai sebagai pratinjau di landing page (iframe), tanpa login.
const PREVIEW = new URLSearchParams(location.search).has("preview");

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHTML = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Tanggal & label ---------- */
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const parseDay = (s) => new Date(s + "T00:00:00");
const fmt = (d) => (d ? parseDay(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "Tanpa tanggal");
const hhmm = (t) => t.slice(0, 5);

function relativeDate(sqlUtc) {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  const diff = Math.round((parseDay(iso(new Date())) - parseDay(iso(d))) / 86400000);
  if (diff <= 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
}

const STATUS = { todo: "Belum mulai", in_progress: "Sedang dikerjakan", completed: "Selesai" };
const PRIORITY = { low: "Rendah", medium: "Sedang", high: "Tinggi" };
const PRIORITY_CLASS = { low: "Low", medium: "Medium", high: "High" }; // nama kelas CSS
const FIELD_LABEL = { name: "Nama", email: "Email", password: "Kata sandi", title: "Judul", category: "Kategori", due_date: "Tenggat", date: "Tanggal", start_time: "Jam mulai", end_time: "Jam selesai", notes: "Catatan", body: "Isi catatan", priority: "Prioritas", status: "Status" };
const PAGE_TITLE = { overview: "Ringkasan", tasks: "Tugas & Tenggat", calendar: "Kalender Akademik", planner: "Perencana Belajar", notes: "Catatanku", progress: "Progres" };

/* ---------- State ---------- */
let token = localStorage.getItem(TOKEN_KEY);
let user = null;
let S = { tasks: [], notes: [], sessions: [] };
let currentPage = "overview";
let modalMode = "task";
let authMode = "login";
let demoCfg = null; // diisi dari /api/config bila mode demo aktif

/* ---------- API ---------- */
async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { ...(body && { "Content-Type": "application/json" }), ...(token && { Authorization: "Bearer " + token }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error("Tidak dapat terhubung ke server. Pastikan backend sudah berjalan.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const isAuthForm = path === "/auth/login" || path === "/auth/register";
    if (res.status === 401 && !isAuthForm) forceLogout("Sesi berakhir. Silakan masuk kembali.");
    const err = new Error(data.error || "Terjadi kesalahan. Coba lagi.");
    err.errors = data.errors;
    throw err;
  }
  return data;
}

const errorText = (e) => (e.errors ? Object.entries(e.errors).map(([k, v]) => `${FIELD_LABEL[k] || k}: ${v}`).join(" · ") : e.message);

async function loadAll() {
  const [tasks, notes, sessions] = await Promise.all([api("/tasks"), api("/notes"), api("/sessions")]);
  S = { tasks, notes, sessions };
}

/* ---------- UI umum ---------- */
let toastTimer;
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
const hideError = (el) => el.classList.add("hidden");

function setUserUI() {
  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();
  $("#userName").textContent = user?.name || "—";
  $("#userAvatar").textContent = initial;
  $("#topAvatar").textContent = initial;
}

/* ---------- Autentikasi ---------- */
function openAuth(mode) {
  authMode = mode;
  const reg = mode === "register";
  $("#authEyebrow").textContent = reg ? "MULAI PERJALANANMU" : "SELAMAT DATANG KEMBALI";
  $("#authTitle").textContent = reg ? "Buat akun BelajarKuy" : "Masuk ke BelajarKuy";
  $("#authNameWrap").style.display = reg ? "block" : "none";
  $("#authPassword").autocomplete = reg ? "new-password" : "current-password";
  $("#authSubmit").textContent = reg ? "Daftar" : "Masuk";
  $("#authSwitch").innerHTML = reg
    ? 'Sudah punya akun? <button type="button" id="switchAuth">Masuk</button>'
    : 'Belum punya akun? <button type="button" id="switchAuth">Daftar gratis</button>';
  $("#switchAuth").onclick = () => openAuth(reg ? "login" : "register");
  hideError($("#authError"));
  $("#demoBox").classList.toggle("hidden", !demoCfg);
  $("#authBackdrop").classList.remove("hidden");
  setTimeout(() => (reg ? $("#authName") : $("#authEmail")).focus(), 30);
}
const closeAuth = () => $("#authBackdrop").classList.add("hidden");

async function authenticate(mode, body, btn) {
  hideError($("#authError"));
  btn.disabled = true;
  try {
    const data = await api("/auth/" + mode, { method: "POST", body });
    token = data.token;
    user = data.user;
    localStorage.setItem(TOKEN_KEY, token);
    $("#authForm").reset();
    closeAuth();
    await enterApp();
    showToast(mode === "register" ? `Akun dibuat. Selamat datang, ${user.name}!` : `Halo lagi, ${user.name}!`);
  } catch (err) {
    if ($("#authBackdrop").classList.contains("hidden")) showToast(errorText(err));
    else showError($("#authError"), errorText(err));
  } finally {
    btn.disabled = false;
  }
}

$("#authForm").onsubmit = (e) => {
  e.preventDefault();
  const body = { email: $("#authEmail").value.trim(), password: $("#authPassword").value };
  if (authMode === "register") body.name = $("#authName").value.trim();
  authenticate(authMode, body, $("#authSubmit"));
};
$("#demoLogin").onclick = () => demoCfg && authenticate("login", { email: demoCfg.email, password: demoCfg.password }, $("#demoLogin"));
$("#closeAuth").onclick = closeAuth;
$("#authBackdrop").onclick = (e) => { if (e.target.id === "authBackdrop") closeAuth(); };

function forceLogout(message) {
  token = null; user = null; S = { tasks: [], notes: [], sessions: [] };
  localStorage.removeItem(TOKEN_KEY);
  goLanding();
  if (message) showToast(message);
}

/* ---------- Navigasi ---------- */
async function enterApp(page = "overview") {
  $("#landing").classList.add("hidden");
  $("#app").classList.remove("hidden");
  setUserUI();
  $("#todayLabel").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  $("#pageContent").innerHTML = `<div class="empty-state">Memuat data…</div>`;
  try {
    await loadAll();
  } catch (err) {
    if (token) showToast(err.message);
  }
  if (token) navigate(page);
}
function goLanding() { $("#app").classList.add("hidden"); $("#landing").classList.remove("hidden"); syncDemoButtons(); window.scrollTo(0, 0); }

// Tombol di beranda: langsung masuk bila sudah login, selain itu buka form.
const startFlow = (mode) => () => (user ? enterApp() : openAuth(mode));
$("#navLogin").addEventListener("click", startFlow("login"));
["navStart", "heroStart", "ctaStart"].forEach((id) => $("#" + id).addEventListener("click", startFlow("register")));
$("#backLanding").addEventListener("click", goLanding);
$("#logoutBtn").addEventListener("click", () => { if (confirm("Keluar dari BelajarKuy?")) forceLogout("Kamu sudah keluar."); });
$("#mobileMenu").addEventListener("click", () => $(".nav-links").classList.toggle("open"));
$("#appMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

function navigate(page) {
  currentPage = page;
  $$(".side-link[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("#currentPage").textContent = PAGE_TITLE[page];
  $("#sidebar").classList.remove("open");
  renderPage();
}
$$(".side-link[data-page]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.page)));

/* ---------- Komponen tampilan ---------- */
function pageHeader(title, desc, action = "") {
  return `<div class="page-title-row"><div><div class="welcome-line">RUANG AKADEMIKMU</div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
}

function taskRow(t) {
  const done = t.status === "completed";
  return `<div class="task-row"><button class="task-check ${done ? "done" : ""}" data-check="${t.id}" aria-label="Tandai selesai">${done ? "✓" : ""}</button><div class="task-info"><b style="${done ? "text-decoration:line-through;color:#aaa" : ""}">${escapeHTML(t.title)}</b><small>${escapeHTML(t.category)} · ${STATUS[t.status]}</small></div><span class="priority ${PRIORITY_CLASS[t.priority]}">${PRIORITY[t.priority]}</span><span class="task-date">${fmt(t.due_date)}</span><button class="icon-btn" data-edit="${t.id}" title="Ubah">···</button></div>`;
}

function bindTaskActions() {
  $$("[data-check]").forEach((b) => (b.onclick = async () => {
    const t = S.tasks.find((x) => x.id == b.dataset.check);
    try {
      await api(`/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "completed" ? "todo" : "completed" } });
      S.tasks = await api("/tasks");
      renderPage();
    } catch (err) { showToast(errorText(err)); }
  }));
  $$("[data-edit]").forEach((b) => (b.onclick = () => openModal("task", S.tasks.find((x) => x.id == b.dataset.edit))));
}

const emptyDot = (msg) => `<div class="empty-state">${msg}</div>`;
const ring = (percent) => `<div class="progress-ring" style="background:conic-gradient(var(--primary) 0 ${percent}%,#efeff5 ${percent}%)"><strong>${percent}%</strong></div>`;
const stats = () => {
  const done = S.tasks.filter((t) => t.status === "completed").length;
  return { done, percent: S.tasks.length ? Math.round((done / S.tasks.length) * 100) : 0, inProgress: S.tasks.filter((t) => t.status === "in_progress").length };
};
const completionPanel = (done, total, percent) => `<section class="panel"><div class="panel-head"><div><h3>Penyelesaian tugas</h3><p>Progres keseluruhanmu</p></div></div><div class="progress-summary">${ring(percent)}<div><b>${done} dari ${total} tugas selesai</b><p>Tetap konsisten. Langkah kecil akan terkumpul.</p></div></div></section>`;

function statusPanel(tasks) {
  const colors = ["#e6a779", "#8f83df", "#58a88a"];
  const counts = Object.keys(STATUS).map((st) => tasks.filter((t) => t.status === st).length);
  return `<section class="panel"><div class="panel-head"><div><h3>Rincian status tugas</h3><p>Posisi tugasmu saat ini</p></div></div>${Object.values(STATUS).map((label, i) => `<div style="margin:19px 0"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:8px"><b>${label}</b><span style="color:#999">${counts[i]} tugas</span></div><div style="height:8px;background:var(--surface-2);border-radius:9px;overflow:hidden"><div style="height:100%;width:${tasks.length ? (counts[i] / tasks.length) * 100 : 0}%;background:${colors[i]};border-radius:9px"></div></div></div>`).join("")}</section>`;
}

const pad = (n) => String(n).padStart(2, "0");

/* ---------- Halaman ---------- */
function renderOverview() {
  const { done, percent, inProgress } = stats();
  const upcoming = S.tasks.filter((t) => t.status !== "completed").slice(0, 4);
  const todaySessions = S.sessions.filter((p) => p.date === iso(new Date()));
  const deadlines = S.tasks.filter((t) => t.due_date && t.status !== "completed").slice(0, 3);
  const firstName = (user?.name || "").split(" ")[0];

  $("#pageContent").innerHTML = pageHeader(`${greeting()}, ${escapeHTML(firstName)}! ✦`, "Ini ringkasan aktivitas akademikmu hari ini.", `<button class="btn btn-primary" id="quickAdd">＋ Tambah tugas</button>`) + `
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-head">Total tugas <span class="stat-icon">☷</span></div><div class="stat-value">${pad(S.tasks.length)}</div><div class="stat-foot">Semua tugas akademikmu</div></div>
    <div class="stat-card"><div class="stat-head">Sedang dikerjakan <span class="stat-icon">◷</span></div><div class="stat-value">${pad(inProgress)}</div><div class="stat-foot">Jaga semangatnya</div></div>
    <div class="stat-card"><div class="stat-head">Selesai <span class="stat-icon">✓</span></div><div class="stat-value">${pad(done)}</div><div class="stat-foot"><span class="positive">${percent}%</span> tingkat penyelesaian</div></div>
    <div class="stat-card"><div class="stat-head">Sesi belajar <span class="stat-icon">⌁</span></div><div class="stat-value">${pad(S.sessions.length)}</div><div class="stat-foot">Sesi terjadwal</div></div>
  </div>
  <div class="dashboard-grid">
    <div>
      <section class="panel"><div class="panel-head"><div><h3>Tugas mendatang</h3><p>Hal berikutnya yang perlu kamu fokuskan</p></div><button class="subtle-btn" id="seeTasks">Lihat semua →</button></div>${upcoming.length ? upcoming.map(taskRow).join("") : emptyDot("Belum ada tugas. Tambahkan tugas pertamamu!")}</section>
      <section class="panel"><div class="panel-head"><div><h3>Rencana belajar hari ini</h3><p>Sedikit demi sedikit, lama-lama menjadi bukit</p></div><button class="subtle-btn" id="seePlanner">Buka perencana →</button></div>${todaySessions.length ? todaySessions.map((p) => `<div class="schedule-item"><span class="schedule-time">${hhmm(p.start_time)}</span><i class="schedule-bar"></i><div class="schedule-info"><b>${escapeHTML(p.title)}</b><small>${escapeHTML(p.category)} · ${hhmm(p.start_time)} – ${hhmm(p.end_time)}</small></div></div>`).join("") : emptyDot("Belum ada sesi belajar untuk hari ini.")}</section>
    </div>
    <div>
      ${completionPanel(done, S.tasks.length, percent)}
      <section class="panel"><div class="panel-head"><div><h3>Kalender singkat</h3><p>Tenggat terdekat</p></div><button class="subtle-btn" id="seeCalendar">Buka →</button></div>${deadlines.map((t) => `<div class="schedule-item"><span class="schedule-time">${fmt(t.due_date)}</span><i class="schedule-bar"></i><div class="schedule-info"><b>${escapeHTML(t.title)}</b><small>Prioritas ${PRIORITY[t.priority].toLowerCase()}</small></div></div>`).join("") || emptyDot("Tidak ada tenggat dalam waktu dekat.")}</section>
    </div>
  </div>`;
  $("#quickAdd").onclick = () => openModal("task");
  $("#seeTasks").onclick = () => navigate("tasks");
  $("#seePlanner").onclick = () => navigate("planner");
  $("#seeCalendar").onclick = () => navigate("calendar");
  bindTaskActions();
}

function renderTasks() {
  $("#pageContent").innerHTML = pageHeader("Tugas & Tenggat", "Jaga setiap tugas tetap jelas, berprioritas, dan tepat waktu.", `<button class="btn btn-primary" id="addTask">＋ Tambah tugas</button>`) + `
  <div class="toolbar"><input class="search-input" id="taskSearch" placeholder="⌕  Cari tugas..."><select class="filter-select" id="statusFilter"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><select class="filter-select" id="priorityFilter"><option value="">Semua prioritas</option>${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
  <div class="task-list-panel" id="taskList"></div>`;
  $("#addTask").onclick = () => openModal("task");
  const draw = () => {
    const q = $("#taskSearch").value.toLowerCase(), st = $("#statusFilter").value, pr = $("#priorityFilter").value;
    const list = S.tasks.filter((t) => (t.title + " " + t.category).toLowerCase().includes(q) && (!st || t.status === st) && (!pr || t.priority === pr));
    $("#taskList").innerHTML = list.length ? list.map(taskRow).join("") : emptyDot(S.tasks.length ? "Tidak ada tugas yang cocok dengan pencarianmu." : "Belum ada tugas. Klik “Tambah tugas” untuk mulai.");
    bindTaskActions();
  };
  ["taskSearch", "statusFilter", "priorityFilter"].forEach((id) => $("#" + id).addEventListener("input", draw));
  draw();
}

function calendarPanel(now, tasks, sessions) {
  const year = now.getFullYear(), month = now.getMonth();
  const start = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: start }, () => `<div class="calendar-day muted-day"></div>`);
  for (let d = 1; d <= days; d++) {
    const date = iso(new Date(year, month, d));
    const has = tasks.some((t) => t.due_date === date) || sessions.some((p) => p.date === date);
    cells.push(`<div class="calendar-day ${d === now.getDate() ? "today" : ""} ${has ? "has-event" : ""}" data-date="${date}">${d}</div>`);
  }
  return `<section class="panel"><div class="panel-head"><div><h3>${now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</h3><p>Klik tanggal untuk melihat agendanya</p></div><span class="note-tag">● Tenggat / agenda</span></div><div class="calendar-grid">${["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"].map((x) => `<span>${x}</span>`).join("")}${cells.join("")}</div></section>`;
}

function renderCalendar() {
  const now = new Date();
  $("#pageContent").innerHTML = pageHeader("Kalender Akademik", "Gambaran jelas tentang tenggat dan aktivitas belajarmu.") + `
  <div class="calendar-layout">${calendarPanel(now, S.tasks, S.sessions)}
  <section class="panel"><div class="panel-head"><div><h3 id="agendaTitle">Agenda mendatang</h3><p>Tugas dan sesi belajar</p></div></div><div id="agendaList"></div></section></div>`;

  const today = iso(now);
  const show = (date) => {
    const items = date
      ? [...S.tasks.filter((t) => t.due_date === date).map((t) => ({ title: t.title, meta: `Tugas · ${STATUS[t.status]}` })),
         ...S.sessions.filter((p) => p.date === date).map((p) => ({ title: p.title, meta: `Belajar · ${hhmm(p.start_time)} – ${hhmm(p.end_time)}` }))]
      : [...S.tasks.filter((t) => t.due_date >= today && t.status !== "completed").map((t) => ({ at: t.due_date, title: t.title, meta: `Tugas · ${fmt(t.due_date)}` })),
         ...S.sessions.filter((p) => p.date >= today).map((p) => ({ at: p.date + p.start_time, title: p.title, meta: `Belajar · ${fmt(p.date)}, ${hhmm(p.start_time)}` }))]
          .sort((a, b) => a.at.localeCompare(b.at)).slice(0, 6);
    $("#agendaTitle").textContent = date ? fmt(date) : "Agenda mendatang";
    $("#agendaList").innerHTML = items.length ? items.map((i) => `<div class="schedule-item"><i class="schedule-bar"></i><div class="schedule-info"><b>${escapeHTML(i.title)}</b><small>${escapeHTML(i.meta)}</small></div></div>`).join("") : emptyDot("Belum ada agenda pada tanggal ini.");
  };
  $$("[data-date]").forEach((el) => (el.onclick = () => { $$(".calendar-day").forEach((x) => x.classList.remove("selected")); el.classList.add("selected"); show(el.dataset.date); }));
  show("");
}

const plannerItem = (p) => `<div class="planner-item"><div class="planner-date">${parseDay(p.date).toLocaleDateString("id-ID", { month: "short" }).toUpperCase()}<b>${parseDay(p.date).getDate()}</b></div><div class="planner-info" data-edit-session="${p.id}" title="Klik untuk mengubah"><b>${escapeHTML(p.title)}</b><small>${escapeHTML(p.category)} · ${hhmm(p.start_time)} – ${hhmm(p.end_time)}</small></div><button data-delete-session="${p.id}" title="Hapus sesi" aria-label="Hapus sesi">×</button></div>`;

function renderPlanner() {
  $("#pageContent").innerHTML = pageHeader("Perencana Belajar", "Sediakan waktu untuk belajar fokus, satu sesi demi satu sesi.", `<button class="btn btn-primary" id="addSession">＋ Tambah sesi</button>`) + `
  <div class="planner-list">${S.sessions.map(plannerItem).join("") || emptyDot("Belum ada sesi belajar. Klik “Tambah sesi” untuk mulai.")}</div>`;
  $("#addSession").onclick = () => openModal("session");
  $$("[data-edit-session]").forEach((el) => (el.onclick = () => openModal("session", S.sessions.find((p) => p.id == el.dataset.editSession))));
  $$("[data-delete-session]").forEach((b) => (b.onclick = () => removeItem("session", b.dataset.deleteSession)));
}

const noteCard = (n) => `<article class="note-card" data-note="${n.id}"><span class="note-tag">${escapeHTML(n.category)}</span><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.body)}</p><small>${relativeDate(n.updated_at)}</small></article>`;

function renderNotes() {
  $("#pageContent").innerHTML = pageHeader("Catatanku", "Ide dan catatan kuliahmu, semuanya di satu tempat.", `<button class="btn btn-primary" id="addNote">＋ Catatan baru</button>`) + `
  <div class="note-grid">${S.notes.map(noteCard).join("")}<article class="note-card" id="newNoteCard" style="display:grid;place-items:center;border-style:dashed;color:#999"><span style="font-size:25px">＋</span><b style="font-size:10px">Buat catatan baru</b></article></div>`;
  $("#addNote").onclick = () => openModal("note");
  $("#newNoteCard").onclick = () => openModal("note");
  $$("[data-note]").forEach((el) => (el.onclick = () => openModal("note", S.notes.find((n) => n.id == el.dataset.note))));
}

function renderProgress() {
  const { done, percent, inProgress } = stats();
  $("#pageContent").innerHTML = pageHeader("Progresmu", "Gambaran usaha yang sudah kamu lakukan.") + `
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-head">Tingkat penyelesaian</div><div class="stat-value">${percent}%</div><div class="stat-foot">Tugas selesai</div></div>
    <div class="stat-card"><div class="stat-head">Tugas selesai</div><div class="stat-value">${done}</div><div class="stat-foot">Kerja bagus!</div></div>
    <div class="stat-card"><div class="stat-head">Sedang dikerjakan</div><div class="stat-value">${inProgress}</div><div class="stat-foot">Terus melangkah</div></div>
    <div class="stat-card"><div class="stat-head">Sesi belajar</div><div class="stat-value">${S.sessions.length}</div><div class="stat-foot">Sesi terjadwal</div></div>
  </div>
  <div class="dashboard-grid">
    ${statusPanel(S.tasks)}
    <section class="panel"><div class="panel-head"><div><h3>Pengingat kecil</h3><p>Konsisten lebih penting daripada sempurna</p></div></div><div class="progress-summary">${ring(percent)}<div><b>${percent >= 75 ? "Kamu lagi on fire!" : percent >= 40 ? "Progres yang bagus!" : "Setiap langkah berarti."}</b><p>Perbarui tugasmu agar gambaran progres lebih akurat.</p></div></div></section>
  </div>`;
}

function renderPage() {
  $("#taskCount").textContent = S.tasks.filter((t) => t.status !== "completed").length;
  ({ overview: renderOverview, tasks: renderTasks, calendar: renderCalendar, planner: renderPlanner, notes: renderNotes, progress: renderProgress }[currentPage] || renderOverview)();
}

/* ---------- Modal tambah / ubah / hapus ---------- */
const MODE = {
  task: { path: "/tasks", key: "tasks", noun: "tugas" },
  session: { path: "/sessions", key: "sessions", noun: "sesi belajar" },
  note: { path: "/notes", key: "notes", noun: "catatan" },
};

function openModal(mode, item = null) {
  modalMode = mode;
  $("#itemForm").reset();
  hideError($("#formError"));
  const cat = $("#fieldCategory");
  const category = item?.category || "Pemrograman";
  if (![...cat.options].some((o) => o.value === category)) cat.add(new Option(category, category));
  cat.value = category;

  $("#itemId").value = item?.id || "";
  $("#fieldTitle").value = item?.title || "";
  $("#fieldDate").value = (mode === "session" ? item?.date : item?.due_date) ?? (item ? "" : iso(new Date()));
  $("#fieldPriority").value = item?.priority || "medium";
  $("#fieldStatus").value = item?.status || "todo";
  $("#fieldStart").value = item?.start_time ? hhmm(item.start_time) : "09:00";
  $("#fieldEnd").value = item?.end_time ? hhmm(item.end_time) : "10:00";
  $("#fieldNotes").value = (mode === "note" ? item?.body : item?.notes) || "";

  $("#modalTitle").textContent = (item ? "Ubah " : "Tambah ") + MODE[mode].noun;
  $("#wrapDate").style.display = mode === "note" ? "none" : "block";
  $("#lblDate").textContent = mode === "session" ? "Tanggal" : "Tenggat";
  $("#fieldDate").required = mode === "session";
  $("#wrapTask").style.display = mode === "task" ? "grid" : "none";
  $("#wrapTime").style.display = mode === "session" ? "grid" : "none";
  $("#wrapNotes").style.display = mode === "session" ? "none" : "block";
  $("#lblNotes").textContent = mode === "note" ? "Isi catatan" : "Catatan";
  $("#fieldNotes").placeholder = mode === "note" ? "Tulis catatanmu di sini..." : "Detail tambahan (opsional)";
  $("#fieldNotes").maxLength = mode === "note" ? 10000 : 2000;
  $("#deleteItem").classList.toggle("hidden", !item);
  $("#modalBackdrop").classList.remove("hidden");
  setTimeout(() => $("#fieldTitle").focus(), 30);
}
const closeModal = () => $("#modalBackdrop").classList.add("hidden");
$("#closeModal").onclick = closeModal;
$("#cancelModal").onclick = closeModal;
$("#modalBackdrop").onclick = (e) => { if (e.target.id === "modalBackdrop") closeModal(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeAuth(); } });

function buildPayload() {
  const base = { title: $("#fieldTitle").value.trim(), category: $("#fieldCategory").value };
  if (modalMode === "task") return { ...base, due_date: $("#fieldDate").value || null, priority: $("#fieldPriority").value, status: $("#fieldStatus").value, notes: $("#fieldNotes").value.trim() };
  if (modalMode === "session") return { ...base, date: $("#fieldDate").value, start_time: $("#fieldStart").value, end_time: $("#fieldEnd").value };
  return { ...base, body: $("#fieldNotes").value.trim() };
}

$("#itemForm").onsubmit = async (e) => {
  e.preventDefault();
  const { path, key } = MODE[modalMode];
  const id = $("#itemId").value;
  const btn = $("#saveItem");
  hideError($("#formError"));
  btn.disabled = true;
  try {
    await api(id ? `${path}/${id}` : path, { method: id ? "PATCH" : "POST", body: buildPayload() });
    S[key] = await api(path);
    closeModal();
    renderPage();
    showToast("Perubahan berhasil disimpan");
  } catch (err) {
    showError($("#formError"), errorText(err));
  } finally {
    btn.disabled = false;
  }
};

async function removeItem(mode, id) {
  const { path, key, noun } = MODE[mode];
  if (!confirm(`Hapus ${noun} ini? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await api(`${path}/${id}`, { method: "DELETE" });
    S[key] = await api(path);
    closeModal();
    renderPage();
    showToast(`${noun[0].toUpperCase() + noun.slice(1)} dihapus`);
  } catch (err) { showToast(errorText(err)); }
}
$("#deleteItem").onclick = () => removeItem(modalMode, $("#itemId").value);

/* ---------- Tema ---------- */
function toggleTheme() { document.body.classList.toggle("dark"); localStorage.setItem("bk_dark", document.body.classList.contains("dark")); }
$("#themeToggle").onclick = toggleTheme;
$("#topTheme").onclick = toggleTheme;
if (localStorage.getItem("bk_dark") === "true") document.body.classList.add("dark");

/* ---------- Data demo & pratinjau landing ---------- */
// Sumber data sama dengan akun demo di backend: frontend/demo-data.json.
let demoStatePromise;
function loadDemoState() {
  demoStatePromise ||= fetch("demo-data.json")
    .then((r) => { if (!r.ok) throw new Error("demo-data.json tidak ditemukan"); return r.json(); })
    .then(buildDemoState);
  return demoStatePromise;
}

function buildDemoState(d) {
  const shift = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x; };
  let id = 0;
  // Urutan sama persis dengan API: yang belum selesai dulu, lalu menurut tenggat.
  const tasks = d.tasks
    .map((t) => ({ id: ++id, title: t.title, category: t.category, due_date: iso(shift(t.day)), priority: t.priority, status: t.status, notes: t.notes || "" }))
    .sort((a, b) => (a.status === "completed") - (b.status === "completed") || a.due_date.localeCompare(b.due_date) || b.id - a.id);
  const sessions = d.sessions
    .map((p) => ({ id: ++id, title: p.title, category: p.category, date: iso(shift(p.day)), start_time: p.start, end_time: p.end }))
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const notes = d.notes.map((n) => ({ id: ++id, title: n.title, category: n.category, body: n.body, updated_at: shift(-(n.daysAgo || 0)).toISOString().slice(0, 19).replace("T", " ") }));
  return { user: { name: d.user.name }, tasks, sessions, notes };
}

// Landing memakai fungsi tampilan yang sama dengan dashboard; data-* dibuang agar tidak ikut terikat ke handler dashboard.
const frozen = (html) => html.replace(/\sdata-[\w-]+="[^"]*"/g, "");

async function renderLandingArt() {
  let demo;
  try { demo = await loadDemoState(); } catch { return; }
  const { tasks, sessions, notes } = demo;
  const today = iso(new Date());
  const todays = sessions.filter((p) => p.date === today);
  const rows = [...tasks.filter((t) => t.status !== "completed").slice(0, 2), ...tasks.filter((t) => t.status === "completed").slice(-1)];
  const fill = (id, html) => { const el = $("#" + id); if (el) el.innerHTML = frozen(html); };
  fill("artTasks", `<div class="task-list-panel">${rows.map(taskRow).join("")}</div>`);
  fill("artPlanner", `<div class="planner-list">${(todays.length ? todays : sessions).slice(0, 2).map(plannerItem).join("")}</div>`);
  fill("artCalendar", calendarPanel(new Date(), tasks, sessions));
  fill("artNote", noteCard(notes[0]));
  fill("artProgress", statusPanel(tasks));
}

// Pratinjau hero = dashboard asli (index.html?preview) di dalam iframe, diskalakan agar muat.
function initHeroPreview() {
  const box = $("#previewFrame"), frame = $("#previewIframe");
  if (!box || !frame) return;
  frame.src = "index.html?preview=1"; // diisi lewat JS agar halaman pratinjau tidak memuat dirinya sendiri
  const fit = () => {
    const mobile = window.matchMedia("(max-width: 650px)").matches;
    const w = mobile ? 390 : 1000, h = mobile ? 720 : 960; // 960 = tinggi asli halaman Ringkasan pada lebar 1000
    const scale = box.clientWidth / w;
    frame.style.cssText = `width:${w}px;height:${h}px;transform:scale(${scale})`;
    box.style.height = Math.round(h * scale) + "px";
  };
  new ResizeObserver(fit).observe(box);
  fit();
}

async function bootPreview() {
  document.documentElement.classList.add("is-preview");
  try {
    const d = await loadDemoState();
    user = d.user;
    S = { tasks: d.tasks, notes: d.notes, sessions: d.sessions };
  } catch { return; }
  $("#landing").classList.add("hidden");
  $("#app").classList.remove("hidden");
  setUserUI();
  $("#todayLabel").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  navigate("overview");
}

// Tombol "Coba akun demo" di hero: tampil bila akun demo aktif dan belum ada yang login.
function syncDemoButtons() { $("#heroDemo").classList.toggle("hidden", !demoCfg || !!user); }
$("#heroDemo").onclick = () => demoCfg && authenticate("login", { email: demoCfg.email, password: demoCfg.password }, $("#heroDemo"));

/* ---------- Mulai ---------- */
(async function boot() {
  if (PREVIEW) return bootPreview();
  initHeroPreview();
  renderLandingArt();
  api("/config").then((c) => { demoCfg = c.demo; syncDemoButtons(); }).catch(() => {});
  if (!token) return;
  try {
    user = (await api("/auth/me")).user;
    syncDemoButtons();
    await enterApp();
  } catch (err) {
    if (token) showToast(err.message); // server mati: token disimpan, coba lagi nanti
  }
})();
