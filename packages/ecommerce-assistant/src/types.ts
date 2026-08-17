// GCI Executive Desk — Task 14.2: E-commerce Assistant / 电商助理.
// Multi-channel foundation types. This package defines the CONTRACT only —
// no channel adapter here is allowed to invent numbers. A field with no
// real backing value is `null` (no_data), never `0` — `0` means "connected
// and confirmed zero", which is a materially different fact from "we don't
// know". Every consumer (GCI, a future E-commerce Assistant dashboard, Ask
// GCI) must treat null and 0 as distinct.

/** The four channels this foundation is built to support. New channels are
 * added here only — adapters/executiveStatusService never need to change
 * shape when a channel is added, only a new adapter implementing
 * ChannelAdapter is registered. */
export type ChannelName = 'noon' | 'amazon' | 'tradeling' | 'website';

export const CHANNEL_DISPLAY_NAME: Record<ChannelName, string> = {
  noon: 'NOON',
  amazon: 'Amazon',
  tradeling: 'Tradeling',
  website: 'Own Website',
};

/**
 * Connection state of a channel.
 * - not_connected: no integration has ever been built for this channel.
 * - pending_reconnect: a real integration/tool exists (e.g. NOON's local
 *   Seller Lab Excel/CSV analysis project) but this environment cannot
 *   currently reach it. Distinct from not_connected — the capability is
 *   real, the connection is just temporarily unavailable — and distinct
 *   from active, since no live numbers can be shown either way right now.
 * - active: connected and returning real data.
 */
export type ChannelConnectionState = 'not_connected' | 'pending_reconnect' | 'active';

export type AgentHealthStatus = 'healthy' | 'warning' | 'error' | 'no_data';

/** Net profit is only ever a real number once every cost component below is
 * known for the period; otherwise the field must be `profit_data_incomplete`
 * rather than a partial/guessed figure. See PlatformSummary.net_profit_today
 * etc. */
export type ProfitValue = number | 'profit_data_incomplete' | null;

// ─────────────────────────────────────────────────────────────────────────
// Platform Summary — one per channel, per Task 14.2 §三.
// ─────────────────────────────────────────────────────────────────────────
export interface PlatformSummary {
  platform: ChannelName;
  connected: boolean;
  status: ChannelConnectionState;
  last_synced_at: string | null; // ISO 8601, real epoch — never a Dubai-shifted value

  listed_sku_count: number | null;
  selling_sku_count: number | null;

  orders_today: number | null;
  units_sold_today: number | null;

  revenue_today: number | null;
  revenue_7d: number | null;
  revenue_30d: number | null;

  gross_profit_today: ProfitValue;
  net_profit_today: ProfitValue;
  gross_profit_7d: ProfitValue;
  net_profit_7d: ProfitValue;

  return_count: number | null;
  return_rate: number | null; // 0-1

  ad_spend_today: number | null;
  ad_spend_7d: number | null;

  low_stock_count: number | null;
  out_of_stock_count: number | null;
  slow_moving_count: number | null;

  top_skus: SkuChannelPerformance[];
  bottom_skus: SkuChannelPerformance[];

  issues: PlatformIssue[];
  needs_chris: number;
}

export interface PlatformIssue {
  severity: 'P1' | 'P2';
  summary: string;
  detail: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// SKU-level cross-platform performance — per Task 14.2 §四. Not every
// platform will populate every field (e.g. Tradeling's B2B model may not
// have a consumer `rating`) — a missing field is `null`, the adapter never
// fabricates a value to fill the shape.
// ─────────────────────────────────────────────────────────────────────────
export interface SkuChannelPerformance {
  sku: string;
  product_name: string | null;
  platform: ChannelName;

  listing_status: string | null;
  listing_url: string | null;

  stock: number | null;
  available_stock: number | null;

  price: number | null;
  currency: string | null;

  units_sold_today: number | null;
  units_sold_7d: number | null;
  units_sold_30d: number | null;

  revenue_today: number | null;
  revenue_7d: number | null;
  revenue_30d: number | null;

  gross_profit: ProfitValue;
  net_profit: ProfitValue;
  margin_percent: number | null;

  return_count: number | null;
  return_rate: number | null;

  ad_spend: number | null;
  conversion_rate: number | null;

  rating: number | null;
  review_count: number | null;

  ranking: number | null;

  last_synced_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-platform comparison — only ever populated once >=2 channels are
// `connected`. With 0-1 connected channels, callers must show the
// "跨平台对比将在连接第二个平台后启用" message rather than a partial table.
// ─────────────────────────────────────────────────────────────────────────
export interface PlatformComparison {
  eligible: boolean; // true only when >=2 platforms are connected
  reason_if_not_eligible: string | null;
  by_revenue_today: { platform: ChannelName; revenue_today: number }[];
  by_net_profit_today: { platform: ChannelName; net_profit_today: number }[];
  by_listed_sku_count: { platform: ChannelName; listed_sku_count: number }[];
  by_return_rate: { platform: ChannelName; return_rate: number }[];
}

/** Cross-platform lookup for a single SKU — "WIWU XXX 在哪个平台卖得最好？" etc. */
export interface SkuAcrossPlatforms {
  sku: string;
  product_name: string | null;
  eligible: boolean; // true only when the SKU is listed on >=2 connected platforms
  reason_if_not_eligible: string | null;
  by_platform: SkuChannelPerformance[];
  best_platform_by_revenue: ChannelName | null;
  best_platform_by_profit: ChannelName | null;
  best_platform_by_conversion: ChannelName | null;
  lowest_stock_platform: ChannelName | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Executive Status — Task 14.2 §九/§十. Mirrors the shape MIA's
// /api/executive-status already established (Task 14.1) so GCI's Boss
// Action Center / Home KPI / Ask GCI consume both agents the same way.
// ─────────────────────────────────────────────────────────────────────────
export interface EcommerceExecutiveStatus {
  agent_name: 'E-commerce Assistant';
  status: AgentHealthStatus;
  last_updated: string | null;

  platforms_connected: number; // count of channels with connected=true

  listed_sku_count_total: number | null;
  selling_sku_count_total: number | null;

  orders_today_total: number | null;
  units_sold_today_total: number | null;
  revenue_today_total: number | null;
  net_profit_today_total: ProfitValue;

  low_stock_count: number | null;
  out_of_stock_count: number | null;
  slow_moving_count: number | null;

  returns_today: number | null;

  needs_chris: number;
  errors: number;

  best_platform: ChannelName | null;
  best_platform_reason: string | null;

  top_skus: SkuChannelPerformance[];

  platforms: PlatformSummary[];
}
