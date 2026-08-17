# @gci/ecommerce-assistant — Task 14.2 Foundation

Multi-channel architecture for the future **E-commerce Assistant / 电商助理**
— the long-term product name that replaces "NOON Agent". NOON becomes one
of four **channels**, not the product itself.

## Status of this round

**Foundation only.** No live dashboard, no GCI wiring, no Production
deployment. Per Task 14.2 §十一/§二十: GCI integration is **pending** and
this package is not imported by `apps/shell` — nothing in the running app
changed.

**NOON = pending reconnect, not active.** A real NOON｜Marketplace Profit
Agent already exists — a local project at
`C:\Users\Lenovo\Documents\NOON-Marketplace-Profit-Agent` on a different
machine than this session runs on, analyzing real NOON Seller Lab
Excel/CSV exports. This environment cannot reach that project or its data.
Per Chris's explicit instruction, this round does **not** reimplement
NOON's analysis logic and does **not** fabricate any NOON numbers to fill
the gap — `adapters/noon.ts` returns the same all-null shape a stub would,
tagged `status: 'pending_reconnect'` so it's distinguishable from
Amazon/Tradeling/Website's `not_connected` (never built vs. real capability
temporarily unreachable). Reconnecting means replacing that one file's
method bodies with real reads — no other file changes.

**Amazon / Tradeling / Website = not_connected.** No API integration
exists for any of them. Their adapters are pure stubs returning
`connected: false`, every metric `null`.

## What's here

- `src/types.ts` — `PlatformSummary` (one per channel), `SkuChannelPerformance`
  (cross-platform SKU row), `PlatformComparison`, `SkuAcrossPlatforms`,
  `EcommerceExecutiveStatus` (mirrors MIA's `/api/executive-status` shape
  from Task 14.1 so GCI can eventually consume both agents the same way).
- `src/adapters/base.ts` — the one `ChannelAdapter` interface every channel
  implements (`getPlatformSummary`/`getSkuPerformance`/`getInventoryAlerts`/
  `getSalesMetrics`/`getIssues`). Adding a 5th channel later means writing
  one new file implementing this interface — nothing else in this package
  needs to change.
- `src/adapters/{noon,amazon,tradeling,website}.ts` — one file per channel.
  All four currently return the stub shape (see above for NOON's distinct
  `pending_reconnect` tag).
- `src/executiveStatusService.ts` — aggregates all four adapters into one
  `EcommerceExecutiveStatus`. Totals are summed only from `connected`
  channels; with zero connected channels every total is `null` (not `0` —
  `0` means "confirmed zero", not "no visibility"). Also exposes
  `getPlatformComparison()` (only `eligible: true` with ≥2 connected
  platforms) and `getSkuAcrossPlatforms(sku)` (only `eligible: true` when
  the SKU is listed on ≥2 connected platforms) — both return an explicit
  "not enough data" reason string instead of a partial/guessed comparison.

## `null` vs `0` vs `'profit_data_incomplete'`

- `null` — no data available (channel not connected, or metric not yet
  synced).
- `0` — connected and confirmed zero (e.g. a connected channel that
  genuinely had zero orders today).
- `net_profit_*: 'profit_data_incomplete'` — revenue is known but at least
  one real cost component (platform fee / ads / returns / landed cost /
  fulfillment) is missing, so no net profit figure is shown rather than an
  underestimate presented as fact.

## Cross-platform questions this shape is built to answer

Once ≥2 channels are connected, `getPlatformComparison()` /
`getSkuAcrossPlatforms()` directly answer: which platform sold best today,
which has the most listed/selling SKUs, which has the highest revenue/net
profit, which has the highest return rate, and — per SKU — which platform
it sells best on, what it sells for on each, which platform is most
profitable/converts best/needs restocking, and which platforms are
worth increasing or cutting ad spend on. With 0-1 connected platforms,
every one of these returns an explicit "not enough data yet" response
instead of guessing.

## Next steps (not this round)

1. Reconnect to the real NOON project (`adapters/noon.ts` only).
2. Decide whether E-commerce Assistant becomes its own repo/Production
   deployment (mirroring MIA) or stays embedded — once it has a stable
   endpoint, `executiveStatusService.getExecutiveStatus()`'s body becomes
   that endpoint's handler.
3. Only then: GCI-side adapter + Home card + Boss Action Center rules +
   Ask GCI wiring, following the exact Task 14.1 MIA pattern.
