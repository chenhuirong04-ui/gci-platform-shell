# Internal Tasks tab → executive_tasks (IMPLEMENTED in the working tree, uncommitted)

**Status 2026-09-20.** All rows of the change list below are implemented (`InternalTasksView.tsx`, `executiveTasks.ts`, i18n zh/en, `CrmModule.tsx`, `modules/crm/types.ts`; `persistenceService.ts` deleted). Verified: typecheck without new errors, full build, and a jsdom test of the real view against a Postgres (PGlite) database built from the repo's own migrations and the real apply script — 3 migrated rows show in the right columns, editing a title of the completed task leaves `completed_at` NULL, `waiting` without a blocker is refused, create writes `source = crm_internal_tasks`. The text below is the original plan.

Goal (Chris): the shell CRM "内部事项 / Internal Tasks" tab stops using `ICARE_INTERNAL_TASKS_V1` and reads/writes `executive_tasks` instead; UI as unchanged as possible.

## Today
`InternalTasksView.tsx:57 load / :64 save (whole array, on every change)` → `PersistenceService.load/save` (`persistenceService.ts:78 / :108`, cloud only if a gate password is set, `:32`) → `cloudStore.ts:100/106 cloudPullAllKV/cloudPushAllKV` → `cloudStore.ts:27 supabase.functions.invoke('quick-api')` → Edge Function → `icare_snapshots` (id `v1`).
Also `CrmModule.tsx:459` loads the same key and throws the result away (the destructuring keeps only `[t, p]`).

## Change list (5 files; +2 optional)

| file | change |
|---|---|
| `apps/shell/src/lib/executiveTasks.ts` | `ExecutiveTask` gets `owner`, `blocker`, `logs`. `createExecutiveTask` accepts `status`, `owner`, `blocker`, `source` (default stays `business_assistant`; the tab passes `crm_internal_tasks`). **New `updateExecutiveTask(id, patch)`** (title, description, business area, status, owner, blocker, due date; sets `updated_at`; sets/clears `completed_at`) — today only status / due-date / delete exist. Two small helpers: date-input ↔ `due_at` (09:00 Asia/Dubai) and column ↔ status (below). |
| `modules/crm/components/InternalTasksView.tsx` | Replace only the data layer: drop `PersistenceService` + the `InternalTask*` types + both effects (load, save-on-every-change); load with `getExecutiveTasks()`, create/edit with the create/update API, add loading + error state. Layout, cards, colours, modal unchanged. Category select becomes the 6 `business_area` values (`BUSINESS_AREA_LABEL_ZH/…`). Owner default = signed-in user's display name (was the literal 本人). No delete (same as today). |
| `modules/crm/CrmModule.tsx` | Delete the `ICARE_INTERNAL_TASKS_V1` constant (`:38`) and the unused third load (`:459`). The History / Projects KV chain is removed in the **same release** — see `QUICK_API_REMOVAL_PLAN.md` Level 1 (it is not made local-only). |
| `modules/crm/services/persistenceService.ts` | Deleted entirely in Level 1 (`QUICK_API_REMOVAL_PLAN.md`) together with `cloudStore.ts`, `exportService.ts` and `HistoryView.tsx`; the `ICARE_INTERNAL_TASKS_V1` key then stays in the snapshot untouched (archive) and is never read or written again. |
| `packages/i18n/src/locales/zh.ts` + `en.ts` | `internalTasks`: add the blocker label + placeholder (2 keys per locale). |
| *(optional)* `modules/crm/types.ts` | Remove `InternalTask*` types (`:259–277`) once unused. |
| *(optional)* i18n | Remove the now-unused `category*` keys. |

Column ↔ status (no new status value; `/tasks`, Home and the daily brief keep working):
待处理 = `open` · 进行中 = `in_progress` and no blocker · **等待他人 = `in_progress` and a non-empty blocker** (choosing it asks for the blocker text) · 已完成 = `completed` (and `cancelled`).

## Not changed
`navigation.ts:191`, `Tasks.tsx`, Home KPIs, `dailyBrief`, `actionCenter` (they already read `executive_tasks`; new columns are ignored by `select('*')`).

## Order
1. tasks schema (`20260921000200_icare_tasks_schema.sql`) → 2. approve + run `10_apply_batch.sql` (3 rows) → 3. deploy the code → 4. verify → 5. re-run dry-run D1: everything reads "existing duplicate", nothing new.
Until step 3 the old tab still shows the snapshot version, so nothing is lost in between; any task added in the old UI during that window is not migrated (the source guard would flag it: the snapshot would have more than 3 tasks).

## Verify
`cd apps/shell && npx tsc -b` = 232 errors (baseline, no new ones) · full build **with** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (a build without them is an empty shell) · logged in as Chris: the tab shows the 3 tasks (1 in 等待他人, 1 completed, 1 pending), create / edit / move between columns persist and also appear in `/tasks` and Home · the browser Network tab shows **no** `quick-api` request from this tab.

## Devices (decided by Chris)
No "import this browser's old tasks" banner. Before the switch Chris and Lili each open the OLD Internal Tasks tab once: if it shows exactly the 3 tasks above, switch; if an extra task exists in someone's browser, it is exported and handled separately.

## Notes fixed by Chris (2026-09)
* The tab is **not** made local-only and `PersistenceService` is **not** turned into a localStorage store — the cloud KV chain is removed (see `QUICK_API_REMOVAL_PLAN.md`).
* The migrated completed task has `completed_at = NULL`. Nothing in the UI may depend on it: `/tasks`, Home and the daily brief do not read `executive_tasks.completed_at`. Only a task completed **in the new UI** gets a real `completed_at` (`updateExecutiveTask` sets it at that moment).
* A real iCare blocker text is shown as written; the marker text appears only when iCare had none.
