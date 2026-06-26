import type { StatCardData } from '@gci/design-system';
import type { AlertRowData } from '@gci/design-system';
import type { QuickActionData } from '@gci/design-system';

/** Stat card visual specs per GCI Design System V1 — labels resolved separately via i18n. */
export const statCardSpecs: (Omit<StatCardData, 'label'> & { labelKey: keyof import('@gci/i18n').Dictionary['facts']; mod: string })[] = [
  {
    val: '5',
    labelKey: 'followUpsToday',
    mod: 'CRM',
    mc: '#8A7040',
    bg1: 'rgba(203,168,92,0.07)',
    bg2: 'rgba(203,168,92,0.02)',
    bdr: 'rgba(203,168,92,0.25)',
    nc: '#E2C988',
    line: 'linear-gradient(90deg,rgba(203,168,92,0.7),rgba(203,168,92,0))',
  },
  {
    val: '4',
    labelKey: 'pendingQuotes',
    mod: 'QUOTATION',
    mc: '#4A4858',
    bg1: 'rgba(255,255,255,0.03)',
    bg2: 'rgba(255,255,255,0.01)',
    bdr: 'rgba(255,255,255,0.08)',
    nc: '#F0EAD2',
    line: 'rgba(255,255,255,0.06)',
  },
  {
    val: '4',
    labelKey: 'activeOrders',
    mod: 'TRADE',
    mc: '#4A4858',
    bg1: 'rgba(255,255,255,0.03)',
    bg2: 'rgba(255,255,255,0.01)',
    bdr: 'rgba(255,255,255,0.08)',
    nc: '#F0EAD2',
    line: 'rgba(255,255,255,0.06)',
  },
  {
    val: '2',
    labelKey: 'inventoryAlerts',
    mod: 'INVENTORY',
    mc: '#7A4030',
    bg1: 'rgba(224,132,106,0.07)',
    bg2: 'rgba(224,132,106,0.02)',
    bdr: 'rgba(224,132,106,0.22)',
    nc: '#E0846A',
    line: 'linear-gradient(90deg,rgba(224,132,106,0.6),rgba(224,132,106,0))',
  },
];

/** Priority alert visual specs per V1 — text/action resolved via i18n. */
export const alertSpecs: (Omit<AlertRowData, 'text' | 'action'> & {
  textKey: keyof import('@gci/i18n').Dictionary['alerts'];
  actionKey: keyof import('@gci/i18n').Dictionary['alerts'];
})[] = [
  { dot: '#E0846A', textKey: 'a1', ref: 'Q-2026-014 · AED 1.2M', src: 'QUOTATION', sc: '#B69BD0', sb: 'rgba(182,155,208,0.14)', actionKey: 'followUp' },
  { dot: '#D9B45A', textKey: 'a2', ref: 'SO-2026-077 · 600 pcs', src: 'TRADE', sc: '#8FA6D4', sb: 'rgba(143,166,212,0.14)', actionKey: 'check' },
  { dot: '#6FBF8E', textKey: 'a3', ref: 'Q-2026-021 · AED 880K', src: 'QUOTATION', sc: '#B69BD0', sb: 'rgba(182,155,208,0.14)', actionKey: 'send' },
];

export const quickActionSpecs: (Omit<QuickActionData, 'label'> & { labelKey: keyof import('@gci/i18n').Dictionary['quickActions'] })[] = [
  {
    labelKey: 'addClient',
    icon: '+',
    ib: 'linear-gradient(135deg,rgba(203,168,92,0.2),rgba(203,168,92,0.08))',
    ic: '#E2C988',
    is: '0 4px 16px rgba(203,168,92,0.2)',
  },
  { labelKey: 'createQuote', icon: '＄', ib: 'rgba(255,255,255,0.05)', ic: '#C8BDA8', is: 'none' },
  { labelKey: 'uploadBoq', icon: '↑', ib: 'rgba(255,255,255,0.05)', ic: '#C8BDA8', is: 'none' },
  { labelKey: 'createOrder', icon: '▣', ib: 'rgba(255,255,255,0.05)', ic: '#C8BDA8', is: 'none' },
];
