# Retirement candidates — status record

**Code side: DONE in the working tree (2026-09-20, uncommitted until the release).** Items 1 and the cloudSync files below are already deleted from the code; only the database side (table drops, Edge Function, `icare_snapshots`) is still open and stays gated as described.

## 1. `service_receivable_refs` — code retirement (approved) — CODE DONE (panel + endpoint deleted, `ReceivablesPanel.tsx` edited)

**Decision (Chris):** REMOVE_LATER. Do **not** fix `SUPABASE_URL`, do **not** revive the feature.
**Evidence:** 0 rows in Production. `api/bs/service-receivable-ref.ts` reads `process.env.SUPABASE_URL`, but `gci-platform-shell` only has `VITE_SUPABASE_URL`, so after the login check every call returns `500 server_config_missing` — it never worked in Production. It also uses the service role after only a module check, the wrong pattern to revive. No cron and no other caller in this repo.

| # | file | action |
|---|---|---|
| 1 | `modules/business-solutions/components/BSReceivableRefPanel.tsx` (364 lines) | **delete** (imported only by `ReceivablesPanel.tsx`) |
| 2 | `api/bs/service-receivable-ref.ts` (97 lines) | **delete** |
| 3 | `modules/business-solutions/components/ReceivablesPanel.tsx` | remove the import (line 6) and the `<BSReceivableRefPanel … />` block (≈ lines 372–379, 8 lines: `lang`, `receivableId`, `quoteId`, `customerId`, `customerName`, `onToast`); nothing else in the file depends on it |
| 4 | table `service_receivable_refs` | **later**: drop in a ledgered migration after `ops.migration_ledger` exists (kept for now, 0 rows). No baseline is written for it, and there is no SQL file for it in the repo to remove (it was created by hand). |

Verify after the code change: `npx tsc -b` = 232 (baseline) · full build with the two Supabase env vars · the receivables list still expands · `POST /api/bs/service-receivable-ref` returns 404 after deploy.
Before deleting the table, confirm no external caller (Make.com / bookmarks): anonymous calls already return 401, so a real integration would already be failing.

## 2. `icare_snapshots` + Edge Function `quick-api` + DEAL — decommission after the shell stops calling quick-api

Target for DEAL (Vercel `deal`, GitHub `chenhuirong04-ui/deal`, `deal-zeta-brown`): **DECOMMISSION_AFTER_QUICK_API_REMOVAL**. No observation period: once the code dependency is zero and the JSON archive exists, it is retired.
The full analysis, the Level 1 code change (history / projects / CSV / KV chain), the dead-link and frozen-reader clean-up and the numbered blocker list are in `proposals/icare/QUICK_API_REMOVAL_PLAN.md`. Summary of the order:
3 tasks migrated → Internal Tasks tab on `executive_tasks` → shell KV chain removed (no local-only fallback) → JSON archive of `icare_snapshots` → grep + Network check show no quick-api call → delete the `deal` Vercel project → archive the GitHub repo → delete the Edge Function and `ICARE_GATE_PASSWORD` → drop `icare_snapshots` (ledgered migration).
Other dead code: `modules/crm/services/cloudSync.ts` and `modules/trade/services/cloudSync.ts` (0 imports) — DELETED.
`icare-supply` and `icare-dubai` are separate iCare-family projects, not in the quick-api origin list, so they cannot be callers.

## 3. Other records
`transactions_cleanup` stays in `ops/data-fixes/` as **UNCONFIRMED** (7 rows ≠ 8) — not registered as executed. The earlier full-scope iCare project proposals were dropped.
