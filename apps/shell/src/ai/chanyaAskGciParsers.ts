// GCI Executive Desk — Task 18.1: Ask GIA entry points for Chanya status.
// All read-only — matching a phrasing here only triggers a getChanyaStatus()
// fetch and a formatted display, never any write to Chanya.
export function matchChanyaStatusQuery(raw: string): boolean {
  const t = raw.trim();
  const PATTERNS: RegExp[] = [
    /chanya.{0,6}(今天|今日).{0,6}(新用户|新注册|注册)/i,
    /chanya.{0,10}(有没有|有人|是否).{0,6}付款/i,
    /chanya.{0,6}(今天|今日).{0,6}收入/i,
    /chanya.{0,10}(有没有|是否).{0,6}(支付失败|付款失败)/i,
    /chanya.{0,10}(有没有|是否).{0,6}(用户|客户).{0,6}(需要|要).{0,4}(我|chris).{0,4}处理/i,
    /chanya.{0,6}系统.{0,6}(有没有|是否).{0,4}异常/i,
    /chanya.{0,10}(状态|怎么样|情况)/i,
  ];
  return PATTERNS.some((re) => re.test(t));
}

export function formatChanyaStatusReply(data: {
  status: string;
  new_signups_today: number;
  new_paid_today: number;
  revenue_today: number;
  currency: string;
  payment_failures_today: number;
  cancellations_today: number;
  needs_chris: number;
  issues: string[];
  last_updated: string | null;
} | null, error: string | null): string {
  if (!data) {
    return `Chanya 状态暂不可读${error ? `（${error}）` : ''}——Chanya 侧的 /api/executive-status 接口尚未部署，接入后会显示真实数字。`;
  }
  const lines = [
    `Chanya｜${data.status === 'healthy' ? 'Healthy' : data.status === 'warning' ? 'Warning' : data.status === 'error' ? 'Error' : '待接入'}`,
    `今日新注册 ${data.new_signups_today}`,
    `新付费 ${data.new_paid_today}`,
    `收入 ${data.currency || 'AED'} ${data.revenue_today}`,
    `支付失败 ${data.payment_failures_today}`,
    `需处理 ${data.needs_chris}`,
  ];
  if (data.issues.length > 0) lines.push(`异常: ${data.issues.join('；')}`);
  if (data.last_updated) lines.push(`更新于 ${new Date(data.last_updated).toLocaleString('zh-CN')}`);
  return lines.join('\n');
}
