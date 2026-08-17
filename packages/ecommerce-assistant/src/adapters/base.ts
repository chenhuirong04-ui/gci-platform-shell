// GCI Executive Desk — Task 14.2: the ONE thin adapter contract every
// channel implements. No big if/else per channel anywhere else in this
// package or in any future consumer — adding a 5th channel later means
// writing one new file implementing this interface, nothing else changes.
import type {
  ChannelName, PlatformSummary, SkuChannelPerformance, PlatformIssue,
} from '../types';

export interface SalesMetrics {
  orders_today: number | null;
  units_sold_today: number | null;
  revenue_today: number | null;
  revenue_7d: number | null;
  revenue_30d: number | null;
}

export interface InventoryAlerts {
  low_stock_count: number | null;
  out_of_stock_count: number | null;
  slow_moving_count: number | null;
  low_stock_skus: SkuChannelPerformance[];
  slow_moving_skus: SkuChannelPerformance[];
}

export interface ChannelAdapter {
  readonly channel: ChannelName;
  getPlatformSummary(): Promise<PlatformSummary>;
  getSkuPerformance(): Promise<SkuChannelPerformance[]>;
  getInventoryAlerts(): Promise<InventoryAlerts>;
  getSalesMetrics(): Promise<SalesMetrics>;
  getIssues(): Promise<PlatformIssue[]>;
}
