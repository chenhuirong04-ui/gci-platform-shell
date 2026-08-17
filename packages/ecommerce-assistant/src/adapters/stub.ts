// GCI Executive Desk — Task 14.2: shared stub factory. A stub adapter
// NEVER returns a number — every metric is null, connected is false. This
// is the only implementation Amazon/Tradeling/Website need until a real
// integration is built; NOON's stub differs only in `status`
// (pending_reconnect, not not_connected) since its real capability exists,
// just isn't reachable from this environment right now.
import type { ChannelAdapter, SalesMetrics, InventoryAlerts } from './base';
import type { ChannelName, PlatformSummary, PlatformIssue, ChannelConnectionState } from '../types';

export function makeStubAdapter(channel: ChannelName, status: ChannelConnectionState): ChannelAdapter {
  return {
    channel,

    async getPlatformSummary(): Promise<PlatformSummary> {
      return {
        platform: channel,
        connected: false,
        status,
        last_synced_at: null,
        listed_sku_count: null,
        selling_sku_count: null,
        orders_today: null,
        units_sold_today: null,
        revenue_today: null,
        revenue_7d: null,
        revenue_30d: null,
        gross_profit_today: null,
        net_profit_today: null,
        gross_profit_7d: null,
        net_profit_7d: null,
        return_count: null,
        return_rate: null,
        ad_spend_today: null,
        ad_spend_7d: null,
        low_stock_count: null,
        out_of_stock_count: null,
        slow_moving_count: null,
        top_skus: [],
        bottom_skus: [],
        issues: [],
        needs_chris: 0,
      };
    },

    async getSkuPerformance() {
      return [];
    },

    async getInventoryAlerts(): Promise<InventoryAlerts> {
      return { low_stock_count: null, out_of_stock_count: null, slow_moving_count: null, low_stock_skus: [], slow_moving_skus: [] };
    },

    async getSalesMetrics(): Promise<SalesMetrics> {
      return { orders_today: null, units_sold_today: null, revenue_today: null, revenue_7d: null, revenue_30d: null };
    },

    async getIssues(): Promise<PlatformIssue[]> {
      return [];
    },
  };
}
