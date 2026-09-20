// Generates the FINAL-SCOPE iCare SQL from ONE rule set so the dry-run and the real migration cannot disagree.
//   supabase/proposals/icare/00_dryrun.sql        read-only (D1 summary, D2 task detail)
//   supabase/proposals/icare/10_apply_batch.sql   writes; guarded; NOT to be run before Chris flips execution_approved
//   supabase/proposals/icare/20_rollback_batch.sql
// SCOPE (Chris, 2026-09): ONLY the 3 internal tasks are migrated.  19 projects / 6 projectFollowUps / 21 history are NOT migrated.
// An earlier full-scope generator (projects, follow-ups, manual customer mapping) was dropped: it is not part of the plan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'proposals', 'icare') + path.sep;
fs.mkdirSync(OUT, { recursive: true });

// A task that is 等待他人 must land in the "waiting" column after the switch to executive_tasks (which has no waiting status: waiting = in_progress + a blocker).
// If iCare stored no blocker text for it, this explicit marker keeps the state visible instead of silently turning it into a plain in-progress task.
const WAIT_MARK = '等待他人（自 iCare 迁移，原无阻塞说明）';

// ───────────────────────── shared logic ─────────────────────────
const COMMON = String.raw`with snap as (select data->'kv' as kv from public.icare_snapshots where id = 'v1'),

-- source sizes (used only as guards: the snapshot must still look exactly like the approved dry-run)
src as (
  select
    jsonb_array_length(case when jsonb_typeof(kv->'ICARE_INTERNAL_TASKS_V1') = 'array' then kv->'ICARE_INTERNAL_TASKS_V1' else '[]'::jsonb end) as src_tasks,
    jsonb_array_length(case when jsonb_typeof(kv->'ICARE_PROJECTS_V1') = 'array' then kv->'ICARE_PROJECTS_V1' else '[]'::jsonb end) as src_projects,
    (select coalesce(sum(jsonb_array_length(case when jsonb_typeof(p->'projectFollowUps') = 'array' then p->'projectFollowUps' else '[]'::jsonb end)), 0)
       from jsonb_array_elements(case when jsonb_typeof(kv->'ICARE_PROJECTS_V1') = 'array' then kv->'ICARE_PROJECTS_V1' else '[]'::jsonb end) p)::int as src_followups,
    jsonb_array_length(case when jsonb_typeof(kv->'ICARE_HISTORY_V1') = 'array' then kv->'ICARE_HISTORY_V1' else '[]'::jsonb end) as src_history
  from snap),

-- ───────── internal tasks ─────────
t as (select x.value j, x.ordinality::int n from snap, jsonb_array_elements(case when jsonb_typeof(kv->'ICARE_INTERNAL_TASKS_V1') = 'array' then kv->'ICARE_INTERNAL_TASKS_V1' else '[]'::jsonb end) with ordinality x),
t2 as (
  select n, j, j->>'id' legacy_id, nullif(btrim(j->>'title'), '') title, nullif(btrim(j->>'owner'), '') owner, j->>'status' status_raw, j->>'category' category,
         j->>'dueDate' due_raw,
         case when j->>'dueDate' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])' then left(j->>'dueDate', 10) end due_iso
  from t),
t3 as (
  select t2.*,
    count(*) over (partition by legacy_id) > 1 and row_number() over (partition by legacy_id order by n) > 1 as dup_in_snapshot,
    -- deliberately STRICT: any existing task with the same title (case-insensitive, any due date, any source) counts as a duplicate. The apply guard demands 0
    -- duplicates, so a title collision can only make the run abort for review — never let a duplicate through (this also covers an earlier iCare batch).
    exists (select 1 from public.executive_tasks e where lower(btrim(e.title)) = lower(t2.title)) as nat_dup,
    (t2.status_raw is distinct from '已完成' and t2.due_iso is not null
       and t2.due_iso < to_char((now() at time zone 'Asia/Dubai')::date, 'YYYY-MM-DD')) as past_due_open,
    case t2.category when '财务' then 'COMPANY_ADMIN' when '行政' then 'COMPANY_ADMIN' when '采购' then 'TRADE' when '销售' then 'TRADE' else 'OTHER' end as business_area_will_be,
    case t2.status_raw when '进行中' then 'in_progress' when '等待他人' then 'in_progress' when '已完成' then 'completed' else 'open' end as status_will_be,
    coalesce(nullif(btrim(t2.j->>'blocker'), ''), case when t2.status_raw = '等待他人' then '${WAIT_MARK}' end) as blocker_will_be
  from t2),
t4 as (
  select t3.*, case when title is null then 'blocked_no_title'
                    when dup_in_snapshot or nat_dup then 'skip_duplicate'
                    else 'migrate' end as verdict
  from t3)`;

// ───────────────────────── 00_dryrun.sql ─────────────────────────
const blocks = {
  D1: `-- D1 summary — FINAL SCOPE: only the 3 internal tasks migrate. Everything else is reported so the guards in 10_apply_batch.sql have something to compare with.
${COMMON}
select section, metric, value from (
  select 'internal tasks -> executive_tasks' section, x.key metric, x.value::int as value, 1 o from (select jsonb_build_object(
      '01 source rows', count(*), '02 will migrate', count(*) filter (where verdict = 'migrate'),
      '03 existing duplicate (skipped)', count(*) filter (where verdict = 'skip_duplicate'), '04 blocked: no title', count(*) filter (where verdict = 'blocked_no_title'),
      '05 info: missing owner', count(*) filter (where owner is null), '06 info: due date unparseable', count(*) filter (where due_raw is not null and btrim(due_raw) <> '' and due_iso is null),
      '07 open tasks with a PAST due date -> due_at will be CLEARED', count(*) filter (where verdict = 'migrate' and past_due_open),
      '08 will be business_area COMPANY_ADMIN', count(*) filter (where verdict = 'migrate' and business_area_will_be = 'COMPANY_ADMIN'),
      '09 will be business_area TRADE', count(*) filter (where verdict = 'migrate' and business_area_will_be = 'TRADE'),
      '10 will be business_area OTHER', count(*) filter (where verdict = 'migrate' and business_area_will_be = 'OTHER'),
      '11 will be status completed', count(*) filter (where verdict = 'migrate' and status_will_be = 'completed'),
      '12 will be status in_progress (incl. waiting-for-others)', count(*) filter (where verdict = 'migrate' and status_will_be = 'in_progress'),
      '13 will be status open', count(*) filter (where verdict = 'migrate' and status_will_be = 'open')) m from t4) q, jsonb_each_text(q.m) x
  union all
  select 'NOT migrated (decision)', x.key, x.value::int, 2 from (select jsonb_build_object(
      '01 projects (source rows) — all skipped', coalesce((select src_projects from src), 0), '02 projectFollowUps (source rows) — all skipped', coalesce((select src_followups from src), 0),
      '03 history (source rows) — reconciliation only', coalesce((select src_history from src), 0)) m) q, jsonb_each_text(q.m) x
  union all
  select 'target tables NOW (guard baseline)', x.key, x.value::int, 3 from (select jsonb_build_object(
      '01 executive_tasks', (select count(*) from public.executive_tasks), '02 crm_projects', (select count(*) from public.crm_projects),
      '03 crm_followups', (select count(*) from public.crm_followups)) m) q, jsonb_each_text(q.m) x
) s order by o, metric;`,

  D2: `-- D2 the internal tasks, one row each, with what each will become
${COMMON}
select legacy_id as icare_task_id, title, j->>'description' as description, category, owner, status_raw as status, due_raw as due_date_raw, verdict,
       business_area_will_be, status_will_be, blocker_will_be,
       case when due_iso is null then 'NULL (no parseable due date)' when past_due_open then 'NULL (cleared: open and already past; original kept in legacy_payload)' else due_iso || ' 09:00 Asia/Dubai (kept)' end as due_at_will_be
from t4 order by n;`,
};
let dry = `-- iCare -> GCI  DRY-RUN — FINAL SCOPE   (STRICTLY READ-ONLY: 2 independent SELECT blocks, writes nothing, needs no new columns)
-- Source : public.icare_snapshots (id='v1') -> data->'kv' -> ICARE_INTERNAL_TASKS_V1 (+ sizes of ICARE_PROJECTS_V1 / ICARE_HISTORY_V1 for the guards)
-- Run D1 and D2 separately in the Supabase SQL Editor — the editor shows only the last result of a run.
-- GENERATED by tools/build-icare-sql.mjs from the same rule set as 10_apply_batch.sql. Do not edit one without the other.
`;
for (const [k, v] of Object.entries(blocks)) dry += `\n-- ═══════════════════════════════ [${k}] ═══════════════════════════════\n${v}\n`;
fs.writeFileSync(OUT + '00_dryrun.sql', dry);

// ───────────────────────── 10_apply_batch.sql ─────────────────────────
const apply = String.raw`-- iCare -> GCI  APPLY (tasks only)   PREPARED, NOT EXECUTED.
-- Migrates the 3 internal tasks into executive_tasks. Writes ONLY data_migration_batches and executive_tasks (INSERT only — no UPDATE/DELETE of any existing
-- row; crm_projects, crm_followups, crm_customers and icare_snapshots are never touched). One transaction; any guard failure aborts everything.
-- Requires supabase/migrations/20260921000200_icare_tasks_schema.sql to be applied first.  Rollback: 20_rollback_batch.sql (by the batch id printed at the end).
--
-- FINAL SCOPE (Chris, 2026-09) — real Production dry-run:
--   MIGRATE : 3 internal tasks -> executive_tasks   (existing duplicates 0; open tasks with a past due date 2 -> due_at cleared, original kept in legacy_payload)
--   DO NOT MIGRATE : 19 projects (0 migrate / 19 skip) · 6 projectFollowUps (0 / 6 skip) · 21 history (0)
--   executive_tasks 6 -> 9 ; crm_projects stays 0 ; crm_followups stays 1
--   category -> business_area: 行政 -> COMPANY_ADMIN, 销售 -> TRADE (财务 -> COMPANY_ADMIN, 采购 -> TRADE, 系统/other -> OTHER); category stays in legacy_payload
--   owner (e.g. 本人) is copied as text into executive_tasks.owner — no user lookup, no UUID guessing
--   等待他人 -> in_progress + blocker (explicit marker text if iCare stored none) ; 已完成 stays completed with completed_at = NULL (never guessed) ; 待处理 -> open

begin;

-- ── APPROVAL + EXPECTED NUMBERS (fixed by the approved dry-run) ──
create temp table _params on commit drop as select
  false     as execution_approved,          -- flip to true ONLY when you are actually executing this run
  3::int    as expect_source_tasks,         -- the snapshot must still look exactly like the dry-run
  19::int   as expect_source_projects,
  6::int    as expect_source_followups,
  21::int   as expect_source_history,
  3::int    as expect_migrate,              -- tasks that will be written
  0::int    as expect_duplicate,            -- tasks that already exist in executive_tasks
  2::int    as expect_past_due_cleared,     -- open tasks whose past due_at is cleared
  6::int    as expect_pre_executive_tasks,  -- Production before the run
  0::int    as expect_pre_crm_projects,
  1::int    as expect_pre_crm_followups;    -- after: executive_tasks = pre + expect_migrate = 9 ; crm_projects and crm_followups unchanged

-- ── CONFIG + PRE-STATE GUARD ──
do $$
declare e record; a int; b int; c int; have int;
begin
  select * into e from _params;
  if not e.execution_approved then
    raise exception 'refusing to run: execution_approved is false. This script is prepared, not approved. Flip it in _params only for the real run.';
  end if;
  if to_regclass('public.data_migration_batches') is null then raise exception 'refusing to run: public.data_migration_batches is missing (apply 20260921000200_icare_tasks_schema.sql first)'; end if;
  select count(*) into have from information_schema.columns where table_schema = 'public' and table_name = 'executive_tasks'
     and column_name in ('owner','blocker','logs','legacy_source','legacy_id','legacy_payload','migration_batch_id');
  if have <> 7 then raise exception 'refusing to run: executive_tasks is missing schema columns (% of 7 present) — apply 20260921000200_icare_tasks_schema.sql first', have; end if;
  select count(*) into a from public.executive_tasks; select count(*) into b from public.crm_projects; select count(*) into c from public.crm_followups;
  if a <> e.expect_pre_executive_tasks or b <> e.expect_pre_crm_projects or c <> e.expect_pre_crm_followups then
    raise exception 'PRE-STATE guard failed: executive_tasks=% crm_projects=% crm_followups=% but the dry-run saw % / % / %. Re-run the dry-run before executing.', a, b, c, e.expect_pre_executive_tasks, e.expect_pre_crm_projects, e.expect_pre_crm_followups;
  end if;
end $$;

-- ── STAGE (reads only; nothing real is written yet) ──
create temp table stg_tasks on commit drop as
${COMMON}
select t4.* from t4;

create temp table _src on commit drop as
${COMMON}
select * from src;

-- ── GUARD 1: the snapshot and the staged rows must equal the approved dry-run ──
do $$
declare e record; s record; mig int; dup int; blk int; cleared int; c_wait int; c_done int; c_open int; a_admin int; a_trade int;
begin
  select * into e from _params; select * into s from _src;
  if s.src_tasks is distinct from e.expect_source_tasks or s.src_projects is distinct from e.expect_source_projects
     or s.src_followups is distinct from e.expect_source_followups or s.src_history is distinct from e.expect_source_history then
    raise exception 'GUARD 1 failed (source): snapshot now has tasks=% projects=% follow-ups=% history=% but the dry-run saw % / % / % / %. The iCare data changed — re-run the dry-run.',
      s.src_tasks, s.src_projects, s.src_followups, s.src_history, e.expect_source_tasks, e.expect_source_projects, e.expect_source_followups, e.expect_source_history;
  end if;
  select count(*) filter (where verdict = 'migrate'), count(*) filter (where verdict = 'skip_duplicate'), count(*) filter (where verdict = 'blocked_no_title'),
         count(*) filter (where verdict = 'migrate' and past_due_open),
         count(*) filter (where verdict = 'migrate' and status_raw = '等待他人'), count(*) filter (where verdict = 'migrate' and status_will_be = 'completed'),
         count(*) filter (where verdict = 'migrate' and status_will_be = 'open'),
         count(*) filter (where verdict = 'migrate' and business_area_will_be = 'COMPANY_ADMIN'), count(*) filter (where verdict = 'migrate' and business_area_will_be = 'TRADE')
    into mig, dup, blk, cleared, c_wait, c_done, c_open, a_admin, a_trade from stg_tasks;
  if mig <> e.expect_migrate or dup <> e.expect_duplicate or blk <> 0 or cleared <> e.expect_past_due_cleared then
    raise exception 'GUARD 1 failed (tasks): migrate=% duplicate=% blocked=% cleared_due_dates=% but the approved dry-run says % / % / 0 / %.', mig, dup, blk, cleared, e.expect_migrate, e.expect_duplicate, e.expect_past_due_cleared;
  end if;
  -- the 3 tasks Chris confirmed: 1 waiting-for-others (行政), 1 completed (销售), 1 pending (销售)  =>  COMPANY_ADMIN 1, TRADE 2
  if c_wait <> 1 or c_done <> 1 or c_open <> 1 or a_admin <> 1 or a_trade <> 2 then
    raise exception 'GUARD 1 failed (content): waiting=% completed=% open=% COMPANY_ADMIN=% TRADE=% but the confirmed tasks are 1 / 1 / 1 / 1 / 2.', c_wait, c_done, c_open, a_admin, a_trade;
  end if;
end $$;

-- ── WRITE ──
create temp table _batch on commit drop as select gen_random_uuid() as id;
insert into public.data_migration_batches (id, name, source) select id, 'icare-internal-tasks-v1', 'icare_snapshots:v1' from _batch;

insert into public.executive_tasks (title, description, business_area, status, priority, due_at, source, created_at, updated_at, completed_at,
                                    owner, blocker, logs, legacy_source, legacy_id, legacy_payload, migration_batch_id)
select s.title, nullif(s.j->>'description', ''), s.business_area_will_be, s.status_will_be, 'P3',
       case when s.due_iso is not null and s.past_due_open is not true then (s.due_iso || ' 09:00')::timestamp at time zone 'Asia/Dubai' end,
       'icare_internal_tasks',
       coalesce(case when s.j->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then (s.j->>'createdAt')::timestamptz end, now()),
       coalesce(case when s.j->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then (s.j->>'createdAt')::timestamptz end, now()),
       null,                              -- completed_at: iCare stores NO real completion time, so it is never guessed (status stays completed; original state/dates live in legacy_payload)
       s.owner, s.blocker_will_be,
       case when jsonb_typeof(s.j->'logs') = 'array' then s.j->'logs' else '[]'::jsonb end,
       'icare:ICARE_INTERNAL_TASKS_V1', s.legacy_id, s.j, (select id from _batch)
from stg_tasks s where s.verdict = 'migrate'
on conflict (legacy_source, legacy_id) where legacy_id is not null do nothing;

-- ── GUARD 2: what was written == the approved numbers, and nothing else moved ──
do $$
declare e record; bid uuid; w int; total int; nproj int; nfu int; cleared int; kept int; fake_done int; c_done int; c_prog int; c_open int; a_admin int; a_trade int;
begin
  select id into bid from _batch; select * into e from _params;
  select count(*) into w from public.executive_tasks where migration_batch_id = bid;
  select count(*) into total from public.executive_tasks; select count(*) into nproj from public.crm_projects; select count(*) into nfu from public.crm_followups;
  if w <> e.expect_migrate then raise exception 'GUARD 2 failed: wrote % task(s), expected %. Aborting — nothing is committed.', w, e.expect_migrate; end if;
  if total <> e.expect_pre_executive_tasks + e.expect_migrate then raise exception 'GUARD 2 failed: executive_tasks is now % (expected % + % = %).', total, e.expect_pre_executive_tasks, e.expect_migrate, e.expect_pre_executive_tasks + e.expect_migrate; end if;
  if nproj <> e.expect_pre_crm_projects or nfu <> e.expect_pre_crm_followups then raise exception 'GUARD 2 failed: crm_projects=% crm_followups=% changed (expected % / % — this run must not touch them).', nproj, nfu, e.expect_pre_crm_projects, e.expect_pre_crm_followups; end if;
  select count(*) filter (where due_at is null and legacy_payload->>'dueDate' is not null), count(*) filter (where due_at is not null),
         count(*) filter (where status = 'completed'), count(*) filter (where status = 'in_progress' and coalesce(blocker, '') <> ''), count(*) filter (where status = 'open'),
         count(*) filter (where business_area = 'COMPANY_ADMIN'), count(*) filter (where business_area = 'TRADE')
    into cleared, kept, c_done, c_prog, c_open, a_admin, a_trade from public.executive_tasks where migration_batch_id = bid;
  select count(*) into fake_done from public.executive_tasks where migration_batch_id = bid and completed_at is not null;
  if fake_done <> 0 then raise exception 'GUARD 2 failed: % migrated task(s) carry a completed_at — iCare has no real completion time, it must stay NULL.', fake_done; end if;
  if cleared <> e.expect_past_due_cleared or kept <> 1 or c_done <> 1 or c_prog <> 1 or c_open <> 1 or a_admin <> 1 or a_trade <> 2 then
    raise exception 'GUARD 2 failed (content): cleared_due=% kept_due=% completed=% waiting=% open=% COMPANY_ADMIN=% TRADE=% (expected % / 1 / 1 / 1 / 1 / 1 / 2).', cleared, kept, c_done, c_prog, c_open, a_admin, a_trade, e.expect_past_due_cleared;
  end if;
  update public.data_migration_batches set status = 'completed', finished_at = now(),
         counts = jsonb_build_object('written', jsonb_build_object('executive_tasks', w, 'crm_projects', 0, 'crm_followups', 0),
                                     'executive_tasks_before', e.expect_pre_executive_tasks, 'executive_tasks_after', total,
                                     'past_due_dates_cleared', cleared, 'source', (select to_jsonb(s) from _src s))
   where id = bid;
end $$;

select b.id as batch_id_keep_this_for_rollback, b.status, b.counts from public.data_migration_batches b join _batch on _batch.id = b.id;

commit;
`;
fs.writeFileSync(OUT + '10_apply_batch.sql', apply);

// ───────────────────────── 20_rollback_batch.sql ─────────────────────────
const rb = String.raw`-- iCare -> GCI  ROLLBACK OF THE TASKS BATCH   PREPARED, NOT EXECUTED.
-- Deletes only executive_tasks rows carrying this migration_batch_id. Never touches icare_snapshots or any row without the batch id.
-- 1) paste the batch id printed by 10_apply_batch.sql   2) run   3) if it refuses because migrated tasks were edited afterwards, decide, then set v_force.
begin;
do $$
declare
  v_batch uuid := '00000000-0000-0000-0000-000000000000';   -- <<< PASTE THE BATCH ID
  v_force boolean := false;                                 -- true = also delete migrated tasks that people edited after the migration
  b record; edited int; n int;
begin
  if v_batch = '00000000-0000-0000-0000-000000000000' then raise exception 'paste the batch id first'; end if;
  select * into b from public.data_migration_batches where id = v_batch;
  if not found then raise exception 'no such batch %', v_batch; end if;
  if b.status = 'rolled_back' then raise exception 'batch % is already rolled back', v_batch; end if;

  select count(*) into edited from public.executive_tasks where migration_batch_id = v_batch and updated_at > b.finished_at + interval '1 minute';
  if edited > 0 and not v_force then
    raise exception 'refusing: % migrated task(s) were edited after the migration (the Internal Tasks tab now writes to executive_tasks). Review them, then set v_force := true.', edited;
  end if;

  delete from public.executive_tasks where migration_batch_id = v_batch; get diagnostics n = row_count;
  update public.data_migration_batches set status = 'rolled_back', rolled_back_at = now(),
         notes = coalesce(notes || ' | ', '') || format('rolled back: %s task(s) removed', n) where id = v_batch;
  raise notice 'rolled back batch %: % task(s) deleted', v_batch, n;
end $$;
commit;
`;
fs.writeFileSync(OUT + '20_rollback_batch.sql', rb);
console.log('written:', ['00_dryrun.sql', '10_apply_batch.sql', '20_rollback_batch.sql'].map((f) => f + ' ' + fs.statSync(OUT + f).size + 'B').join(' | '));
