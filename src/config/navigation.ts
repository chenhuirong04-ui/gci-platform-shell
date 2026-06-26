export interface NavTopItem {
  code: string;
  name: string;
}

export interface NavModItem {
  code: string;
  name: string;
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  url?: string;
}

export const navTop: NavTopItem = {
  code: 'WS',
  name: '每日工作台',
};

export const navMods: NavModItem[] = [
  {
    code: 'CR',
    name: 'CRM 客户',
    count: '5',
    badgeColor: '#E2C988',
    badgeBg: 'rgba(203,168,92,0.16)',
    url: 'https://leads.globalcareinfo.com',
  },
  {
    code: 'QT',
    name: 'Quotation',
    count: '4',
    badgeColor: '#A89878',
    badgeBg: 'rgba(255,255,255,0.07)',
    url: 'https://living.globalcareinfo.com',
  },
  {
    code: 'TR',
    name: 'Trade',
    count: '2',
    badgeColor: '#A89878',
    badgeBg: 'rgba(255,255,255,0.07)',
    url: 'https://trade.globalcareinfo.com',
  },
  {
    code: 'IV',
    name: 'Inventory',
    count: '2',
    badgeColor: '#D0907A',
    badgeBg: 'rgba(224,132,106,0.14)',
  },
  {
    code: 'FN',
    name: 'Finance',
    count: '3',
    badgeColor: '#A89878',
    badgeBg: 'rgba(255,255,255,0.07)',
  },
  { code: 'PJ', name: 'Projects' },
  { code: 'BI', name: 'Intelligence' },
  { code: 'ST', name: 'Settings' },
];
