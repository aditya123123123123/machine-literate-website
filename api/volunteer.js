import { neon } from '@neondatabase/serverless';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = new Set(['teacher', 'tester', 'lesson writer', 'web and design', 'tutor', 'other']);
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
  if (!q || typeof q !== 'object' || Array.isArray(q)) return send(res, 400, { ok: false, error: 'body' });
  const g = k => (typeof q[k] === 'string' ? q[k] : '').trim();
  if (g('website')) return send(res, 200, { ok: true });
  const name = g('name');
  const email = g('email').toLowerCase();
  const role = g('role');
  const note = g('note');
  if (g('age13') !== 'yes') return send(res, 400, { ok: false, error: 'age13' });
  if (!name || name.length > 100) return send(res, 400, { ok: false, error: 'name' });
  if (email.length > 254 || !EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: 'email' });
  if (!ROLES.has(role)) return send(res, 400, { ok: false, error: 'role' });
  if (note.length > 500) return send(res, 400, { ok: false, error: 'note' });
  // Only production writes to the real volunteers. Preview and local runs validate
  // the request the same way, then return success without storing anything.
  if (process.env.VERCEL_ENV !== 'production') {
    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json')) { res.statusCode = 303; res.setHeader('Location', '/get-involved?joined=1#volunteer-thanks'); return res.end(); }
    return send(res, 200, { ok: true, dryRun: true });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return send(res, 503, { ok: false, error: 'unavailable' });
  const sql = neon(url);
  try {
    ready ||= sql`CREATE TABLE IF NOT EXISTS volunteers (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      role text NOT NULL,
      note text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await ready;
    const rows = await sql`INSERT INTO volunteers (name, email, role, note)
      VALUES (${name}, ${email}, ${role}, ${note})
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json')) { res.statusCode = 303; res.setHeader('Location', '/get-involved?joined=1#volunteer-thanks'); return res.end(); }
    return send(res, 200, { ok: true, duplicate: rows.length === 0 });
  } catch (err) {
    ready = undefined;
    // Database errors can contain submitted values. Do not log personal data.
    console.error('volunteer insert failed');
    return send(res, 500, { ok: false, error: 'server' });
  }
}
