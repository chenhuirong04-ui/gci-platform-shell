import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel maps dynamic Assistant API functions before the SPA fallback', () => {
  assert.deepEqual(config.rewrites, [
    { source: '/api/assistant/context/customer/:id', destination: '/api/assistant/context/customer/[id]' },
    { source: '/api/assistant/customers/:id/followup', destination: '/api/assistant/customers/[id]/followup' },
    { source: '/api/assistant/customers/:id/update', destination: '/api/assistant/customers/[id]/update' },
    { source: '/api/assistant/customers/:id/contact', destination: '/api/assistant/customers/[id]/contact' },
    { source: '/(.*)', destination: '/index.html' },
  ]);
});
