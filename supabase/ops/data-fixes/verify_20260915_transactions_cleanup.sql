-- READ-ONLY (one SELECT). Did 20260915_transactions_cleanup.sql run? Row count alone cannot say: the script's own post-flight guard demands EXACTLY 8 rows.
-- This breaks that guard into its conditions and shows the actual value of each. Run it in the Supabase SQL Editor and paste the result.
--
-- How to read it (evidence, not proof):
--   * conditions 2–8 all hold and only condition 1 differs (7 instead of 8)  ->  the cleanup very likely ran and one row was changed/removed afterwards.
--   * any of conditions 6, 7, 8 fails (seed rows / test rows / duplicates still present)  ->  the cleanup did NOT run, or ran only partly.
--   * The definitive record is the Supabase Dashboard -> SQL Editor history for the day it was pasted. Do NOT register it in ops.migration_ledger
--     as kind='data_fix' until that is confirmed.
with cash as (select id from public.bank_accounts where account_type = 'Cash' and is_active = true),
     dedup as (select payload->>'refId' as ref, count(*) as n from public.transactions
               where payload->>'refId' in ('PAY-1779386522159','PAY-1780996785791','PAY-1783390941877','PAY-1783391236568','PAY-1783391669701','PAY-1783392027700')
               group by 1)
select n, condition, expected, actual, (actual = expected) as holds from (
  select 1 as n, 'total rows in transactions (script target after cleanup)' as condition, '8' as expected, (select count(*) from public.transactions)::text as actual
  union all select 2, 'active Cash bank accounts (needed to verify the 6 cash rows)', '1', (select count(*) from cash)::text
  union all select 3, 'rows carrying the Cash account id', '6', (select count(*) from public.transactions where payload->>'bank_account_id' in (select id::text from cash))::text
  union all select 4, 'CST-1779957931246: rows / flagged needs_manual_account_assignment / bank_account_id empty', '1 / true / empty',
         (select count(*) || ' / ' || coalesce(max(payload->>'needs_manual_account_assignment'), 'null') || ' / ' || case when bool_and(coalesce(payload->>'bank_account_id', '') = '') then 'empty' else 'SET' end
            from public.transactions where payload->>'id' = 'CST-1779957931246')
  union all select 5, 'orphan refId PAY-1779440121802: rows / needs_manual_review set / bank_account_id empty', '1 / set / empty',
         (select count(*) || ' / ' || case when bool_and(payload->>'needs_manual_review' is not null) then 'set' else 'not set' end || ' / ' || case when bool_and(coalesce(payload->>'bank_account_id', '') = '') then 'empty' else 'SET' end
            from public.transactions where payload->>'refId' = 'PAY-1779440121802')
  union all select 6, 'seed rows (payload.id = 1 or 2) still present', '0', (select count(*) from public.transactions where payload->>'id' in ('1', '2'))::text
  union all select 7, 'BUSINESS_SOLUTIONS test rows still present', '0', (select count(*) from public.transactions where payload->>'source_module' = 'BUSINESS_SOLUTIONS' and payload->>'note' = 'test')::text
  union all select 8, 'the 6 de-duplicated refIds: max rows left per refId', '1', coalesce((select max(n) from dedup), 0)::text
) c order by n;
