// Usage: npx vercel env pull .env.local && node --env-file=.env.local scripts/export-volunteers.mjs > volunteers.csv
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT name, email, role, note, created_at FROM volunteers ORDER BY created_at`;
const safe = v => typeof v === 'string' && /^[\s]*[=+@-]/.test(v) ? "'" + v : v;
const esc = v => v == null ? '' : /[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
console.log('name,email,role,note,created_at');
for (const r of rows) console.log([r.name, r.email, r.role, r.note, new Date(r.created_at).toISOString()].map(safe).map(esc).join(','));
console.error(`${rows.length} signups`);
