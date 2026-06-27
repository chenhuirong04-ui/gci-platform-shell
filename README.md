# GCI Platform — monorepo

Single codebase, single route table, single AppShell for CRM, Trade OS and
Quotation Center. This repo used to be the standalone `gci-platform-shell`
("Daily Workspace" nav shell only); it's now the monorepo root for the full
merge.

## Structure

```
apps/shell/        the host app — router, AppShell, Sidebar, Header, Daily Workspace
modules/crm/        DEAL CRM — migrating Day 4-5
modules/trade/      Trade OS — migrating Day 2-3 (first module)
modules/quotation/  Quotation Center — migrating Day 6 (largest, last)
packages/design-system/  @gci/design-system — single source of truth for all UI tokens/components
packages/i18n/            @gci/i18n — single source of truth for EN/中文 strings
```

`packages/design-system` and `packages/i18n` are no longer vendored copies —
this is the canonical source. Trade OS, DEAL and Quotation each still carry a
vendored snapshot in their own (still-independent) repos until their module
migration lands here; after that, those vendored copies get deleted.

## Routes (target)

```
app.globalcareinfo.com/             Daily Workspace
app.globalcareinfo.com/crm/*        DEAL CRM module
app.globalcareinfo.com/trade/*      Trade OS module
app.globalcareinfo.com/quotation/*  Quotation Center module
```

Until a module migrates, its route renders a placeholder
(`apps/shell/src/pages/ModulePlaceholder.tsx`) — not a redirect to the legacy
domain. Legacy domains (`leads.`/`trade.`/`living.globalcareinfo.com`) stay
live and untouched throughout the merge; nothing is decommissioned until the
new monorepo is verified.

## Commands (run from repo root)

```
npm install     installs all workspaces
npm run dev     starts the shell app (apps/shell)
npm run build   builds the shell app
```
