import { neon } from '@neondatabase/serverless';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = new Set(['parent', 'teacher', 'student', 'other']);
const AGES = new Set(['under13', '13plus']);
let ready;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2048) { reject(new Error('size')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, error: 'method' }); }
  let raw;
  try { raw = await readBody(req); } catch { return send(res, 413, { ok: false, error: 'size' }); }
  const type = String(req.headers['content-type'] || '');
  let q;
  try { q = type.includes('application/json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw)); }
  catch { return send(res, 400, { ok: false, error: 'body' }); }
  const g = k => (typeof q[k] === 'string' ? q[k] : '').trim();
  if (g('website')) return send(res, 200, { ok: true });
  const email = g('email').toLowerCase();
  let role = g('role'); let age = g('age');
  if (email.length > 254 || !EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: 'email' });
  if (!ROLES.has(role)) role = 'other';
  if (role === 'student' && !AGES.has(age)) return send(res, 400, { ok: false, error: 'age' });
  if (role !== 'student') age = null;
  const owner = age === 'under13' ? 'parent' : 'self';
  // Only production writes to the real waitlist. Preview and local runs validate
  // the request the same way, then return success without storing anything.
  if (process.env.VERCEL_ENV !== 'production') {
    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json')) { res.statusCode = 303; res.setHeader('Location', '/joined'); return res.end(); }
    return send(res, 200, { ok: true, dryRun: true });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return send(res, 503, { ok: false, error: 'unavailable' });
  const sql = neon(url);
  try {
    ready ||= sql`CREATE TABLE IF NOT EXISTS waitlist (
      id bigserial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      role text NOT NULL,
      age_group text,
      email_owner text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await ready;
    const rows = await sql`INSERT INTO waitlist (email, role, age_group, email_owner)
      VALUES (${email}, ${role}, ${age}, ${owner})
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json')) { res.statusCode = 303; res.setHeader('Location', '/joined'); return res.end(); }
    return send(res, 200, { ok: true, duplicate: rows.length === 0 });
  } catch (err) {
    ready = undefined;
    console.error('waitlist insert failed', err && err.message);
    return send(res, 500, { ok: false, error: 'server' });
  }
}
