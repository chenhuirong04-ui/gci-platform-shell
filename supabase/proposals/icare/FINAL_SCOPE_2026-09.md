# iCare → GCI — FINAL SCOPE (decided by Chris, 2026-09)

**ONLY MIGRATE: 3 internal tasks → `executive_tasks`.**
**DO NOT MIGRATE: 19 projects · 6 projectFollowUps · 21 history.**

Nothing here has been executed. The tasks schema, the data migration and the code switch each need Chris's approval.

## Real Production numbers (external dry-run) → final decision

| entity | source | migrate | skip / other | why |
|---|---|---|---|---|
| `ICARE_INTERNAL_TASKS_V1` | 3 | **3** | existing duplicates 0 · missing owner 0 · bad date 0 · past-due due dates cleared **2** | the only data that moves |
| `ICARE_PROJECTS_V1` | 19 | **0** | **skip 19** (5 already `deleted=true`; the other 14 still show active in the old snapshot but are finished/cancelled in real business) | no crm_customers created, no mapping, no `crm_projects` |
| `projectFollowUps` | 6 | **0** | **skip 6** (Ray 3 · 123 1 · namas 1 · 166 1 — all under deleted projects) | no `crm_followups` iCare fields; a future `project_id` is proper CRM product design, not an iCare leftover |
| `ICARE_HISTORY_V1` | 21 | **0** | reconciliation only | old Notion cache; keep one **JSON archive** of the snapshot before `icare_snapshots` is ever deleted |

## The 3 tasks and what each becomes

| # | task (as reported: title — description) | iCare status / category / due | → `executive_tasks` |
|---|---|---|---|
| 1 | 展厅物品清理 — 跟进清场退押金 | 等待他人 · 行政 · 2026-05-18 | `business_area = COMPANY_ADMIN` · `status = in_progress` · `blocker` = iCare's text, or the marker "等待他人（自 iCare 迁移，原无阻塞说明）" if iCare stored none · **`due_at = NULL`** (open and past; original in `legacy_payload`) |
| 2 | 布鲁克玩具亚马逊线上授权 — 跟进授权资质 | 已完成 · 销售 · 2026-05-18 | `TRADE` · **`completed`** (kept) · `due_at = 2026-05-18 09:00 Asia/Dubai` kept · **`completed_at = NULL`** (iCare has no real completion time — nothing is guessed; the original state, created time and due date are in `legacy_payload`) |
| 3 | 社媒矩阵计划书 — 制定完整内容运营方案 | 待处理 · 销售 · 2026-05-18 | `TRADE` · `open` · **`due_at = NULL`** (open and past; original in `legacy_payload`) |

Common: `owner` = the iCare text (e.g. `本人`) copied as-is — **no user lookup, no UUID guessing** · `priority P3` · `source icare_internal_tasks` · `legacy_source icare:ICARE_INTERNAL_TASKS_V1` · `legacy_id` = the iCare task id · the whole original task JSON (incl. `category`, `dueDate`, `logs`) in `legacy_payload`.
"等待他人" has no status of its own in `executive_tasks`; the Internal Tasks tab treats `in_progress + non-empty blocker` as the waiting column. **A real iCare blocker text is always kept**; the marker "等待他人（自 iCare 迁移，原无阻塞说明）" is used only when iCare stored none (accepted by Chris).

## Fixed expected numbers (the guards in `10_apply_batch.sql`)

| | value |
|---|---|
| tasks source / migrate / existing duplicate / past-due due dates cleared | **3 / 3 / 0 / 2** |
| projects / follow-ups / history migrate | **0 / 0 / 0** (source sizes are also guarded: 19 / 6 / 21) |
| `executive_tasks` before → after | **6 → 9** |
| `crm_projects` | stays **0** |
| `crm_followups` | stays **1** |
| content of the 3 written rows | 1 waiting (in_progress + blocker) · 1 completed · 1 open · COMPANY_ADMIN 1 · TRADE 2 · 2 due dates NULL · 1 due date kept · **0 rows with a completed_at** |

## Execution order (each step needs approval; none run)

| # | step | file | writes |
|---|---|---|---|
| 1 | (optional, recommended first) ledger | `supabase/migrations/20260920000000_ops_migration_ledger.sql` | schema |
| 2 | tasks-only schema | `supabase/migrations/20260921000200_icare_tasks_schema.sql` (touches only `executive_tasks` + `data_migration_batches`; **nothing on `crm_*`**) | schema |
| 3 | dry-run D1 + D2 must still match the numbers above | `00_dryrun.sql` | none |
| 4 | flip `execution_approved`, run once | `10_apply_batch.sql` | INSERT 3 rows |
| 5 | code switch of the Internal Tasks tab | `INTERNAL_TASKS_SWITCH_PLAN.md` | code |
| — | undo | `20_rollback_batch.sql` (data) then `supabase/rollbacks/20260921000200_icare_tasks_schema.rollback.sql` (schema) | |

## Guards (all tested on Postgres with the repo's own migrations; 57 checks)

`execution_approved` is false by default · schema columns must exist · PRE-STATE: `executive_tasks 6 / crm_projects 0 / crm_followups 1` · source sizes 3 / 19 / 6 / 21 ·
GUARD 1: migrate 3, duplicate 0, cleared 2 and the confirmed content shape · GUARD 2: written 3, `executive_tasks = 6 + 3`, `crm_projects` and `crm_followups` unchanged, content re-checked, **no migrated task carries a `completed_at`** ·
duplicate rule is strict (same title, case-insensitive, any due date/source ⇒ counts as duplicate ⇒ the run aborts for review) · INSERT only, `icare_snapshots` never touched ·
cannot run twice (pre-state changes) · rollback per batch, refuses if migrated tasks were edited afterwards.

## Still open

`transactions_cleanup` stays **UNCONFIRMED** (7 rows ≠ the 8 its guard requires) — `supabase/ops/data-fixes/verify_20260915_transactions_cleanup.sql` is kept and it is **not** registered as executed.
