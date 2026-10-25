import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, validateLead } from '../server.mjs';

const input = { lead_name: 'Test Person', phone: '9876543210', property_interest: 'Buying a home', notes: 'Test only' };
const env = { CRM_USERNAME: 'test-user', CRM_PASSWORD: 'test-secret', PUBLIC_ORIGIN: 'https://www.brickloop.co.in' };
async function fixture(t, fetchImpl, config = {}) {
  const server = createServer({ fetchImpl, env, ...config });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: (body = input, headers = {}) => fetch(base + '/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.PUBLIC_ORIGIN, ...headers }, body: JSON.stringify(body) }) };
}

test('normalizes phone and pins source, never trusting browser source or extra fields', () => {
  const lead = validateLead({ ...input, lead_source: 'forged', admin: true });
  assert.equal(lead.phone, '+919876543210');
  assert.equal(lead.lead_source, 'Brickloop Website');
  assert.equal(lead.admin, undefined);
  assert.throws(() => validateLead({ ...input, phone: '123' }));
  assert.throws(() => validateLead({ ...input, email: 'bad' }));
  assert.throws(() => validateLead({ ...input, notes: 'x'.repeat(2001) }));
});
test('forwards schema and Basic auth only to fixed CRM, acknowledges success', async t => {
  let calls = 0;
  const { post } = await fixture(t, async (url, options) => {
    calls++;
    assert.equal(url, 'https://crm.brickloop.co.in/api/public/leads');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('test-user:test-secret').toString('base64'));
    assert.deepEqual(JSON.parse(options.body), validateLead(input));
    return new Response(JSON.stringify({ success: true, id: 123 }), { status: 201 });
  });
  const response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(calls, 1);
});
test('invalid input and foreign origins never reach CRM', async t => {
  let calls = 0;
  const { post } = await fixture(t, () => { calls++; });
  assert.equal((await post({ ...input, phone: 'wrong' })).status, 400);
  assert.equal((await post(input, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(calls, 0);
});
test('CRM failures, malformed successes, and explicit errors never show success or disclose raw CRM response', async t => {
  for (const [code, body] of [[401, 'private debug secret'], [500, 'private error'], [200, '<html>Login</html>'], [200, '{"success":false}'], [202, '{"pending":true}']]) {
    const { post } = await fixture(t, async () => new Response(body, { status: code }));
    const response = await post();
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private|Login|secret/);
  }
});
test('network uncertainty returns a cautious response and does not retry', async t => {
  let calls = 0;
  const { post } = await fixture(t, async () => { calls++; throw new Error('private'); });
  const response = await post();
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /may have reached/);
  assert.equal(calls, 1);
});
test('rate limits attempts and does not expose environment or server files', async t => {
  const { post, base } = await fixture(t, async () => new Response('{}', { status: 201 }));
  for (let i = 0; i < 5; i++) assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 429);
  for (const file of ['/.env', '/server.mjs', '/package.json', '/test/leads.test.mjs']) assert.equal((await fetch(base + file)).status, 404);
  const html = await (await fetch(base)).text();
  assert.doesNotMatch(html, /test-secret|Authorization|Preview only\. This form/);
  assert.match(html, /name="lead_name"/);
});
test('missing secrets fails closed without calling CRM', async t => {
  let calls = 0;
  const { post } = await fixture(t, () => { calls++; }, { env: {} });
  assert.equal((await post(input, { Origin: '' })).status, 503);
  assert.equal(calls, 0);
});
