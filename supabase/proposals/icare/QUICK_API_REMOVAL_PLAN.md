# quick-api removal from the shell — Level 1 IMPLEMENTED in the working tree (uncommitted); Level 2/3 still open

**Status 2026-09-20.** Level 1 is done: the shell has no quick-api call, no `PersistenceService` / `cloudStore` / `cloudPullAllKV`, and `HistoryView` / `exportService` / `supabaseClient` are deleted. Legacy CRM tabs (dashboard / comms / history / project) and `/crm/customer/*` redirect to `/crm-customers` outside the demo build. Sections 2–3 below are the original plan text. **Level 3 readers are also done (2026-09-20):** `DailyWorkbench`, the AIPage daily-brief / customer-360 sections and its update-status / create-customer / register-quotation follow-up flows now read and write the formal CRM (`crm_customers`, `crm_contacts`, `crm_followups`) through `crmSupabase.ts`; `crmLocalStore.ts`, the dead `PasswordGate` (which wrote `ICARE_GATE_PASSWORD`) and Trade's unused `cloudStore.ts` (Google Apps Script) are deleted. No runtime `ICARE_*` key is read or written anywhere. The dead `cloudSync.ts` files are deleted. Deep links to old CRM tabs still exist in a few files and land on `/crm-customers` through the redirect.

**Goal (Chris):** the GCI Platform shell never calls `quick-api` again. No "local-only" replacement: the old cloud KV chain is removed, not downgraded.
Cloud KV chain today: `PersistenceService` → `cloudStore` → `supabase.functions.invoke('quick-api')` → `icare_snapshots`.

## 1. Read-only findings (evidence)

| question | answer |
|---|---|
| Does anything still **refresh** `ICARE_HISTORY_V1`? | **No.** `PersistenceService.overwriteFromNotion` has 0 callers and `api/crm/notion-sync` has 0 front-end callers — the writer was the old DEAL app. The 21 records are DEAL's last write: a frozen Notion cache. |
| Which real UI needs `ICARE_HISTORY_V1` (`tasks`) in `CrmModule`? | Only the legacy tabs `dashboard` (CustomerDirectory), `comms` (FollowUpQueue), `history` (HistoryView), `project` (BusinessRegister / kanban), the `/crm/customer/:code` workspace + business-detail routes, and the last legacy block of ControlCenter (成交漏斗, `activeTasks`, `ControlCenter.tsx:223`). **None is reachable from the sidebar any more**: `CP` was repointed to the Supabase page `/crm-customers` (Task 17.2); only `BO` (`/crm?tab=control`) and `IT` (`/crm?tab=internal`) enter `/crm`. They are reached only through deep links (§4). |
| Which real UI needs `ICARE_PROJECTS_V1` (`projects`)? | ProjectProgress kanban / project detail only. "手动建档" is hidden (comment in `ProjectProgress.tsx`), the array is never read back, and all 19 projects are abandoned. **No business value → retire.** |
| CSV export | `HistoryView` → `exportToCSV` → `cloudPullAllKV` (quick-api). It exports the stale cache; `HistoryView` has no visible entry (only `?tab=history`). **Retire with HistoryView.** No replacement is built unless Chris wants a CSV of the formal CRM data (then from `crmSupabase`, never from the cache). |
| Formal data source that already exists | `/crm-customers` (`CrmCustomers.tsx` → `crmSupabase.ts`: `getCustomerDirectory`, `getTodaysFollowups`, `getOverdueFollowups`, `getRecentFollowupsWithNotes`, `findCustomerByName`, `logFollowup`, `createCustomerWithContact`, …) and the tables `crm_customers / crm_contacts / crm_followups / crm_projects`. ControlCenter already reads them for every number except the funnel. |
| Do other places read the cache without quick-api? | Yes, the **browser copy** (`localStorage['ICARE_HISTORY_V1']`): `DailyWorkbench.tsx:132` (AIPage), `crmLocalStore.ts` (AIPage Daily Brief + Customer 360), `AIPage.tsx:3175` and `:4565`. They never call quick-api, and with nothing refreshing the cache they already show frozen or empty data. Not blockers for retiring quick-api; §4 lists the clean-up. |
| Size of the legacy CRM UI | `modules/crm` = 18,254 lines; ControlCenter + InternalTasksView + ErrorBoundary = 742. Every one of the 32 files in `modules/crm/components` is imported only inside `modules/crm`, so removing legacy UI cannot break another module. |
| Demo mode | `DemoEntry` renders `<CrmModule demoMode />` only in a separate build (`VITE_DEMO_MODE=true`, `/api` blocked). It uses the legacy tabs with synthetic data, so deleting the legacy UI also removes the demo. Not a production concern → **Chris to decide** (§3). |

## 2. Level 1 — the shell stops calling quick-api (one code change, together with the Internal Tasks switch)

| file | change |
|---|---|
| `modules/crm/CrmModule.tsx` | delete `import { PersistenceService }` (`:6`) and the three `ICARE_*_V1` constants (`:36–38`) · in the load effect (`:445–471`) keep only the `demoMode` branch and delete the `PersistenceService.load(...)` block (`:452–470`) so `tasks` and `projects` stay `[]` outside demo · delete both save effects (`:479–491`) · delete the `HistoryView` import (`:14`) and the `activeTab === 'history'` branch (`:1295…`) · **redirect** (only when `!demoMode`): a requested tab in {`dashboard`,`comms`,`history`,`project`} (initial tab `:256`, prop sync `:264`) or a path under `/crm/customer` → `navigate('/crm-customers', { replace: true })`; the three ControlCenter callbacks (`:1196–1202`) also go to `/crm-customers` |
| `modules/crm/components/ControlCenter.tsx` | remove the 成交漏斗 block that needs `activeTasks` (`:223–229`) and the buttons that call `onTabSwitch('dashboard'/'project'/'history')`, `onSelectTask`, `onSelectBusiness` (or point them at `/crm-customers`); the `tasks` / `projects` props go away |
| **delete** | `modules/crm/services/persistenceService.ts` (223 lines) · `services/cloudStore.ts` (112) · `services/exportService.ts` · `components/HistoryView.tsx` (823) · `services/supabaseClient.ts` if nothing else imports it |
| `modules/crm/components/InternalTasksView.tsx` (+ `executiveTasks.ts`, i18n) | per `INTERNAL_TASKS_SWITCH_PLAN.md` |

**Done when:** `grep -rn "quick-api\|PersistenceService\|cloudStore\|cloudPullAllKV" apps modules packages api` returns nothing · `npx tsc -b` = 232 (baseline) · full build with the two Supabase env vars · in a logged-in session that opens 业务总览 and 内部事项 the browser Network tab shows **no** request to `/functions/v1/quick-api`.
Demo mode keeps working (in-memory demo data) because its branch is kept.

## 3. Level 2 — remove the legacy CRM UI (separate commit, after Level 1)
Delete everything in `modules/crm` except ControlCenter, InternalTasksView, ErrorBoundary and what they import (≈ 17.5k of 18.3k lines), shrink `CrmModule.tsx` (1,466 lines) to the two live tabs, and drop the now-unused legacy services (`claudeService`, `geminiService`, `driveService`, `telegramService`, `i18n`) and `adminImportData.ts`.
One decision needed: **retire the demo build too** (`DemoEntry`, `VITE_DEMO_MODE`, `modules/crm/demo/`), or keep the legacy UI only for it.
Also decide the old "新增客户 / 业务" flow (`AIIntakePanel` → `/api/crm/notion-create|notion-write-*`): it lives only inside the legacy tabs. Customers are created at `/crm-customers` (Supabase); if Notion's Follow-up Log still drives Make.com → Telegram reminders, that reminder path needs its own decision.

## 4. Level 3 — no dead links, no frozen readers (does not block quick-api)
Deep links still pointing at legacy tabs → `/crm-customers` (or `/crm?tab=control`):
`aiCapabilityMap.ts:119` (+ fallback text `:127`) · `BusinessLinesOverview.tsx:38` · `ExecutiveOverviewCompact.tsx:54` · `actionCenter.ts:163, :181, :201` · `commitments.ts:197` · `DailyWorkbench.tsx:173, :298` (`?tab=followup` is not even a valid tab) · `CrmModule.tsx:1315, :1339`.
Readers of the frozen browser copy → the formal source:
`DailyWorkbench.tsx:132` and `crmLocalStore.ts` (`getCRMBriefStats`, `getCRMCustomerData`) → `crmSupabase` (`getTodaysFollowups`, `getOverdueFollowups`, `getHighPriorityCustomerCount`, `findCustomerByName`) · `AIPage.tsx:3175` (find the customer for a quote follow-up) → `findCustomerByName` + `logFollowup` · `AIPage.tsx:4565` (customer quote records) → the existing `ai/quotation-history` endpoint / `quotation_records`.

## 5. Final blocker list to retire DEAL / quick-api / icare_snapshots (no observation period)
`deal` target state: **DECOMMISSION_AFTER_QUICK_API_REMOVAL**. Rule (Chris): once the code dependency is zero and the backup exists, retire.

| # | step | owner | ready when |
|---|---|---|---|
| 1 | Migrate the 3 internal tasks | Chris approves the execution list, then run | `10_apply_batch.sql` prepared; tasks schema first |
| 2 | Internal Tasks tab → `executive_tasks` | code | DONE in the working tree; deploy right after the data is in |
| 3 | Level 1 above (History / Projects / CSV / KV chain) | code, same release as 2 | DONE in the working tree; the §3 decisions are only for Level 2 |
| 4 | JSON archive of `icare_snapshots` | Chris | `select data from public.icare_snapshots where id = 'v1';` → download → Drive; record the sha256; open it once |
| 5 | Confirm the shell no longer calls quick-api | code + Chris | grep = 0 · Network tab check · after deploy the function logs show no call from origin `app.globalcareinfo.com` during that test session |
| 6 | Delete the `deal` Vercel project (`prj_vBiXJ5MEKiujJVeU9jeiWfktajOq`, `deal-zeta-brown`); its env (`VITE_GEMINI_API_KEY` = deleted key, `VITE_CLAUDE_API_KEY`, `CLAUDE_API_KEY`) and the old key string in its bundle go with it | Chris confirms nobody uses DEAL | after 5 |
| 7 | Archive the GitHub repo `chenhuirong04-ui/deal` | Chris | after 6 |
| 8 | Disable `quick-api`: delete the Edge Function and the secret `ICARE_GATE_PASSWORD` | Chris (Supabase) | after 4–7 |
| 9 | Drop `icare_snapshots` (ledgered migration) | later | after 4 and 8, once `ops.migration_ledger` exists |
| — | dead code `modules/crm/services/cloudSync.ts`, `modules/trade/services/cloudSync.ts` | code | DONE (deleted; 0 imports) |
