import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const endpoint = 'https://crm.brickloop.co.in/api/public/leads';
const limits = { lead_name: 120, phone: 30, email: 254, budget: 100, preferred_location: 200, property_interest: 200, notes: 2000 };

export function validateLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid form data.');
  const lead = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`Please check ${key.replaceAll('_', ' ')}.`);
    lead[key] = value.trim();
  }
  if (lead.lead_name.length < 2) throw new Error('Please enter your name.');
  lead.phone = lead.phone.replace(/[\s()-]/g, '');
  if (/^[6-9]\d{9}$/.test(lead.phone)) lead.phone = '+91' + lead.phone;
  if (/^91[6-9]\d{9}$/.test(lead.phone)) lead.phone = '+' + lead.phone;
  if (!/^\+[1-9]\d{7,14}$/.test(lead.phone)) throw new Error('Enter a 10-digit Indian mobile number or an international number with country code.');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new Error('Please enter a valid email address.');
  if (!lead.property_interest) throw new Error('Please choose a requirement type.');
  return { ...lead, lead_source: 'Brickloop Website' };
}

function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

export function createServer({ fetchImpl = fetch, env = process.env, timeoutMs = 12000 } = {}) {
  const attempts = new Map();
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/leads') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      const origin = req.headers.origin;
      const expectedOrigin = env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if ((origin && origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Please submit from the website.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON is required.' });
      if (!env.CRM_USERNAME || !env.CRM_PASSWORD) return json(res, 503, { error: 'Online enquiries are temporarily unavailable. Please call or WhatsApp us.' });
      const now = Date.now();
      for (const [key, record] of attempts) if (record.until < now) attempts.delete(key);
      // Do not trust user-supplied forwarding headers. Configure edge rate limiting when deploying behind a proxy.
      const ip = req.socket.remoteAddress;
      const record = attempts.get(ip) || { count: 0, until: now + 600000 };
      if (record.count >= 5 || (!attempts.has(ip) && attempts.size >= 10000)) return json(res, 429, { error: 'Too many attempts. Please wait or contact us directly.' });
      record.count++; attempts.set(ip, record);
      let lead;
      try {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) { json(res, 413, { error: 'Your message is too long.' }); return; }
          chunks.push(chunk);
        }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        lead = validateLead(input);
      } catch (error) {
        return json(res, 400, { error: error instanceof SyntaxError ? 'Invalid form data.' : error.message });
      }
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${env.CRM_USERNAME}:${env.CRM_PASSWORD}`).toString('base64')}` },
          body: JSON.stringify(lead), signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) {
          await response.body?.cancel();
          return json(res, 502, { error: 'We could not confirm your enquiry. Please contact us directly before resubmitting.' });
        }
        // Accept only a completed CRM HTTP success, and reject explicit application errors.
        const body = await response.text();
        let result;
        try { result = body ? JSON.parse(body) : null; } catch {
          return json(res, 502, { error: 'We could not confirm your enquiry. Please contact us directly before resubmitting.' });
        }
        if (response.status === 202 || result?.success === false || result?.ok === false || result?.error || (result?.errors && Object.keys(result.errors).length) || ['error', 'failed', 'failure'].includes(result?.status)) {
          return json(res, 502, { error: 'We could not confirm your enquiry. Please contact us directly before resubmitting.' });
        }
        return json(res, 200, { success: true });
      } catch {
        return json(res, 504, { error: 'We could not confirm delivery. Your enquiry may have reached us. Please call or WhatsApp before resubmitting.' });
      }
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    // Explicit public allowlist: never expose .env, source, tests, or brand archives.
    let file;
    if (pathname === '/' || pathname === '/index.html') file = 'app/index.html';
    else if (['/lead-form.js', '/site.js'].includes(pathname)) file = 'app' + pathname;
    else if (/^\/assets\/[A-Za-z0-9_.-]+\.(jpg|png|svg|ico)$/.test(pathname)) file = 'app' + pathname;
    else return json(res, 404, { error: 'Not found.' });
    try {
      const data = await readFile(path.join(root, file));
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(res, 404, { error: 'Not found.' }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Brickloop running on port ${port}`));
}
