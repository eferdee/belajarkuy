// Validasi input ringan tanpa dependency tambahan.
class ValidationError extends Error {
  constructor(errors) {
    super('Data tidak valid');
    this.status = 400;
    this.errors = errors;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * rules: { field: { type, required, max, min, enum, default } }
 * partial=true → hanya validasi field yang dikirim (untuk PATCH).
 */
function validate(body, rules, { partial = false } = {}) {
  const errors = {};
  const out = {};
  const src = body && typeof body === 'object' ? body : {};

  for (const [field, rule] of Object.entries(rules)) {
    let v = src[field];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

    if (missing) {
      if (partial && v === undefined) continue;
      if (rule.required) { errors[field] = 'Wajib diisi'; continue; }
      if (rule.type === 'date' || rule.type === 'time') { out[field] = rule.nullable ? null : rule.default; if (out[field] === undefined) delete out[field]; continue; }
      out[field] = rule.default !== undefined ? rule.default : '';
      continue;
    }

    if (typeof v !== 'string') { errors[field] = 'Harus berupa teks'; continue; }
    v = v.trim();

    if (rule.type === 'date' && !isRealDate(v)) { errors[field] = 'Format tanggal harus YYYY-MM-DD'; continue; }
    if (rule.type === 'time' && !TIME_RE.test(v)) { errors[field] = 'Format jam harus HH:MM'; continue; }
    if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { errors[field] = 'Format email tidak valid'; continue; }
    if (rule.enum && !rule.enum.includes(v)) { errors[field] = `Harus salah satu dari: ${rule.enum.join(', ')}`; continue; }
    if (rule.min && v.length < rule.min) { errors[field] = `Minimal ${rule.min} karakter`; continue; }
    if (rule.max && v.length > rule.max) { errors[field] = `Maksimal ${rule.max} karakter`; continue; }
    out[field] = v;
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { validate, parseId, ValidationError };
