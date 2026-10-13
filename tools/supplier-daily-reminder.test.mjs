import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
process.env.GCI_CRM_REMINDER_SECRET = 'TEST-UAT-reminder-secret';
process.env.SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'TEST-UAT-server-only';

const { default: handler } = await import('../api/suppliers/daily-reminder.ts');

function dubaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function request(secret = 'TEST-UAT-reminder-secret', method = 'GET') {
  return new Request('https://app.globalcareinfo.com/api/suppliers/daily-reminder', {
    method,
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => { process.env = { ...originalEnv }; });

test('rejects public access and unsupported methods before querying suppliers', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json([]); };
  assert.equal((await handler(request(''))).status, 401);
  assert.equal((await handler(request('wrong-secret'))).status, 401);
  assert.equal((await handler(request('TEST-UAT-reminder-secret', 'POST'))).status, 405);
  assert.equal(calls, 0);
});

test('returns only due supplier reminder fields grouped by Dubai date', async () => {
  const today = dubaiDate();
  const overdue = shiftDate(today, -1);
  let queriedUrl = '';
  globalThis.fetch = async (url) => {
    queriedUrl = String(url);
    return Response.json([
      { supplier_name_display: 'TEST-UAT Today', status: 'active', next_follow_up_at: today, next_action: 'Confirm capacity' },
      { supplier_name_display: 'TEST-UAT Overdue', status: 'under_review', next_follow_up_at: overdue, next_action: 'Verify licence' },
      { supplier_name_display: 'TEST-UAT Inactive', status: 'inactive', next_follow_up_at: today, next_action: 'Do not send' },
      { supplier_name_display: 'TEST-UAT Blacklisted', status: 'BLACKLISTED', next_follow_up_at: today, next_action: 'Do not send' },
      { supplier_name_display: 'TEST-UAT Archived', status: ' archived ', next_follow_up_at: overdue, next_action: 'Do not send' },
    ]);
  };

  const response = await handler(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.date, today);
  assert.deepEqual(payload.today.map((row) => row.supplier_name_display), ['TEST-UAT Today']);
  assert.deepEqual(payload.overdue.map((row) => row.supplier_name_display), ['TEST-UAT Overdue']);
  assert.deepEqual(Object.keys(payload.today[0]).sort(), ['next_action', 'next_follow_up_at', 'status', 'supplier_name_display']);
  const url = new URL(queriedUrl);
  assert.equal(url.pathname, '/rest/v1/suppliers');
  assert.equal(url.searchParams.get('select'), 'supplier_name_display,status,next_follow_up_at,next_action');
  assert.equal(url.searchParams.get('next_follow_up_at'), `lte.${today}`);
});
