import type { en } from './en';

export const zh: typeof en = {
  nav: {
    workspace: '每日工作台',
    crm: 'CRM 客户',
    quotation: 'Quotation',
    trade: 'Trade',
    inventory: 'Inventory',
    finance: 'Finance',
    projects: 'Projects',
    intelligence: 'Intelligence',
    aiAssistant: 'AI Assistant',
    settings: 'Settings',
    workspaceSection: 'WORKSPACE',
    modulesSection: 'MODULES',
  },
  header: {
    eyebrow: 'GCI UNIFIED · DAILY WORKSPACE',
    searchPlaceholder: '搜索客户、报价…',
    synced: '已同步',
  },
  greeting: {
    morning: '早上好',
    noon: '中午好',
    afternoon: '下午好',
    evening: '晚上好',
    night: '凌晨好',
  },
  workspace: {
    summary: '今天有 2 件逾期事项、1 份报价待发送。处理完重点提醒后，按模块继续。',
    today: 'TODAY',
    priorityAlerts: 'PRIORITY ALERTS',
    items: 'ITEMS',
    quickActions: 'QUICK ACTIONS',
  },
  facts: {
    followUpsToday: '今日待跟进',
    pendingQuotes: '待完成报价',
    activeOrders: '执行中订单',
    inventoryAlerts: '库存预警',
  },
  alerts: {
    a1: 'Al Habtoor — 报价已等待确认 2 天',
    a2: 'Kuwait Trading 订单交期还有 3 天 — 确认备货',
    a3: 'Qatar Rail BOQ 已解析完成，可发送客户',
    followUp: '跟进',
    check: '查看',
    send: '发送',
  },
  quickActions: {
    addClient: '新增客户',
    createQuote: '创建报价',
    uploadBoq: '上传 BOQ',
    createOrder: '创建订单',
  },
  toast: {
    enterModule: (name: string) => `进入 ${name} 模块 — 待接入`,
    quickAction: (label: string) => `${label} · 已触发（原型）— 待接入`,
  },
  profile: {
    owner: 'Owner · GCI',
  },
};
