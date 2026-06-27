export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type PaymentTermType = 'COD' | 'NET_DAYS' | 'DUE_DATE' | 'CREDIT_TEXT';

export interface QuoteItemRecord {
  quoteId: string;
  productId?: string;
  desc: string;
  qty: number;
  price: number;
  unit_price?: number;
  lineTotal: number;
}

export interface QuoteRecord {
  id: string;
  createdAt: string;
  userId: string;
  operatorName: string;
  customerId: string;
  customerName: string;
  subtotal: number;
  vat: number;
  grandTotal: number;
  status: 'DRAFT' | 'QUOTED' | 'CONVERTED' | 'LOST';
  currency: 'AED';
  paymentTerms: string; // 自由文本
  dueDate: string;
  convertedOrderId?: string;
  // Project PI fields (optional — never break existing Standard PI)
  piType?: 'STANDARD' | 'PROJECT' | 'NON_STOCK';
  projectName?: string;
  quoteRef?: string;
  pdfUrl?: string;
  sourceApp?: string;
  costAmount?: number;
  marginRate?: number;
  profitAmount?: number;
  notes?: string; // supplier terms, payment terms, lead time — from Quotation Center
}

export interface OrderRecord {
  id: string;
  quoteId: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  subtotal: number;
  vat: number;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CONSIGNMENT' | 'VOIDED';
  userId: string;
  paymentTerms: string;
  dueDate: string;
  transactionMode?: 'Direct Sale' | 'Consignment';
  consignmentStatus?: 'Sent' | 'On Sale' | 'Sold Reported' | 'Settled' | 'Exception';
  consignmentSoldQty?: number;
  order_type?: 'NORMAL' | 'ADJUSTMENT';
  adjustmentOf?: string;
  adjReason?: string;
}

export interface ConsignmentStockRecord {
  id: string;
  soNo: string;
  customerName: string;
  productId: string | null;
  productName: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number;
  unitPrice: number;
  amount: number;
  settlementStatus: 'UNSETTLED' | 'PARTIAL' | 'SETTLED';
  receivedAmount?: number;
  createdAt: string;
}

export interface OrderItemRecord {
  orderId: string;
  desc: string;
  qty: number;
  price: number;
  unit_price?: number;
  lineTotal: number;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  date: string;
  amount: number;
  method: 'CASH' | 'BANK' | 'CHEQUE' | 'OTHER';
  note: string;
  userId: string;
}

export interface TransactionRecord {
  id: string;
  date: string;
  note: string;
  type: 'in' | 'out';
  amount: number;
  account: 'Corporate' | 'Personal' | 'Cash';
}