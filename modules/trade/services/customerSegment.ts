// Customer Segment normalization — single source of truth for all Dashboards/Analytics.
// Usage: import { normalizeCustomerSegment, SEGMENT_LABELS, SEGMENT_COLORS } from './customerSegment';

export type CustomerSegment =
  | 'RETAIL'
  | 'WHOLESALE'
  | 'PROJECT'
  | 'HOSPITALITY'
  | 'INSTITUTION'
  | 'INDIVIDUAL'
  | 'OTHER';

/** Chinese display labels for Dashboard / pie charts */
export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  RETAIL:      '超市零售',
  WHOLESALE:   '批发贸易',
  PROJECT:     '工程项目',
  HOSPITALITY: '酒店餐饮',
  INSTITUTION: '政府机构',
  INDIVIDUAL:  '个人客户',
  OTHER:       '其他',
};

/** Brand-consistent colors per segment */
export const SEGMENT_COLORS: Record<CustomerSegment, string> = {
  RETAIL:      '#0F1E45',
  WHOLESALE:   '#C9A84C',
  PROJECT:     '#059669',
  HOSPITALITY: '#7c3aed',
  INSTITUTION: '#0284c7',
  INDIVIDUAL:  '#dc2626',
  OTHER:       '#94a3b8',
};

/** Strip parenthetical annotations — both ASCII (xxx) and fullwidth （xxx） — then lowercase */
function stripAndNormalize(s: string): string {
  return s.replace(/[（(][^）)]*[）)]/g, '').trim().toLowerCase();
}

/**
 * Ordered keyword rules — first match wins.
 * Uses `includes` so partial values like "Wholesaler（批发商）" still match.
 */
const SEGMENT_RULES: Array<{ keywords: string[]; segment: CustomerSegment }> = [
  { keywords: ['supermarket', 'hypermarket', 'small retailer'],                         segment: 'RETAIL'       },
  { keywords: ['wholesaler', 'trading company', 'agent', 'distributor'],                segment: 'WHOLESALE'    },
  { keywords: ['construction company', 'fit-out', 'real estate developer', 'real estate'], segment: 'PROJECT'  },
  { keywords: ['hotel', 'hospitality', 'restaurant', 'coffee shop'],                    segment: 'HOSPITALITY'  },
  { keywords: ['government', 'institution'],                                             segment: 'INSTITUTION'  },
  { keywords: ['individual'],                                                            segment: 'INDIVIDUAL'   },
];

/**
 * Normalize any customerType string → CustomerSegment.
 * Strips Chinese parenthetical annotations, case-insensitive, uses keyword includes.
 * Returns 'OTHER' for null / unknown / unmapped types.
 */
export function normalizeCustomerSegment(customerType?: string | null): CustomerSegment {
  if (!customerType) return 'OTHER';
  const n = stripAndNormalize(customerType);
  for (const { keywords, segment } of SEGMENT_RULES) {
    if (keywords.some(kw => n.includes(kw))) return segment;
  }
  return 'OTHER';
}

/**
 * Read Customer Type from a Notion page's properties object.
 * Tries all known field name variants so a Notion rename doesn't break the app.
 */
const CUSTOMER_TYPE_KEYS = [
  'Customer Type（客户类型）',
  'Customer Type',
  '客户类型',
];

export function readNotionCustomerType(properties: Record<string, any>): string {
  for (const key of CUSTOMER_TYPE_KEYS) {
    const val = properties[key]?.select?.name;
    if (val) return val;
  }
  return '';
}

/** All segments in display order for legends / labels */
export const ALL_SEGMENTS: CustomerSegment[] = [
  'RETAIL', 'WHOLESALE', 'PROJECT', 'HOSPITALITY', 'INSTITUTION', 'INDIVIDUAL', 'OTHER',
];
