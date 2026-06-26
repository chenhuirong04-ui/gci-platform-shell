export interface ModuleDef {
  code: string;
  nameKey: 'crm' | 'quotation' | 'trade' | 'inventory' | 'finance' | 'projects' | 'intelligence' | 'aiAssistant' | 'settings';
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  url?: string;
}

/** Module order, badges and external links — per GCI Design System V1 navItems spec. */
export const modules: ModuleDef[] = [
  { code: 'CR', nameKey: 'crm', count: '5', badgeColor: '#E2C988', badgeBg: 'rgba(203,168,92,0.16)', url: 'https://leads.globalcareinfo.com' },
  { code: 'QT', nameKey: 'quotation', count: '4', badgeColor: '#A89878', badgeBg: 'rgba(255,255,255,0.07)', url: 'https://living.globalcareinfo.com' },
  { code: 'TR', nameKey: 'trade', url: 'https://trade.globalcareinfo.com' },
  { code: 'IV', nameKey: 'inventory', count: '2', badgeColor: '#D0906A', badgeBg: 'rgba(224,132,106,0.14)' },
  { code: 'FN', nameKey: 'finance' },
  { code: 'PJ', nameKey: 'projects' },
  { code: 'BI', nameKey: 'intelligence' },
  { code: 'AI', nameKey: 'aiAssistant' },
  { code: 'ST', nameKey: 'settings' },
];
