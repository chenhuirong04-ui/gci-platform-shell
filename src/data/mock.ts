export interface FactTile {
  id: string;
  count: string;
  label: string;
  module: string;
  numC: string;
  tagC: string;
  bg1: string;
  bg2: string;
  border: string;
  line: string;
  mod: string;
}

export interface PriorityAlert {
  id: string;
  dot: string;
  text: string;
  ref: string;
  source: 'QUOTATION' | 'FINANCE' | 'TRADE' | 'CRM';
  sc: string;
  sb: string;
  action: string;
  mod: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  ib: string;
  ic: string;
  is: string;
}

export const summaryLine =
  '今天有 2 件逾期事项、1 份报价待发送。处理完重点提醒后，按模块继续。';

export const factTiles: FactTile[] = [
  {
    id: 'ft1',
    count: '5',
    label: '待跟进客户',
    module: 'CRM',
    mod: 'CRM',
    numC: '#E2C988',
    tagC: 'rgba(203,168,92,0.55)',
    bg1: 'rgba(203,168,92,0.07)',
    bg2: 'rgba(203,168,92,0.02)',
    border: 'rgba(203,168,92,0.25)',
    line: 'linear-gradient(90deg,rgba(203,168,92,0.7),rgba(203,168,92,0))',
  },
  {
    id: 'ft2',
    count: '4',
    label: '待完成报价',
    module: 'QUOTATION',
    mod: 'Quotation',
    numC: '#EDE4C8',
    tagC: '#5E6878',
    bg1: 'rgba(255,255,255,0.03)',
    bg2: 'rgba(255,255,255,0.01)',
    border: 'rgba(255,255,255,0.07)',
    line: 'rgba(255,255,255,0.06)',
  },
  {
    id: 'ft3',
    count: '2',
    label: '待确认订单',
    module: 'TRADE',
    mod: 'Trade',
    numC: '#EDE4C8',
    tagC: '#5E6878',
    bg1: 'rgba(255,255,255,0.03)',
    bg2: 'rgba(255,255,255,0.01)',
    border: 'rgba(255,255,255,0.07)',
    line: 'rgba(255,255,255,0.06)',
  },
  {
    id: 'ft4',
    count: '3',
    label: '今日到期应收',
    module: 'FINANCE',
    mod: 'Finance',
    numC: '#EDE4C8',
    tagC: '#5E6878',
    bg1: 'rgba(255,255,255,0.03)',
    bg2: 'rgba(255,255,255,0.01)',
    border: 'rgba(255,255,255,0.07)',
    line: 'rgba(255,255,255,0.06)',
  },
  {
    id: 'ft5',
    count: '2',
    label: '库存异常',
    module: 'INVENTORY',
    mod: 'Inventory',
    numC: '#D88870',
    tagC: '#7A4A38',
    bg1: 'rgba(224,132,106,0.08)',
    bg2: 'rgba(224,132,106,0.02)',
    border: 'rgba(224,132,106,0.22)',
    line: 'linear-gradient(90deg,rgba(224,132,106,0.6),rgba(224,132,106,0))',
  },
];

export const priorityAlerts: PriorityAlert[] = [
  {
    id: 'a1',
    dot: '#E0846A',
    text: 'Al Habtoor — The Grove 报价已等待客户确认 2 天',
    ref: 'Q-2026-014 · AED 1.2M',
    source: 'QUOTATION',
    sc: '#B89AB0',
    sb: 'rgba(182,155,208,0.14)',
    action: '跟进',
    mod: 'Quotation',
  },
  {
    id: 'a2',
    dot: '#E0846A',
    text: 'Kuwait Trading — 应收款项逾期 8 天未收',
    ref: 'SO-2026-077 · AED 147K',
    source: 'FINANCE',
    sc: '#C0A868',
    sb: 'rgba(192,168,104,0.14)',
    action: '查看',
    mod: 'Finance',
  },
  {
    id: 'a3',
    dot: '#6FBF8E',
    text: 'Qatar Rail BOQ 已解析完成，等待发送给客户',
    ref: 'Q-2026-021 · AED 880K',
    source: 'QUOTATION',
    sc: '#B89AB0',
    sb: 'rgba(182,155,208,0.14)',
    action: '发送',
    mod: 'Quotation',
  },
  {
    id: 'a4',
    dot: '#D9B45A',
    text: 'Kuwait Trading 订单交期还有 3 天，需确认备货',
    ref: 'SO-2026-077 · 灯具 600 pcs',
    source: 'TRADE',
    sc: '#8090B0',
    sb: 'rgba(128,144,176,0.14)',
    action: '查看',
    mod: 'Trade',
  },
];

export const quickActions: QuickAction[] = [
  {
    id: 'qa1',
    label: '新增客户',
    icon: '+',
    ib: 'linear-gradient(135deg,rgba(203,168,92,0.2),rgba(203,168,92,0.08))',
    ic: '#E2C988',
    is: '0 4px 16px rgba(203,168,92,0.2)',
  },
  {
    id: 'qa2',
    label: '创建报价',
    icon: '＄',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
  },
  {
    id: 'qa3',
    label: '上传 BOQ',
    icon: '↑',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
  },
  {
    id: 'qa4',
    label: '创建订单',
    icon: '▣',
    ib: 'rgba(255,255,255,0.05)',
    ic: '#C8BDA8',
    is: 'none',
  },
];
