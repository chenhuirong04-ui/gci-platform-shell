export interface FactTile {
  id: string;
  count: string;
  label: string;
  mod: string;
  accent: 'gold' | 'coral' | 'neutral';
}

export interface PriorityAlert {
  id: string;
  severity: 'high' | 'mid' | 'low';
  text: string;
  ref: string;
  source: 'QUOTATION' | 'FINANCE' | 'TRADE' | 'CRM';
  action: string;
  mod: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
}

export const summaryLine =
  '今天有 2 件逾期事项、1 份报价待发送。处理完重点提醒后，按模块继续。';

export const factTiles: FactTile[] = [
  { id: 'ft1', count: '5', label: '待跟进客户', mod: 'CRM', accent: 'gold' },
  { id: 'ft2', count: '4', label: '待完成报价', mod: 'Quotation', accent: 'neutral' },
  { id: 'ft3', count: '2', label: '待确认订单', mod: 'Trade', accent: 'neutral' },
  { id: 'ft4', count: '3', label: '今日到期应收', mod: 'Finance', accent: 'neutral' },
  { id: 'ft5', count: '2', label: '库存异常', mod: 'Inventory', accent: 'coral' },
];

export const priorityAlerts: PriorityAlert[] = [
  {
    id: 'a1',
    severity: 'high',
    text: 'Al Habtoor — The Grove 报价已等待客户确认 2 天',
    ref: 'Q-2026-014 · AED 1.2M',
    source: 'QUOTATION',
    action: '跟进',
    mod: 'Quotation',
  },
  {
    id: 'a2',
    severity: 'high',
    text: 'Kuwait Trading — 应收款项逾期 8 天未收',
    ref: 'SO-2026-077 · AED 147K',
    source: 'FINANCE',
    action: '查看',
    mod: 'Finance',
  },
  {
    id: 'a3',
    severity: 'low',
    text: 'Qatar Rail BOQ 已解析完成，等待发送给客户',
    ref: 'Q-2026-021 · AED 880K',
    source: 'QUOTATION',
    action: '发送',
    mod: 'Quotation',
  },
  {
    id: 'a4',
    severity: 'mid',
    text: 'Kuwait Trading 订单交期还有 3 天，需确认备货',
    ref: 'SO-2026-077 · 灯具 600 pcs',
    source: 'TRADE',
    action: '查看',
    mod: 'Trade',
  },
];

export const quickActions: QuickAction[] = [
  { id: 'qa1', label: '新增客户', icon: '+' },
  { id: 'qa2', label: '创建报价', icon: '＄' },
  { id: 'qa3', label: '上传 BOQ', icon: '↑' },
  { id: 'qa4', label: '创建订单', icon: '▣' },
];
