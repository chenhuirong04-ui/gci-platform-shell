import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nextFollowUpDateForSave } from '../apps/shell/src/lib/crmDateInput.ts';

test('does not save an unchanged or incomplete date', () => {
  assert.equal(nextFollowUpDateForSave('2026-10-12', '2026-10-12'), undefined);
  assert.equal(nextFollowUpDateForSave('2026-10', '2026-10-12'), undefined);
});

test('saves a complete date and supports clearing', () => {
  assert.equal(nextFollowUpDateForSave('2026-10-12', null), '2026-10-12');
  assert.equal(nextFollowUpDateForSave('', '2026-10-12'), null);
});

test('date input saves on blur, not during onChange, and preserves the existing minimum date rule', async () => {
  const source = await readFile(new URL('../apps/shell/src/pages/CrmCustomers.tsx', import.meta.url), 'utf8');
  const input = source.match(/<input\s+key=\{`\$\{r\.id\}:\$\{r\.next_follow_up_at[\s\S]*?\/>/)?.[0] || '';
  assert.match(input, /defaultValue=\{r\.next_follow_up_at \|\| ''\}/);
  assert.match(input, /min=\{crmDate\(1\)\}/);
  assert.match(input, /onBlur=/);
  assert.doesNotMatch(input, /onChange=/);
});
