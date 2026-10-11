import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel resolves API functions before the SPA fallback', () => {
  assert.equal(config.rewrites, undefined);
  assert.deepEqual(config.routes, [
    { handle: 'filesystem' },
    { src: '/.*', dest: '/index.html' },
  ]);
});
