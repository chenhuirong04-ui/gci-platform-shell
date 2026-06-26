export interface FactReminder {
  id: string;
  source: string;
  text: string;
  severity: 'high' | 'mid' | 'low';
}

export interface HighlightItem {
  id: string;
  title: string;
  detail: string;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

export const factReminders: FactReminder[] = [
  { id: 'f1', source: 'DEAL', text: '5 个客户今天到跟进日期，3 个已超期未处理', severity: 'high' },
  { id: 'f2', source: 'Trade OS', text: '2 笔 PI 报价等待客户确认，1 笔超过 48 小时未回复', severity: 'mid' },
  { id: 'f3', source: 'Quotation', text: '昨日新增 1 份 FF&E 报价单，待转交 Trade 出单', severity: 'low' },
];

export const highlights: HighlightItem[] = [
  { id: 'h1', title: '迪拜项目 — 卫生用品批次', detail: '客户已确认样品，等待签约，建议本周跟进' },
  { id: 'h2', title: '中国供应链 — 家居建材报价', detail: 'Quotation 已出价，Trade 尚未生成 PI' },
];

export const quickLinks: QuickLink[] = [
  { id: 'q1', label: '打开今日跟进看板', url: 'https://leads.globalcareinfo.com' },
  { id: 'q2', label: '查看资金流水', url: 'https://trade.globalcareinfo.com' },
  { id: 'q3', label: '新建报价单', url: 'https://living.globalcareinfo.com' },
];
