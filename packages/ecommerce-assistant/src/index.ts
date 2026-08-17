// GCI Executive Desk — Task 14.2: E-commerce Assistant foundation, public exports.
export * from './types';
export type { ChannelAdapter, SalesMetrics, InventoryAlerts } from './adapters/base';
export { noonAdapter } from './adapters/noon';
export { amazonAdapter } from './adapters/amazon';
export { tradelingAdapter } from './adapters/tradeling';
export { websiteAdapter } from './adapters/website';
export {
  ALL_ADAPTERS, getPlatformSummaries, getExecutiveStatus,
  getPlatformComparison, getSkuAcrossPlatforms,
} from './executiveStatusService';
