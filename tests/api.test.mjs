// Unit tests for api/waitlist.js. No database needed: the handler runs in
// dry-run mode unless VERCEL_ENV is "production".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/waitlist.js';

function call({ method = 'POST', body = '', headers = {}, handler: run = handler } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.headers = { 'content-type': 'application/json', accept: 'application/json', ...headers };
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { resolve({ status: this.statusCode, headers: this.headers, json: data ? JSON.parse(data) : null }); },
    };
    run(req, res);
  });
}
const post = obj => call({ body: JSON.stringify(obj) });

// Volunteer validation uses the same request harness and never a live database.
import volunteerHandler from '../api/volunteer.js';
const volunteer = (obj, options = {}) => call({ ...options, body: typeof obj === 'string' ? obj : JSON.stringify(obj), handler: volunteerHandler });
const validVolunteer = { name: 'Test Volunteer', email: 'test@example.com', role: 'tutor', age13: 'yes', note: '' };

test('volunteer POST only and JSON body shape', async () => {
  assert.equal((await volunteer('', { method: 'GET' })).status, 405);
  for (const body of ['{', 'null', '[]', '"text"']) assert.equal((await volunteer(body)).json.error, 'body');
});
for (const [field, values] of Object.entries({
  name: ['', ' ', 'x'.repeat(101), 123], email: ['bad', 'a@b.c', 'a'.repeat(250)+'@x.com'],
  role: ['', 'admin'], note: ['x'.repeat(501)], age13: ['', 'no', true],
})) {
  test(`volunteer validates ${field}`, async () => {
    for (const value of values) {
      const r = await volunteer({ ...validVolunteer, [field]: value });
      assert.equal(r.status, 400); assert.equal(r.json.error, field);
    }
  });
}
test('volunteer accepts all roles and field limits without production writes', async () => {
  for (const role of ['teacher', 'tester', 'lesson writer', 'web and design', 'tutor', 'other']) {
    const r = await volunteer({ ...validVolunteer, role, name: 'n'.repeat(100), note: 'x'.repeat(500), email: 'a'.repeat(248)+'@b.com' });
    assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true, dryRun: true });
  }
});
test('volunteer honeypot and body cap', async () => {
  assert.deepEqual((await volunteer({ website: 'spam' })).json, { ok: true });
  assert.equal((await volunteer({ ...validVolunteer, pad: 'x'.repeat(3000) })).status, 413);
});
test('volunteer native form redirects to visible thank-you', async () => {
  const r = await volunteer(new URLSearchParams(validVolunteer).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' } });
  assert.equal(r.status, 303); assert.equal(r.headers.location, '/get-involved?joined=1#volunteer-thanks');
});


test('rejects non-POST', async () => {
  const r = await call({ method: 'GET' });
  assert.equal(r.status, 405);
});

test('rejects a bad email', async () => {
  assert.equal((await post({ role: 'parent', email: 'nope' })).json.error, 'email');
});

test('student must give an age', async () => {
  const r = await post({ role: 'student', email: 'a@example.com' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'age');
});

test('accepts form-encoded bodies too', async () => {
  const r = await call({ body: 'role=teacher&email=t%40example.com', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test('honeypot submissions are silently accepted', async () => {
  const r = await post({ role: 'parent', email: 'bot@example.com', website: 'spam' });
  assert.deepEqual(r.json, { ok: true });
});

test('outside production nothing is written (dry run)', async () => {
  const r = await post({ role: 'student', age: 'under13', email: 'kid@example.com' });
  assert.equal(r.status, 200);
  assert.equal(r.json.dryRun, true);
});

test('oversized bodies are refused', async () => {
  const r = await post({ role: 'parent', email: 'a@example.com', pad: 'x'.repeat(4000) });
  assert.equal(r.status, 413);
});
