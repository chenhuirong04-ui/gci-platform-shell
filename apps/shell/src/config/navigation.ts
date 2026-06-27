export interface ModuleDef {
  code: string;
  nameKey: 'crm' | 'quotation' | 'trade' | 'inventory' | 'finance' | 'projects' | 'intelligence' | 'aiAssistant' | 'settings';
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  /** Internal SPA route (monorepo merge target). Takes priority over `url`. */
  path?: string;
  /** Legacy external link — kept only as a fallback note, no longer used for crm/trade/quotation. */
  url?: string;
}

/** Module order, badges and routes — per GCI Design System V1 navItems spec.
 * crm/trade/quotation now route to in-app paths (monorepo merge, Day 1 skeleton).
 * Each path currently renders a "migrating this week" placeholder until its
 * module lands in modules/{crm,trade,quotation} per the 7-day plan. */
export const modules: ModuleDef[] = [
  { code: 'CR', nameKey: 'crm', count: '5', badgeColor: '#E2C988', badgeBg: 'rgba(203,168,92,0.16)', path: '/crm' },
  { code: 'QT', nameKey: 'quotation', count: '4', badgeColor: '#A89878', badgeBg: 'rgba(255,255,255,0.07)', path: '/quotation' },
  { code: 'TR', nameKey: 'trade', path: '/trade' },
  { code: 'IV', nameKey: 'inventory', count: '2', badgeColor: '#D0906A', badgeBg: 'rgba(224,132,106,0.14)' },
  { code: 'FN', nameKey: 'finance' },
  { code: 'PJ', nameKey: 'projects' },
  { code: 'BI', nameKey: 'intelligence' },
  { code: 'AI', nameKey: 'aiAssistant' },
  { code: 'ST', nameKey: 'settings' },
];
