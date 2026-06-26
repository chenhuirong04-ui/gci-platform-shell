export interface NavItem {
  code: string;
  name: string;
  kind: 'workspace' | 'external' | 'soon';
  url?: string;
  count?: string;
  accent?: 'gold' | 'coral' | 'neutral';
}

export const navTop: NavItem = {
  code: 'WS',
  name: '每日工作台',
  kind: 'workspace',
};

export const navMods: NavItem[] = [
  { code: 'CR', name: 'CRM 客户', kind: 'external', url: 'https://leads.globalcareinfo.com', count: '5', accent: 'gold' },
  { code: 'QT', name: 'Quotation', kind: 'external', url: 'https://living.globalcareinfo.com', count: '4', accent: 'neutral' },
  { code: 'TR', name: 'Trade', kind: 'external', url: 'https://trade.globalcareinfo.com', count: '2', accent: 'neutral' },
  { code: 'IV', name: 'Inventory', kind: 'soon', count: '2', accent: 'coral' },
  { code: 'FN', name: 'Finance', kind: 'soon', count: '3', accent: 'neutral' },
  { code: 'PJ', name: 'Projects', kind: 'soon' },
  { code: 'BI', name: 'Intelligence', kind: 'soon' },
  { code: 'ST', name: 'Settings', kind: 'soon' },
];
