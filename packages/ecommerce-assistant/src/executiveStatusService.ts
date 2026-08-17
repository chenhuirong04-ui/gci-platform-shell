// GCI Executive Desk — Task 14.2 §九/§十: aggregates every channel adapter
// into one EcommerceExecutiveStatus. This is the local, internal version of
// what would later become GET /api/executive-status on a real E-commerce
// Assistant deployment (same shape MIA's endpoint already established in
// Task 14.1) — once that project has a stable Production URL, this
// function's body becomes that route's handler; no shape changes needed
// upstream.
//
// Aggregation rule: totals only ever sum real (non-null) values from
// `connected` channels. With zero connected channels every total is null
// (no_data), never 0 — a 0 here would falsely claim "confirmed zero sales
// across the whole business" when the truth is "we have no visibility at
// all".
import type { ChannelAdapter } from './adapters/base';
import { noonAdapter } from './adapters/noon';
import { amazonAdapter } from './adapters/amazon';
import { tradelingAdapter } from './adapters/tradeling';
import { websiteAdapter } from './adapters/website';
import type {
  ChannelName, PlatformSummary, PlatformComparison, SkuAcrossPlatforms,
  SkuChannelPerformance, EcommerceExecutiveStatus, AgentHealthStatus,
} from './types';

export const ALL_ADAPTERS: ChannelAdapter[] = [noonAdapter, amazonAdapter, tradelingAdapter, websiteAdapter];

function sumOrNull(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0);
}

/** Sums real numeric profit values; if ANY connected channel's figure is
 * 'profit_data_incomplete' the total is incomplete too — a partial sum
 * that silently drops an unknown channel would understate cost, which is
 * worse than admitting the total isn't known. */
function sumProfitOrIncomplete(
  values: (number | 'profit_data_incomplete' | null)[],
): number | 'profit_data_incomplete' | null {
  const real: number[] = [];
  let incomplete = false;
  for (const v of values) {
    if (v === 'profit_data_incomplete') incomplete = true;
    else if (v !== null) real.push(v);
  }
  if (incomplete) return 'profit_data_incomplete';
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0);
}

export async function getPlatformSummaries(): Promise<PlatformSummary[]> {
  return Promise.all(ALL_ADAPTERS.map((a) => a.getPlatformSummary()));
}

export async function getExecutiveStatus(): Promise<EcommerceExecutiveStatus> {
  const platforms = await getPlatformSummaries();
  const connected = platforms.filter((p) => p.connected);

  const needsChrisTotal = platforms.reduce((s, p) => s + p.needs_chris, 0);
  const errorsTotal = platforms.reduce((s, p) => s + p.issues.filter((i) => i.severity === 'P1').length, 0);

  let status: AgentHealthStatus;
  if (connected.length === 0) status = 'no_data';
  else if (errorsTotal > 0) status = 'error';
  else if (platforms.some((p) => p.issues.length > 0)) status = 'warning';
  else status = 'healthy';

  const lastUpdated = connected
    .map((p) => p.last_synced_at)
    .filter((v): v is string => v !== null)
    .sort()
    .pop() ?? null;

  // Best platform by revenue_today — only meaningful with >=2 connected
  // channels and real revenue figures; never guessed with 0-1 channels.
  let bestPlatform: ChannelName | null = null;
  let bestPlatformReason: string | null = null;
  if (connected.length >= 2) {
    const withRevenue = connected.filter((p) => p.revenue_today !== null) as (PlatformSummary & { revenue_today: number })[];
    if (withRevenue.length >= 2) {
      const top = withRevenue.reduce((a, b) => (b.revenue_today > a.revenue_today ? b : a));
      bestPlatform = top.platform;
      bestPlatformReason = `今日营收最高 (${top.revenue_today})`;
    }
  }

  const topSkus: SkuChannelPerformance[] = connected
    .flatMap((p) => p.top_skus)
    .sort((a, b) => (b.revenue_today ?? 0) - (a.revenue_today ?? 0))
    .slice(0, 5);

  return {
    agent_name: 'E-commerce Assistant',
    status,
    last_updated: lastUpdated,
    platforms_connected: connected.length,
    listed_sku_count_total: sumOrNull(platforms.map((p) => p.listed_sku_count)),
    selling_sku_count_total: sumOrNull(platforms.map((p) => p.selling_sku_count)),
    orders_today_total: sumOrNull(platforms.map((p) => p.orders_today)),
    units_sold_today_total: sumOrNull(platforms.map((p) => p.units_sold_today)),
    revenue_today_total: sumOrNull(platforms.map((p) => p.revenue_today)),
    net_profit_today_total: sumProfitOrIncomplete(platforms.map((p) => p.net_profit_today)),
    low_stock_count: sumOrNull(platforms.map((p) => p.low_stock_count)),
    out_of_stock_count: sumOrNull(platforms.map((p) => p.out_of_stock_count)),
    slow_moving_count: sumOrNull(platforms.map((p) => p.slow_moving_count)),
    returns_today: sumOrNull(platforms.map((p) => p.return_count)),
    needs_chris: needsChrisTotal,
    errors: errorsTotal,
    best_platform: bestPlatform,
    best_platform_reason: bestPlatformReason,
    top_skus: topSkus,
    platforms,
  };
}

/** Task 14.2 §五 — platform-level comparison. Only eligible with >=2
 * connected platforms; callers must show "跨平台对比将在连接第二个平台后启用"
 * (or the equivalent Ask GCI sentence) when `eligible` is false, never a
 * partial/fabricated comparison. */
export async function getPlatformComparison(): Promise<PlatformComparison> {
  const platforms = await getPlatformSummaries();
  const connected = platforms.filter((p) => p.connected);

  if (connected.length < 2) {
    return {
      eligible: false,
      reason_if_not_eligible:
        connected.length === 0
          ? '当前没有已连接的电商平台，暂无法比较。'
          : '当前仅 1 个平台已连接，跨平台对比将在连接第二个平台后启用。',
      by_revenue_today: [],
      by_net_profit_today: [],
      by_listed_sku_count: [],
      by_return_rate: [],
    };
  }

  const withNum = <K extends keyof PlatformSummary>(key: K) =>
    connected
      .filter((p) => typeof p[key] === 'number')
      .map((p) => ({ platform: p.platform, [key]: p[key] as number }) as any)
      .sort((a: any, b: any) => b[key] - a[key]);

  return {
    eligible: true,
    reason_if_not_eligible: null,
    by_revenue_today: withNum('revenue_today'),
    by_net_profit_today: connected
      .filter((p) => typeof p.net_profit_today === 'number')
      .map((p) => ({ platform: p.platform, net_profit_today: p.net_profit_today as number }))
      .sort((a, b) => b.net_profit_today - a.net_profit_today),
    by_listed_sku_count: withNum('listed_sku_count'),
    by_return_rate: withNum('return_rate'),
  };
}

/** Task 14.2 §五 — single-SKU cross-platform lookup ("WIWU XXX 在哪个平台卖
 * 得最好？"). Only eligible when the SKU is listed on >=2 connected
 * platforms; otherwise callers must say "暂无可比数据", never guess. */
export async function getSkuAcrossPlatforms(sku: string): Promise<SkuAcrossPlatforms> {
  // A disconnected channel's adapter always returns [] from getSkuPerformance
  // (see stub.ts), so no extra "is this channel connected" filter is needed
  // here — only real, connected-channel rows can ever appear in `matches`.
  const perPlatform = await Promise.all(ALL_ADAPTERS.map((a) => a.getSkuPerformance()));
  const matches: SkuChannelPerformance[] = perPlatform.flatMap((rows) => rows.filter((r) => r.sku === sku));

  if (matches.length < 2) {
    return {
      sku,
      product_name: matches[0]?.product_name ?? null,
      eligible: false,
      reason_if_not_eligible: matches.length === 0 ? `暂无「${sku}」的跨平台数据。` : `「${sku}」暂无可比数据（仅 1 个平台有数据）。`,
      by_platform: matches,
      best_platform_by_revenue: null,
      best_platform_by_profit: null,
      best_platform_by_conversion: null,
      lowest_stock_platform: null,
    };
  }

  const byRevenue = matches.filter((m) => m.revenue_today !== null);
  const byProfit = matches.filter((m) => typeof m.net_profit === 'number');
  const byConversion = matches.filter((m) => m.conversion_rate !== null);
  const byStock = matches.filter((m) => m.available_stock !== null);

  return {
    sku,
    product_name: matches[0]?.product_name ?? null,
    eligible: true,
    reason_if_not_eligible: null,
    by_platform: matches,
    best_platform_by_revenue: byRevenue.length ? byRevenue.reduce((a, b) => (b.revenue_today! > a.revenue_today! ? b : a)).platform : null,
    best_platform_by_profit: byProfit.length ? byProfit.reduce((a, b) => ((b.net_profit as number) > (a.net_profit as number) ? b : a)).platform : null,
    best_platform_by_conversion: byConversion.length ? byConversion.reduce((a, b) => (b.conversion_rate! > a.conversion_rate! ? b : a)).platform : null,
    lowest_stock_platform: byStock.length ? byStock.reduce((a, b) => (b.available_stock! < a.available_stock! ? b : a)).platform : null,
  };
}
