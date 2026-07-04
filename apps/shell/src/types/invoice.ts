// ── GCI Invoice Types ─────────────────────────────────────────────────────────
// V1 Foundation — localStorage backed, Notion sync prepared as TODO stubs.

export interface BillingProfile {
  id: string;
  customerName: string;
  billingName: string;        // legal billing name if different from customerName
  billingAddress: string;
  phone: string;
  email: string;
  trn: string;                // UAE TRN number
  country: string;
  city: string;
  defaultCurrency: 'AED' | 'USD' | 'EUR' | 'GBP';
  defaultVatRate: number;     // e.g. 5 for 5%
  defaultPaymentTerms: string;
  notes: string;
  status: 'active' | 'inactive';
  lastInvoiceDate?: string;   // ISO date string
  createdAt: string;
  updatedAt: string;
  createdBy?: string;         // Supabase auth.users.id of the team member who saved this
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  unitPrice: number;
  qty: number;
  amount: number;             // unitPrice * qty, computed on save
}

export type InvoiceStatus =
  | 'draft'
  | 'waiting_approval'
  | 'approved'
  | 'issued'
  | 'cancelled'
  | 'paid';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:            'Draft',
  waiting_approval: 'Waiting for Approval',
  approved:         'Approved',
  issued:           'Issued',
  cancelled:        'Cancelled',
  paid:             'Paid',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, { color: string; bg: string }> = {
  draft:            { color: '#7A8494', bg: 'rgba(122,132,148,0.12)' },
  waiting_approval: { color: '#D4A843', bg: 'rgba(212,168,67,0.12)' },
  approved:         { color: '#6FBF8E', bg: 'rgba(111,191,142,0.12)' },
  issued:           { color: '#5BA3C9', bg: 'rgba(91,163,201,0.12)' },
  cancelled:        { color: '#E0846A', bg: 'rgba(224,132,106,0.12)' },
  paid:             { color: '#8FA6D4', bg: 'rgba(143,166,212,0.12)' },
};

export interface InvoiceDraft {
  id: string;
  invoiceNo: string;
  customerName: string;
  billingProfileId?: string;
  // Bill To snapshot — copied from profile at creation; may differ if profile is later edited
  billTo: {
    name: string;
    address: string;
    phone: string;
    email: string;
    trn: string;
  };
  invoiceDate: string;        // ISO date string
  dueDate: string;            // ISO date string
  currency: string;
  items: InvoiceLineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  otherComments: string;
  relatedPI?: string;
  relatedQuotation?: string;
  relatedOrder?: string;
  status: InvoiceStatus;
  pdfUrl?: string;
  notes: string;
  createdAt: string;
  approvedAt?: string;
  createdBy?: string;   // Supabase auth.users.id of the team member who created this
  approvedBy?: string;  // Supabase auth.users.id of the approver
}

// GCI company defaults — matches actual TAX INVOICE template
export const GCI_COMPANY = {
  name: 'GLOBALCARE INFO GENERAL TRADING FZCO',
  address: 'Showroom #F5323, Dubai Traders Market, Yiwu Market, Jebel Ali, Dubai, UAE',
  licenseNo: '210193',
  trn: '104800049900003',
  email: 'finance@globalcare-info.com',
  phone: '+971 50 718 8306 / +971505446630',
  defaultCurrency: 'AED' as const,
  defaultVatRate: 5,
  bank: {
    name: 'WIO BANK PJSC',
    accountName: 'GLOBALCARE INFO GENERAL TRADING FZCO',
    iban: 'AE390860000009488412104',
    swift: 'WIOBAEADXXX',
  },
  defaultPaymentTerms: '100% payment is required before goods/services are delivered.',
} as const;
