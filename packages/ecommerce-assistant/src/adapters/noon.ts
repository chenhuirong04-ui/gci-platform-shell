// GCI Executive Desk — Task 14.2: NOON channel adapter.
//
// PENDING RECONNECT — not a fresh build. A real NOON｜Marketplace Profit
// Agent already exists (local project, analyzes real NOON Seller Lab
// Excel/CSV exports) at C:\Users\Lenovo\Documents\NOON-Marketplace-Profit-Agent
// on a different machine than this session runs on. This environment
// cannot reach that project or its data this round, so — per Chris's
// explicit instruction — this file does NOT reimplement NOON's analysis
// logic and does NOT fabricate any NOON sales/order/profit numbers to fill
// the gap. It returns the same all-null "no real data available right now"
// shape a stub would, but tagged `pending_reconnect` (not `not_connected`)
// so GCI/any consumer can tell "a real integration exists, temporarily
// unreachable" apart from Amazon/Tradeling/Website's "never built".
//
// To actually connect: replace this adapter's method bodies with real reads
// from wherever the reconnected NOON project's data lands (its own export
// files, a database, or a status endpoint of its own, mirroring MIA's
// /api/executive-status pattern from Task 14.1) — the ChannelAdapter
// interface and every downstream consumer (executiveStatusService, GCI)
// need no changes at all when that happens.
import type { ChannelAdapter } from './base';
import { makeStubAdapter } from './stub';

export const noonAdapter: ChannelAdapter = makeStubAdapter('noon', 'pending_reconnect');
