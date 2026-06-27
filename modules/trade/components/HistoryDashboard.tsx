import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, ClipboardList, Wallet,
  Clock, AlertCircle, AlertTriangle,
  Search, Calendar, Eye, RefreshCw, Plus, CreditCard,
  Zap, PackageCheck, PieChart as PieChartIcon,
  Download as DownloadIcon, X, Info, Save, History,
  ReceiptText, Box, Trash2, Ban, Edit3
} from 'lucide-react';

import {
  QuoteRecord,
  QuoteItemRecord,
  OrderRecord,
  PaymentRecord,
  OrderItemRecord,
  TransactionRecord,
  ConsignmentStockRecord
} from '../types';

import { roundTo2, calculateOutstanding, verifyFinancialBalance } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';

// New isolated interface for consignment settlements (Consignment_Settlements storage)
interface ConsignmentSettlementRecord {
  id: string;
  order_no: string;
  created_at: string;
  sold_qty: number;
  unit_price: number;           // pre-VAT unit price (stored for reference)
  tax_inclusive_price?: number; // unit_price × 1.05 (含税单价)
  amount: number;               // sold_qty × tax_inclusive_price (确认销售金额)
  payment_status: 'PAID';      // always PAID — no money, no record
  paid_amount: number;
  memo: string;
  voided?: boolean;
}

interface HistoryDashboardProps {
  currentUserId: string;
}

const safeStr = (v: any) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));
const NOTION_CONFIG = {
  TOKEN: '', // removed hardcoded secret during monorepo migration -- this field is unused dead config here
  STOCK_LEDGER_DB: "2c6d0b13b3b9804f9ccff92be2566c30"
};
const safeLower = (v: any) => safeStr(v).toLowerCase();
const safeDateStr = (v: any) => safeStr(v) ? safeStr(v) : '0000-00-00T00:00:00.000Z';

const HistoryDashboard: React.FC<HistoryDashboardProps> = ({ currentUserId }) => {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteItemRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // State for settlement history from order-specific storage
  const [orderSettlements, setOrderSettlements] = useState<ConsignmentSettlementRecord[]>([]);
  const [settlDelConfirm, setSettlDelConfirm] = useState<string | null>(null);
  const [editingItemId,   setEditingItemId]   = useState<string | null>(null);
  const [editingItemDesc, setEditingItemDesc] = useState('');

  // Quick Add Form state for Consignment Settlement
  const [setForm, setSetForm] = useState({
    sold_qty: 1,
    unit_price: 0,           // pre-VAT (from orderItem.price)
    tax_inclusive_price: 0,  // unit_price × 1.05 (auto-computed)
    amount: 0,               // sold_qty × tax_inclusive_price (auto)
    paid_amount: 0,          // defaults to amount; must be > 0 to submit
    memo: '',
    selectedItemName: ''
  });

  const [activeSubTab, setActiveSubTab] = useState<'analytics' | 'history' | 'orders' | 'ar'>('history');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [orderViewFilter, setOrderViewFilter] = useState<'ALL' | 'CONSIGNMENT'>('ALL');
  const [selectedQuote, setSelectedQuote] = useState<QuoteRecord | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<{ orderId: string, total: number } | null>(null);

  // ✅ AR view mode
  const [arMode, setArMode] = useState<'OUTSTANDING' | 'ALL'>('OUTSTANDING');

  // States for Adjustment (冲账)
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjStatus, setAdjStatus] = useState<'PAID' | 'PENDING'>('PENDING');

  const [conversionMode, setConversionMode] = useState<'Direct Sale' | 'Consignment'>('Direct Sale');
  const [isConverting, setIsConverting] = useState(false); // 防重复提交锁

  const loadLocalData = async () => {
    try {
      const [q, qi, o, oi, p] = await Promise.all([
        persistence.getQuotes(),
        persistence.getQuoteItems(),
        persistence.getOrders(),
        persistence.getOrderItems(),
        persistence.getPayments()
      ]);

      const _safeStr = (v: any) => (v === null || v === undefined ? '' : String(v));
      const _safeDate = (v: any) => _safeStr(v) || '0000-00-00T00:00:00.000Z';

      const sanitizeQuote = (x: any) => ({
        ...x,
        id: _safeStr(x?.id),
        customerName: _safeStr(x?.customerName),
        createdAt: _safeStr(x?.createdAt || x?.created_at),
        updatedAt: _safeStr(x?.updatedAt || x?.updated_at),
        status: _safeStr(x?.status) || 'DRAFT'
      });

      const sanitizeOrder = (x: any) => ({
        ...x,
        id: _safeStr(x?.id),
        customerName: _safeStr(x?.customerName),
        createdAt: _safeStr(x?.createdAt || x?.created_at),
        updatedAt: _safeStr(x?.updatedAt || x?.updated_at),
        transactionMode: _safeStr(x?.transactionMode),
        status: _safeStr(x?.status),
        dueDate: _safeStr(x?.dueDate)
      });

      const sanitizePayment = (x: any) => ({
        ...x,
        id: _safeStr(x?.id),
        orderId: _safeStr(x?.orderId),
        date: _safeStr(x?.date),
        note: _safeStr(x?.note),
        method: _safeStr(x?.method),
        userId: _safeStr(x?.userId)
      });

      const q2 = (Array.isArray(q) ? q : [])
        .map(sanitizeQuote)
        .sort((a: any, b: any) => _safeDate(b.createdAt).localeCompare(_safeDate(a.createdAt)));

      const o2 = (Array.isArray(o) ? o : [])
        .map(sanitizeOrder)
        .sort((a: any, b: any) => _safeDate(b.createdAt).localeCompare(_safeDate(a.createdAt)));

      setQuotes(q2 as any);
      setQuoteItems(Array.isArray(qi) ? qi : []);
      setOrders(o2 as any);
      setOrderItems(Array.isArray(oi) ? oi : []);
      setPayments((Array.isArray(p) ? p : []).map(sanitizePayment) as any);
    } catch (e) {
      setQuotes([]);
      setQuoteItems([]);
      setOrders([]);
      setOrderItems([]);
      setPayments([]);
    }
  };

  // ✅ mount 时也加载一次（关键）
  useEffect(() => { loadLocalData(); }, []);
  useEffect(() => { loadLocalData(); }, [activeSubTab]);

  // =========================
  // ✅ PDF Export (Stable)
  // =========================
  const exportElementAsPdfWysiwyg = async (element: HTMLElement, filename: string) => {
    try {
      const html2pdf = (window as any)?.html2pdf;
      if (!html2pdf) {
        alert('PDF engine not loaded.');
        return;
      }

      const clone = element.cloneNode(true) as HTMLElement;

      // normalize (prevent canvas offset / cropping)
      const normalizeForCanvas = (root: HTMLElement) => {
        const nodes = root.querySelectorAll<HTMLElement>('*');
        nodes.forEach((n) => {
          n.style.transform = 'none';
          n.style.filter = 'none';

          const style = window.getComputedStyle(n);
          const overflowY = style.overflowY;
          const overflow = style.overflow;

          if (
            overflow === 'auto' || overflow === 'scroll' ||
            overflowY === 'auto' || overflowY === 'scroll'
          ) {
            n.style.overflow = 'visible';
            n.style.overflowY = 'visible';
            n.style.maxHeight = 'none';
            n.style.height = 'auto';
          }
        });

        root.querySelectorAll<HTMLElement>('[data-no-pdf="true"]').forEach((n) => {
          n.style.display = 'none';
        });
      };

      normalizeForCanvas(clone);

      // Scale to 0.93x — visual width 794*0.93=738px, ~28px safe margin each side
      // prevents left-side PDF cropping from any minor capture x-offset
      const SCALE = 0.93;
      clone.style.transformOrigin = 'top center';
      clone.style.transform = `scale(${SCALE})`;

      // pdfSafeWrapper: 794px flex container — centers the scaled clone
      const pdfSafeWrapper = document.createElement('div');
      pdfSafeWrapper.style.width = '794px';
      pdfSafeWrapper.style.display = 'flex';
      pdfSafeWrapper.style.justifyContent = 'center';
      pdfSafeWrapper.style.overflow = 'hidden';
      pdfSafeWrapper.style.background = '#ffffff';

      // put wrapper inside viewport but invisible
      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '0';
      wrapper.style.top = '0';
      wrapper.style.width = '794px';
      wrapper.style.background = '#ffffff';
      wrapper.style.visibility = 'hidden';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '9999';
      wrapper.style.overflow = 'hidden';

      clone.style.width = '794px';
      clone.style.maxWidth = '794px';
      clone.style.background = '#ffffff';

      pdfSafeWrapper.appendChild(clone);
      wrapper.appendChild(pdfSafeWrapper);
      document.body.appendChild(wrapper);

      // Force layout, then clip pdfSafeWrapper to visual height (removes empty space from transform)
      void wrapper.offsetHeight;
      const naturalH = pdfSafeWrapper.scrollHeight;
      pdfSafeWrapper.style.height = `${Math.ceil(naturalH * SCALE)}px`;

      const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
          width: 794,
        },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      };

      // Capture pdfSafeWrapper so html2canvas sees the scaled, centered content
      await html2pdf().set(opt).from(pdfSafeWrapper).save();
      document.body.removeChild(wrapper);
    } catch (e) {
      alert('Export failed.');
    }
  };

  // iframe + window.print() — bypasses html2pdf entirely, uses browser print dialog (Save as PDF)
  const printPiByIframe = (elementId: string, title = 'PI') => {
    const el = document.getElementById(elementId);
    if (!el) { alert(`❌ 找不到打印区域: #${elementId}`); return; }

    const headNodes: string[] = [];
    document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
      const href = (node as HTMLLinkElement).href;
      if (href) headNodes.push(`<link rel="stylesheet" href="${href}" />`);
    });
    document.querySelectorAll('style').forEach((node) => {
      headNodes.push(`<style>${node.innerHTML}</style>`);
    });
    headNodes.push(`
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: #fff !important; }
        body { display: flex; justify-content: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        * { overflow: visible !important; box-sizing: border-box; }
      </style>
    `);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) { document.body.removeChild(iframe); alert('❌ 打印初始化失败'); return; }

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"/>${headNodes.join('\n')}</head><body>${el.outerHTML}</body></html>`);
    doc.close();

    setTimeout(() => {
      try { win.focus(); win.print(); } finally {
        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
      }
    }, 150);
  };

  // ─── jsPDF direct-draw PI PDF ───────────────────────────────────────────────

  // Extract only ASCII-printable English from a mixed CJK/English description.
  // Keeps alphanumeric, spaces, punctuation. Falls back to "PRODUCT ITEM" if empty.
  const extractEnglish = (raw: string, idx: number): string => {
    const eng = raw
      .replace(/[一-鿿㐀-䶿＀-￯　-〿]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toUpperCase();
    return eng.length >= 3 ? eng : `PRODUCT ITEM ${idx + 1}`;
  };

  const generatePiPdf = async (
    quote: typeof selectedQuote,
    rawItems: typeof quoteItems,
    filename: string
  ): Promise<void> => {
    if (!quote) return;

    // Lazy-load jsPDF UMD from CDN (no index.html change needed)
    if (!(window as any).jspdf) {
      await new Promise<void>((resolve, reject) => {
        if (document.querySelector('script[data-lib="jspdf"]')) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.dataset.lib = 'jspdf';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('jsPDF CDN load failed'));
        document.head.appendChild(s);
      });
    }

    const JsPDF = (window as any).jspdf?.jsPDF;
    if (!JsPDF) { alert('jsPDF engine unavailable'); return; }

    const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // ── Colours ──────────────────────────────────────────
    const NAVY  = [26, 35, 126] as const;
    const GRAY  = [150, 150, 150] as const;
    const DARK  = [30, 30, 30] as const;
    const LIGHT = [210, 210, 210] as const;

    // ── Layout constants ─────────────────────────────────
    const LM = 15;   // left margin mm
    const RM = 195;  // right margin (210-15) mm
    const CW = 180;  // content width mm

    // Column x positions (right-aligned values)
    const COL_QTY_X   = 145;  // qty center
    const COL_UP_X    = 170;  // unit price right edge
    const COL_TOT_X   = RM;   // total right edge
    const COL_DESC_W  = 125;  // max desc width mm

    const setColor = (rgb: readonly [number, number, number]) =>
      pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    const setDrawColor = (rgb: readonly [number, number, number]) =>
      pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
    const hLine = (y: number, lw: number, rgb: readonly [number, number, number]) => {
      setDrawColor(rgb);
      pdf.setLineWidth(lw);
      pdf.line(LM, y, RM, y);
    };

    let y = 15;

    // ── 1. Company header ────────────────────────────────
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    setColor(NAVY);
    pdf.text('GLOBALCARE INFO GENERAL TRADING FZCO', 105, y, { align: 'center' });

    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    setColor(GRAY);
    pdf.text('TEL: +971585566809  |  EMAIL: CHRISCHEN1579@GMAIL.COM', 105, y, { align: 'center' });

    y += 5;
    hLine(y, 0.8, NAVY);

    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    setColor(NAVY);
    pdf.text('P E R F O R M A N C E   I N V O I C E', 105, y, { align: 'center' });

    // ── 2. Meta row (DOC NO left, TERMS right) ───────────
    y += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    setColor(GRAY);
    pdf.text('DOC NO.', LM, y);
    pdf.text('TERMS & VALIDITY', RM, y, { align: 'right' });

    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    setColor(NAVY);
    pdf.text(safeStr(quote.id).toUpperCase(), LM, y);

    // Terms badge (filled rect)
    const terms = safeStr(quote.paymentTerms) || '--';
    const badgeW = 22;
    const badgeH = 5.5;
    const badgeX = RM - badgeW;
    const badgeY = y - 4.2;
    pdf.setFillColor(237, 240, 255);
    pdf.setDrawColor(180, 190, 240);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    setColor(NAVY);
    pdf.text(terms, badgeX + badgeW / 2, badgeY + 3.6, { align: 'center' });

    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(GRAY);
    const due = safeStr(quote.dueDate) || '--';
    pdf.text(`EXPECTED DUE: ${due}`, RM, y, { align: 'right' });

    // ── 3. Consignee ─────────────────────────────────────
    y += 10;
    hLine(y, 0.3, LIGHT);

    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    setColor(GRAY);
    pdf.text('CONSIGNEE', 105, y, { align: 'center' });

    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    setColor(DARK);
    pdf.text((safeStr(quote.customerName) || 'VALUED CLIENT').toUpperCase(), 105, y, { align: 'center' });

    y += 4;
    hLine(y, 0.3, LIGHT);

    // ── 4. Table header ──────────────────────────────────
    y += 7;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    setColor(GRAY);
    pdf.text('DESCRIPTION', LM, y);
    pdf.text('QTY',        COL_QTY_X, y, { align: 'center' });
    pdf.text('UNIT PRICE', COL_UP_X,  y, { align: 'right' });
    pdf.text('TOTAL',      COL_TOT_X, y, { align: 'right' });

    y += 2;
    hLine(y, 0.8, NAVY);
    y += 1;

    // ── 5. Item rows ─────────────────────────────────────
    const items = (rawItems || []).filter(i => i.quoteId === quote.id);
    const LINE_H = 4.8;

    items.forEach((it, idx) => {
      const unitPrice = Number((it as any).unit_price ?? it.price ?? 0) || 0;
      const lineTotal = Number(it.lineTotal ?? 0) || 0;
      const qty       = Number(it.qty ?? 0) || 0;
      const descText  = extractEnglish(safeStr(it.desc), idx);

      // Wrap description to COL_DESC_W mm
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const lines = pdf.splitTextToSize(descText, COL_DESC_W) as string[];
      const rowH = Math.max(lines.length * LINE_H + 3, 9);

      setColor(DARK);
      pdf.text(lines, LM, y + LINE_H);

      // QTY / UNIT PRICE / TOTAL (vertically centred in row)
      const midY = y + rowH / 2 + 1.5;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      setColor(GRAY);
      pdf.text(String(qty),                         COL_QTY_X, midY, { align: 'center' });
      pdf.text(unitPrice.toFixed(2),                COL_UP_X,  midY, { align: 'right' });
      setColor(DARK);
      pdf.text(lineTotal.toFixed(2),                COL_TOT_X, midY, { align: 'right' });

      y += rowH;
      hLine(y, 0.2, LIGHT);
      y += 1;
    });

    // ── 6. Bottom rule + totals ───────────────────────────
    y += 3;
    hLine(y, 0.8, NAVY);
    y += 8;

    const sub  = Number(quote.subtotal   ?? 0) || 0;
    const vat  = Number(quote.vat        ?? 0) || 0;
    const tot  = Number(quote.grandTotal ?? 0) || 0;
    const TOT_LABEL_X = 130;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    setColor(GRAY);
    pdf.text('Subtotal',  TOT_LABEL_X, y);
    pdf.text(`AED  ${sub.toFixed(2)}`, COL_TOT_X, y, { align: 'right' });

    y += 6;
    pdf.text('VAT (5%)', TOT_LABEL_X, y);
    pdf.text(`AED  ${vat.toFixed(2)}`, COL_TOT_X, y, { align: 'right' });

    y += 4;
    hLine(y, 0.3, LIGHT);
    y += 7;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    setColor(NAVY);
    pdf.text('GRAND TOTAL (AED)', TOT_LABEL_X, y);

    y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    setColor(NAVY);
    pdf.text(`AED  ${tot.toFixed(2)}`, COL_TOT_X, y, { align: 'right' });

    pdf.save(filename);
  };

  const handleDownloadPiPDF = async () => {
    if (!selectedQuote) return;
    try {
      await generatePiPdf(selectedQuote, quoteItems, `${safeStr(selectedQuote.id)}.pdf`);
    } catch (e) {
      alert('PDF generation failed. Please check your network and try again.');
      console.error('[PI PDF]', e);
    }
  };

  const handleDownloadOrderPDF = async () => {
    if (!selectedOrder) return;
    const el = document.getElementById('order-export-view');
    if (!el) return;
    await exportElementAsPdfWysiwyg(el, `${safeStr(selectedOrder.id)}.pdf`);
  };

  // =========================
  // ✅ Invoice-style UI (PI & Order)
  // =========================
  const companyName = 'GLOBALCARE INFO GENERAL TRADING FZCO';
  const companySub = 'TEL: +971585566809 | EMAIL: CHRISCHEN1579@GMAIL.COM';

  const InvoiceLikeView: React.FC<{
    docNo: string;
    consignee: string;
    title?: string;
    dueDate?: string;
    terms?: string;
    items: Array<{ desc: string; qty: number; unitPrice: number; total: number }>;
    subtotal: number;
    vat: number;
    grandTotal: number;
  }> = ({ docNo, consignee, title = 'PERFORMANCE INVOICE', dueDate, terms, items, subtotal, vat, grandTotal }) => {
    return (
      <div className="w-full bg-white">
        <div className="mx-auto w-[794px] bg-white p-10">
          <div className="border border-gray-100 shadow-sm p-10 bg-white">
            {/* Header */}
            <div className="text-center">
              <div className="text-[14px] font-black tracking-wider text-[#1a237e] uppercase">{companyName}</div>
              <div className="mt-1 text-xs font-bold tracking-wide text-gray-400 uppercase">{companySub}</div>

              <div className="mt-8 text-[14px] font-black tracking-[0.45em] text-[#1a237e] uppercase">
                {title}
              </div>

              <div className="mt-8 h-[2px] bg-[#1a237e]" />
            </div>

            {/* Meta */}
            <div className="mt-10 flex items-start justify-between">
              <div className="w-[55%]">
                <div className="text-xs font-black tracking-wide uppercase text-gray-400">Doc No.</div>
                <div className="mt-2 text-[12px] font-black tracking-widest text-[#1a237e] font-mono uppercase">{safeStr(docNo)}</div>
              </div>

              <div className="w-[45%] text-right">
                <div className="text-xs font-black tracking-wide uppercase text-gray-400">Terms & Validity</div>
                <div className="mt-2 inline-flex items-center justify-center px-6 py-2 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs font-black tracking-wide uppercase text-indigo-600">
                  {safeStr(terms) || '--'}
                </div>
                <div className="mt-2 text-xs font-bold tracking-wide uppercase text-gray-400">
                  Expected Due: {safeStr(dueDate) || '--'}
                </div>
              </div>
            </div>

            {/* Consignee */}
            <div className="mt-12 text-center">
              <div className="text-xs font-black tracking-wide uppercase text-gray-400">Consignee</div>
              <div className="mt-3 text-[18px] font-black tracking-wide text-gray-800 uppercase">
                {safeStr(consignee) || 'VALUED CLIENT'}
              </div>
              <div className="mt-3 h-[1px] bg-gray-100" />
            </div>

            {/* Table */}
            <div className="mt-10">
             <div
  className="grid text-xs font-black tracking-wide uppercase text-gray-400"
  style={{ gridTemplateColumns: 'minmax(0, 1fr) 90px 120px 140px' }}
>
  <div>Description</div>
  <div className="text-center">Qty</div>
  <div className="text-right whitespace-nowrap">Unit Price</div>
  <div className="text-right whitespace-nowrap">Total</div>
</div>

              <div className="mt-3 h-[2px] bg-[#1a237e]" />

              {items.length === 0 ? (
                <div className="py-20 text-center text-gray-300 font-black uppercase tracking-wide text-xs">
                  Empty...
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {items.map((it, idx) => (
                    <div
  key={idx}
  className="grid py-6 text-[11px] font-bold text-gray-700"
  style={{ gridTemplateColumns: 'minmax(0, 1fr) 90px 120px 160px' }}
>
  <div className="pr-6 uppercase break-words">
    {safeStr(it.desc)}
  </div>

  <div className="text-center font-mono text-gray-400 whitespace-nowrap tabular-nums">
    {it.qty}
  </div>

  <div className="text-right font-mono text-gray-400 whitespace-nowrap tabular-nums">
    {roundTo2(it.unitPrice).toFixed(2)}
  </div>

  <div className="text-right font-mono font-black text-gray-800 whitespace-nowrap tabular-nums pl-3">
    {roundTo2(it.total).toFixed(2)}
  </div>
</div>

                  ))}
                </div>
              )}
            </div>

            {/* Bottom line */}
            <div className="mt-10 h-[2px] bg-[#1a237e]" />

            {/* Totals */}
            <div className="mt-10 flex items-end justify-between">
              <div className="text-gray-300 font-black uppercase tracking-wide text-xs"> </div>

              <div className="w-[46%]">
                <div className="space-y-2 text-xs font-black uppercase tracking-wide text-gray-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono">AED {roundTo2(subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (5%)</span>
                    <span className="font-mono">AED {roundTo2(vat).toFixed(2)}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-end">
                    <div className="text-right">
                      <div className="text-xs font-black uppercase tracking-wide text-gray-400">Grand Total (AED)</div>
                      <div className="text-[40px] font-black font-mono tracking-tight text-[#1a237e] leading-none">
                        AED {roundTo2(grandTotal).toFixed(2)}
                      </div>
                    </div>
                    <div />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const buildPiItems = (q: QuoteRecord | null) => {
    if (!q) return [];
    return (quoteItems || [])
      .filter(i => i.quoteId === q.id)
      .map(i => {
        const qty = Number(i.qty ?? 0) || 0;
        const lineTotal = Number(i.lineTotal ?? 0) || 0;
        const unitPrice =
          Number((i as any).unit_price ?? i.price ?? (qty > 0 ? lineTotal / qty : 0)) || 0;
        return {
          desc: safeStr(i.desc),
          qty,
          unitPrice,
          total: lineTotal
        };
      });
  };

  const buildOrderItems = (o: OrderRecord | null) => {
    if (!o) return [];
    return (orderItems || [])
      .filter(i => i.orderId === o.id)
      .map(i => {
        const qty = Number(i.qty ?? 0) || 0;
        const lineTotal = Number(i.lineTotal ?? 0) || 0;
        const unitPrice =
          Number((i as any).unit_price ?? i.price ?? (qty > 0 ? lineTotal / qty : 0)) || 0;
        return {
          desc: safeStr(i.desc),
          qty,
          unitPrice,
          total: lineTotal
        };
      });
  };

  // =========================
  // Existing Functions
  // =========================
  const handleExportAllData = () => {
    try {
      const data = {
        quotes,
        quoteItems,
        orders,
        orderItems,
        payments
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `iCare_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed");
    }
  };

  const handleUpdateOrderMetadata = async (orderId: string, updates: Partial<OrderRecord>) => {
    const updated = (orders || []).map((o: OrderRecord) => o.id === orderId ? { ...o, ...updates } : o);
    await persistence.updateOrders(updated);
    setOrders(updated);
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder({ ...selectedOrder, ...updates });
    }
  };

  // Handle loading order-specific settlements and pre-filling unit price
  useEffect(() => {
    if (selectedOrder) {
      const loadSettlements = async () => {
        const saved = await persistence.getSettlements(selectedOrder.id);
        setOrderSettlements(Array.isArray(saved) ? saved : []);

        // Pre-fill unit price from the FIRST line item — CLEAN reset, no stale state carry-over.
        // VAT rule: item.price is pre-VAT; client billing = price × 1.05 (含税).
        const firstItem = orderItems.find(i => i.orderId === selectedOrder.id);
        const preVat = firstItem?.price ?? 0;
        const inclVat = roundTo2(preVat * 1.05);
        setSetForm({
          sold_qty: 1,
          unit_price: preVat as any,
          tax_inclusive_price: inclVat,
          selectedItemName: firstItem ? safeStr(firstItem.desc) : '',
          amount: inclVat,
          paid_amount: inclVat,
          memo: '',
        });
      };
      loadSettlements();
    } else {
      setOrderSettlements([]);
    }
  }, [selectedOrder, orderItems]);

  const handleCreateAdjustment = async () => {
    if (!selectedOrder || !adjAmount) return;
    const amountVal = roundTo2(-Math.abs(parseFloat(adjAmount)));

    if (isNaN(amountVal)) {
      alert("Invalid adjustment amount.");
      return;
    }

    const adjId = `ADJ-${selectedOrder.id}-${Date.now()}`;

    const newOrder: OrderRecord = {
      ...selectedOrder,
      id: adjId,
      createdAt: new Date().toISOString(),
      subtotal: amountVal,
      vat: 0,
      grandTotal: amountVal,
      paidAmount: adjStatus === 'PAID' ? amountVal : 0,
      outstandingAmount: adjStatus === 'PAID' ? 0 : amountVal,
      status: adjStatus as any,
      order_type: 'ADJUSTMENT',
      adjustmentOf: selectedOrder.id,
      adjReason: adjReason.trim() || undefined,
      transactionMode: 'Direct Sale'
    };

    const newOrderItem: OrderItemRecord = {
      orderId: adjId,
      desc: `Adjustment for ${selectedOrder.id}`,
      qty: 1,
      price: amountVal,
      unit_price: amountVal as any,
      lineTotal: amountVal
    };

    await Promise.all([
      persistence.saveOrder(newOrder),
      persistence.saveOrderItems([newOrderItem])
    ]);

    await loadLocalData();
    setShowAdjForm(false);
    setAdjAmount('');
    setAdjReason('');
    setSelectedOrder(null);
    alert(`✅ 冲账订单 ${adjId} 已创建。`);
  };

  const handleVoidOrder = async (orderId: string) => {
    if (!window.confirm(`确认作废订单 ${orderId}？\n作废后不计入统计，但保留记录。`)) return;
    const updated = (orders || []).map(o =>
      o.id === orderId ? { ...o, status: 'VOIDED' as any } : o
    );
    await persistence.updateOrders(updated);
    await loadLocalData();
    setSelectedOrder(null);
    alert(`✅ 订单 ${orderId} 已作废`);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const q = (quotes || []).find(x => x.id === quoteId);
    if (!q) return;
    const msg = q.status === 'CONVERTED'
      ? `⚠️ 该报价单已转为订单 ${(q as any).convertedOrderId}，删除报价单不影响已生成的订单。\n确认删除报价单 ${quoteId}？`
      : `确认删除报价单 ${quoteId}？`;
    if (!window.confirm(msg)) return;
    await Promise.all([
      persistence.updateQuotes((quotes || []).filter(x => x.id !== quoteId)),
      persistence.updateQuoteItems((quoteItems || []).filter(x => x.quoteId !== quoteId))
    ]);
    await loadLocalData();
    setSelectedQuote(null);
    alert(`✅ 报价单 ${quoteId} 已删除`);
  };

  const handleDeletePayment = async (paymentId: string) => {
    const target = (payments || []).find(p => p.id === paymentId);
    if (!target) return;
    if (!window.confirm(`确认删除收款记录 ${paymentId}（AED ${target.amount}）？\n将自动还原应收金额。`)) return;
    const newPayments = (payments || []).filter(p => p.id !== paymentId);
    const orderPayments = newPayments.filter(p => p.orderId === target.orderId);
    const newPaid = roundTo2(orderPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const updatedOrders = (orders || []).map(o => {
      if (o.id !== target.orderId) return o;
      const newOutstanding = calculateOutstanding(o.grandTotal, newPaid);
      const newStatus = newOutstanding <= 0 ? 'PAID' as const : newPaid > 0 ? 'PARTIAL' as const : 'PENDING' as const;
      return { ...o, paidAmount: newPaid, outstandingAmount: newOutstanding, status: newStatus };
    });
    await Promise.all([
      persistence.updateOrders(updatedOrders),
      persistence.updatePayments(newPayments)
    ]);
    await loadLocalData();
  };

  const handleVoidAdjustment = async (adjId: string) => {
    if (!window.confirm(`确认撤销冲账单 ${adjId}？\n撤销后不计入统计，但保留记录。`)) return;
    const updated = (orders || []).map(o =>
      o.id === adjId ? { ...o, status: 'VOIDED' as any } : o
    );
    await persistence.updateOrders(updated);
    await loadLocalData();
    alert(`✅ 冲账单 ${adjId} 已撤销`);
  };

  // Logic for adding a settlement record to isolated order-specific storage
  const handleAddSettlement = async () => {
    if (!selectedOrder) return;

    // Guard 1: 销售数量必须为正整数
    if (!Number.isInteger(setForm.sold_qty) || setForm.sold_qty <= 0) {
      alert("⚠️ 本次销售数量必须为正整数（≥ 1）。");
      return;
    }

    // Guard 2: 没有收到钱，不登记冲账
    if (setForm.paid_amount <= 0) {
      alert("⚠️ 没有收到钱，不登记冲账。\n货继续留在寄售库存。请先确认实际收款金额（> 0）再提交。");
      return;
    }

    // Guard 3: 实收不能超过确认销售金额
    if (setForm.paid_amount > setForm.amount) {
      alert(`⚠️ 本次实收金额（AED ${setForm.paid_amount.toFixed(2)}）不能大于本次确认销售金额（AED ${setForm.amount.toFixed(2)}）。`);
      return;
    }

    // Compute inclusive price (fallback in case tax_inclusive_price wasn't set)
    const inclPrice = setForm.tax_inclusive_price > 0
      ? setForm.tax_inclusive_price
      : roundTo2(setForm.unit_price * 1.05);

    // Auto-tag memo with product & price metadata
    const tag = `[ITEM: ${setForm.selectedItemName} | EXCL: ${setForm.unit_price} | INCL: ${inclPrice}]`;
    const finalMemo = setForm.memo.trim() ? `${tag} ${setForm.memo.trim()}` : tag;

    const newSettlement: ConsignmentSettlementRecord = {
      id: `SET-${Date.now()}`,
      order_no: selectedOrder.id,
      created_at: new Date().toISOString(),
      sold_qty: setForm.sold_qty,
      unit_price: setForm.unit_price,
      tax_inclusive_price: inclPrice,
      amount: setForm.amount,
      payment_status: 'PAID',
      paid_amount: setForm.paid_amount,
      memo: finalMemo
    };

    const updated = [newSettlement, ...(orderSettlements || [])];
    await persistence.saveSettlements(selectedOrder.id, updated);
    setOrderSettlements(updated);

    // Complete form reset after save — default paid_amount = 1 × inclusive price (ready for next entry)
    const nextInclPrice = roundTo2(setForm.unit_price * 1.05);
    setSetForm(prev => ({
      sold_qty: 1,
      unit_price: prev.unit_price,
      tax_inclusive_price: nextInclPrice,
      amount: nextInclPrice,
      paid_amount: nextInclPrice,
      memo: '',
      selectedItemName: prev.selectedItemName,
    }));
  };

  const handleVoidSettlement = async (settlId: string) => {
    if (!selectedOrder) return;
    const updated = (orderSettlements || []).map(s =>
      s.id === settlId ? { ...s, voided: true } : s
    );
    await persistence.saveSettlements(selectedOrder.id, updated);
    setOrderSettlements(updated);
    setSettlDelConfirm(null);
  };

  const handleSaveItemDesc = async (item: any, newDesc: string) => {
    const trimmed = newDesc.trim();
    if (!trimmed) { alert('产品名不能为空'); return; }
    const updated = (orderItems || []).map(i =>
      (i as any).id === item.id ? { ...i, desc: trimmed } : i
    );
    await persistence.saveOrderItems([{ ...item, desc: trimmed }]);
    setOrderItems(updated);
    setEditingItemId(null);
  };

  const settlementTotals = useMemo(() => {
    const totals = { sold_qty: 0, should_collect: 0, paid: 0, outstanding: 0 };
    (orderSettlements || []).filter(s => !s.voided).forEach(s => {
      totals.sold_qty += (s?.sold_qty || 0);
      totals.should_collect = roundTo2(totals.should_collect + (s?.amount || 0));
      totals.paid = roundTo2(totals.paid + (s?.paid_amount || 0));
    });
    totals.outstanding = roundTo2(totals.should_collect - totals.paid);
    return totals;
  }, [orderSettlements]);

  // Warning check: Total Sold Qty exceeds Delivered Qty (sum of line items)
  const deliveredQty = useMemo(() => {
    if (!selectedOrder) return 0;
    return (orderItems || [])
      .filter(i => i.orderId === selectedOrder.id)
      .reduce((sum, i) => sum + (i?.qty || 0), 0);
  }, [selectedOrder, orderItems]);

  const convertQuoteToOrder = async (quote: QuoteRecord, mode: 'Direct Sale' | 'Consignment') => {
    if (!quote) return;

    // ── Guard 1: already converted (status check) ──────────────────────────
    if (quote.status === 'CONVERTED') {
      alert('⚠️ 该报价单已转单，请勿重复操作。');
      return;
    }

    // ── Guard 2: submission lock (prevents double-click race) ──────────────
    if (isConverting) return;

    // ── Guard 3: in-memory order dedup (quoteId already has an order) ──────
    const existingOrder = (orders || []).find((o: any) => o.quoteId === quote.id);
    if (existingOrder) {
      alert(`⚠️ 该报价单已生成订单：${existingOrder.id}，请勿重复创建。`);
      return;
    }

    setIsConverting(true);
    try {
      const soNo = `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const sourceItems = (quoteItems || []).filter(i => i.quoteId === quote.id);

      const isConsignment = mode === 'Consignment';

      const newOrder: OrderRecord = {
        id: soNo,
        quoteId: quote.id,
        createdAt: new Date().toISOString(),
        customerId: quote.customerId,
        customerName: quote.customerName,
        subtotal: roundTo2(quote.subtotal),
        vat: roundTo2(quote.vat),
        grandTotal: roundTo2(quote.grandTotal),
        paidAmount: 0,
        outstandingAmount: isConsignment ? 0 : roundTo2(quote.grandTotal),
        status: isConsignment ? 'CONSIGNMENT' : 'PENDING',
        userId: currentUserId,
        paymentTerms: quote.paymentTerms,
        dueDate: quote.dueDate,
        transactionMode: mode,
        order_type: 'NORMAL'
      };

      const newOrderItems: OrderItemRecord[] = sourceItems.map(si => ({
        orderId: soNo,
        productId: si.productId,
        desc: si.desc,
        qty: si.qty,
        price: roundTo2(si.price),
        unit_price: (si as any).unit_price,
        lineTotal: roundTo2(si.lineTotal)
      }));

      const updatedQuotes = (quotes || []).map(q =>
        q.id === quote.id ? { ...q, status: 'CONVERTED' as const, convertedOrderId: soNo } : q
      );

      await Promise.all([
        persistence.updateQuotes(updatedQuotes),
        persistence.saveOrder(newOrder),
        persistence.saveOrderItems(newOrderItems)
      ]);

      try {
        const notionRes = await fetch('/api/trade/notion-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            soNo,
            mode,
            customerName: quote.customerName,
            items: newOrderItems.map(i => ({
              desc: i.desc,
              qty: i.qty,
              productId: i.productId || null
            }))
          })
        });
        if (notionRes.status === 409) {
          console.warn(`⚠️ STOCK_LEDGER: SO ${soNo} 已存在流水，本次写入已跳过（防重复）`);
        } else if (!notionRes.ok) {
          console.error("❌ Notion 扣库存失败:", await notionRes.text());
        } else {
          console.log(`✅ 库存流水写入成功 (${isConsignment ? '寄售出库' : '销售出库'})`);
        }
      } catch (e) {
        console.error("❌ Notion 扣库存异常:", e);
      }

      // Consignment: auto-create customer consignment stock entries
      if (isConsignment) {
        const stockItems: ConsignmentStockRecord[] = newOrderItems.map((i, idx) => ({
          id: `CSTOCK-${soNo}-${idx}`,
          soNo,
          customerName: quote.customerName,
          productId: (i as any).productId || null,
          productName: i.desc,
          consignedQty: i.qty,
          soldQty: 0,
          remainingQty: i.qty,
          unitPrice: i.price,
          amount: roundTo2(i.qty * i.price),
          settlementStatus: 'UNSETTLED',
          createdAt: new Date().toISOString()
        }));
        try {
          await persistence.saveConsignmentStockItems(soNo, stockItems);
        } catch (e) {
          console.warn('Failed to save consignment stock:', e);
        }
      }

      await loadLocalData();
      setSelectedQuote(null);
      alert(`✅ 订单 ${soNo} 已生成（${mode === 'Consignment' ? '代售' : '直售'}）`);
    } catch (e: any) {
      alert(`❌ 订单生成失败：${e?.message || '未知错误'}，请重试。`);
    } finally {
      // 一定执行：无论成功/失败/网络异常，均解锁按钮
      setIsConverting(false);
    }
  };

  const recordPayment = async (amount: number, method: any, note: string) => {
    if (!showPaymentModal) return;
    const amt = roundTo2(amount);

    const targetOrder = (orders || []).find(o => o.id === showPaymentModal.orderId);
    if (!targetOrder) return;

    // ✅ Guard: prevent double-payment on already-settled orders
    const currentOutstanding = roundTo2(targetOrder.outstandingAmount ?? targetOrder.grandTotal ?? 0);
    if (currentOutstanding <= 0) {
      alert("⚠️ 该订单已结清（应收余额为 0），无需再次付款。");
      setShowPaymentModal(null);
      return;
    }
    if (amt <= 0) {
      alert("⚠️ 收款金额必须大于 0。");
      return;
    }

    const newPaid = roundTo2((targetOrder.paidAmount || 0) + amt);
    const newOutstanding = calculateOutstanding(targetOrder.grandTotal, newPaid);

    if (!verifyFinancialBalance(targetOrder.grandTotal, newPaid, newOutstanding)) {
      alert("⚠️ 核销精度异常，请重新尝试。");
      return;
    }

    const newPayment: PaymentRecord = {
      id: `PAY-${Date.now()}`,
      orderId: showPaymentModal.orderId,
      date: new Date().toISOString().split('T')[0],
      amount: amt,
      method,
      note,
      userId: currentUserId
    };

    const newTxn: TransactionRecord = {
      id: `TXN-${Date.now()}`,
      date: newPayment.date,
      type: 'IN',
      amount: newPayment.amount,
      method: newPayment.method as any,
      refType: 'PAYMENT',
      refId: newPayment.id,
      orderId: newPayment.orderId,
      customerName: targetOrder.customerName,
      note: newPayment.note || 'Payment received',
      createdAt: new Date().toISOString(),
      userId: currentUserId
    };

    const updatedOrders = (orders || []).map(o => {
      if (o.id === showPaymentModal.orderId) {
        return {
          ...o,
          paidAmount: newPaid,
          outstandingAmount: newOutstanding,
          status: newOutstanding <= 0 ? 'PAID' as const : 'PARTIAL' as const
        };
      }
      return o;
    });

    const existingTxns = await persistence.getTransactions();

    await Promise.all([
      persistence.updateOrders(updatedOrders),
      persistence.savePayment(newPayment),
      persistence.saveTransactions([newTxn, ...existingTxns])
    ]);

    await loadLocalData();
    setShowPaymentModal(null);
  };

  const stats = useMemo(() => {
    // ✅ Deduplicate orders by business id before all stats calculations
    const dedupStatsMap = new Map<string, any>();
    for (const o of (orders || [])) {
      const bizId = o?.id;
      if (!bizId) continue;
      const existing = dedupStatsMap.get(bizId);
      if (!existing) {
        dedupStatsMap.set(bizId, o);
      } else {
        const tNew = safeStr((o as any)?.updatedAt || (o as any)?.updated_at || '');
        const tOld = safeStr((existing as any)?.updatedAt || (existing as any)?.updated_at || '');
        if (tNew > tOld) dedupStatsMap.set(bizId, o);
      }
    }
    const dedupedOrders = Array.from(dedupStatsMap.values());

    const billable = dedupedOrders.filter(o =>
      (o as any).order_type !== 'ADJUSTMENT' &&
      (o as any).status !== 'VOIDED' &&
      (o as any).transactionMode !== 'Consignment'
    );
    const activeQuotes = (quotes || []).filter(q => (q as any).status !== 'VOIDED');
    const totalQuotedVal = roundTo2(activeQuotes.reduce((s, q) => s + (q?.grandTotal || 0), 0));
    const totalOrderVal = roundTo2(billable.reduce((s, o) => s + (o?.grandTotal || 0), 0));
    const totalOutstandingVal = roundTo2(billable.reduce((s, o) => s + (o?.outstandingAmount || 0), 0));
    const convRate = activeQuotes.length > 0 ? (billable.length / activeQuotes.length) * 100 : 0;

    const productMap: Record<string, { qty: number, revenue: number }> = {};
    ((orderItems && orderItems.length > 0) ? orderItems : quoteItems || []).forEach((item: any) => {
      const name = safeStr(item?.desc);
      if (!name) return;
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
      productMap[name].qty += (item?.qty || 0);
      productMap[name].revenue = roundTo2(productMap[name].revenue + (item?.lineTotal || 0));
    });

    const topProducts = Object.entries(productMap)
      .sort((a, b) => (b[1]?.revenue || 0) - (a[1]?.revenue || 0))
      .slice(0, 8);

    return { totalQuotedVal, totalOrderVal, totalOutstandingVal, convRate, topProducts };
  }, [quotes, orders, orderItems, quoteItems]);

  const filteredQuotes = useMemo(() => {
    const st = safeLower(searchTerm);
    return (quotes || [])
      .filter(q => {
        const matchSearch =
          safeLower(q?.customerName).includes(st) ||
          safeLower(q?.id).includes(st);
        const matchStatus = statusFilter === 'ALL' || q?.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a: any, b: any) => {
        const tb = safeDateStr(b?.createdAt);
        const ta = safeDateStr(a?.createdAt);
        return tb.localeCompare(ta);
      });
  }, [quotes, searchTerm, statusFilter]);

  const filteredOrders = useMemo(() => {
    const st = safeLower(searchTerm);
    return (orders || [])
      .filter(o => {
        const matchSearch =
          safeLower(o?.customerName).includes(st) ||
          safeLower(o?.id).includes(st);
        const matchType = orderViewFilter === 'ALL' || o?.transactionMode === 'Consignment';
        return matchSearch && matchType;
      })
      .sort((a: any, b: any) => {
        const tb = safeDateStr(b?.createdAt);
        const ta = safeDateStr(a?.createdAt);
        return tb.localeCompare(ta);
      });
  }, [orders, searchTerm, orderViewFilter]);

  // AR Ledger — exclude VOIDED, ADJUSTMENT, pure CONSIGNMENT (no AR until settled)
  const arLedger = useMemo(() => {
    // ✅ Deduplicate by business order id (e.g. SO-...), keep only the latest updatedAt row.
    // Prevents stale cloud duplicates from polluting the AR list even if localStorage
    // still has an old row that hasn't been evicted yet.
    const dedupMap = new Map<string, any>();
    for (const o of (orders || [])) {
      const bizId = o?.id;
      if (!bizId) continue;
      const existing = dedupMap.get(bizId);
      if (!existing) {
        dedupMap.set(bizId, o);
      } else {
        const tNew = safeStr((o as any)?.updatedAt || (o as any)?.updated_at || '');
        const tOld = safeStr((existing as any)?.updatedAt || (existing as any)?.updated_at || '');
        if (tNew > tOld) dedupMap.set(bizId, o);
      }
    }
    const deduped = Array.from(dedupMap.values());

    const eligible = deduped.filter(o =>
      (o as any).status !== 'VOIDED' &&
      (o as any).order_type !== 'ADJUSTMENT' &&
      (o as any).status !== 'CONSIGNMENT'
    );
    const base = arMode === 'OUTSTANDING'
      ? eligible.filter(o => roundTo2(o?.outstandingAmount || 0) !== 0)
      : eligible;

    return base.slice().sort((a: any, b: any) => {
      const ad = safeStr(a?.dueDate);
      const bd = safeStr(b?.dueDate);
      if (ad && bd) return ad.localeCompare(bd);
      const ta = safeDateStr(a?.createdAt);
      const tb = safeDateStr(b?.createdAt);
      return tb.localeCompare(ta);
    });
  }, [orders, arMode]);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-20">
      {/* Top Tabs */}
      <div className="flex bg-white p-2 rounded-[30px] shadow-sm border border-gray-100 w-fit self-center no-print relative">
        {[
          { id: 'history', label: '报价历史', icon: ClipboardList },
          { id: 'orders', label: '订单中心', icon: PackageCheck },
          { id: 'ar', label: '应收核销', icon: Wallet }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id as any); setSearchTerm(''); }}
            className={`px-8 py-4 rounded-[22px] text-sm font-bold transition-all flex items-center gap-3 ${activeSubTab === tab.id ? 'bg-[#1a237e] text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}

        {/* Manual Refresh */}
        <button
          onClick={loadLocalData}
          className="ml-2 px-5 py-4 rounded-[22px] text-xs font-bold transition-all flex items-center gap-2 bg-gray-50 text-gray-400 hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* ===== analytics ===== */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-all">
                <ReceiptText className="w-16 h-16" />
              </div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Total Quoted (AED)</p>
              <p className="text-4xl font-black text-[#1a237e] font-mono leading-none tracking-tighter">{stats.totalQuotedVal.toFixed(2)}</p>
            </div>

            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm relative group overflow-hidden">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Conversion Rate</p>
              <p className="text-4xl font-black text-emerald-600 font-mono leading-none tracking-tighter">{stats.convRate.toFixed(1)}%</p>
            </div>

            <div className="bg-[#1a237e] p-10 rounded-[40px] shadow-2xl text-white relative group overflow-hidden">
              <p className="text-xs font-black text-indigo-300 uppercase tracking-wide mb-2">Internal Orders (AED)</p>
              <p className="text-4xl font-black font-mono leading-none tracking-tighter">{stats.totalOrderVal.toFixed(2)}</p>
            </div>

            <div className="bg-red-50 p-10 rounded-[40px] border border-red-100 shadow-sm relative group overflow-hidden">
              <p className="text-xs font-black text-red-400 uppercase tracking-wide mb-2">Outstanding AR</p>
              <p className="text-4xl font-black text-red-600 font-mono leading-none tracking-tighter">{stats.totalOutstandingVal.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[50px] border border-gray-100 shadow-sm">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
                <PieChartIcon className="w-5 h-5 text-indigo-600" /> Best Selling Product Mix (Revenue)
              </h3>

              <div className="space-y-6">
                {stats.topProducts.map(([name, data], idx) => (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-black text-gray-600 truncate pr-6">{name}</span>
                      <span className="text-xs font-black text-indigo-600 font-mono">AED {data.revenue.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${(data.revenue / (stats.topProducts[0]?.[1]?.revenue || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-400 font-mono">Qty: {data.qty}</span>
                  </div>
                ))}
                {stats.topProducts.length === 0 && (
                  <div className="py-20 text-center text-gray-300 uppercase text-xs font-black tracking-wide">
                    No transaction data recorded
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-900 p-10 rounded-[50px] text-white flex flex-col h-full relative overflow-hidden group">
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
              <h3 className="text-xs font-black text-indigo-300 uppercase tracking-wide mb-12 flex items-center gap-3 relative z-10">
                <PieChartIcon className="w-5 h-5" /> Product Portfolio Share
              </h3>

              <div className="flex-1 flex flex-col justify-center gap-5 relative z-10">
                {stats.topProducts.slice(0, 5).map(([name, data], idx) => {
                  const share = (data.revenue / (stats.totalOrderVal || 1)) * 100;
                  return (
                    <div key={idx} className="flex items-center gap-5 bg-white/5 p-5 rounded-[30px] border border-white/5 backdrop-blur-md hover:bg-white/10 transition-all cursor-default">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm" style={{ backgroundColor: `hsl(${220 + idx * 30}, 75%, 55%)` }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-black truncate text-indigo-50">{name}</p>
                        <p className="text-xs font-bold text-gray-400">{share.toFixed(1)}% Revenue Share</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black font-mono">AED {data.revenue.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ===== history ===== */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-[50px] border border-gray-100 shadow-2xl overflow-hidden flex flex-col min-h-[650px]">
          <div className="p-10 bg-gray-50/50 border-b flex flex-col md:flex-row items-center gap-6">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
              <input
                type="text"
                placeholder="按客户名或报价单号搜索..."
                value={searchTerm}
                on Change={e => setSearchTerm(e.target.value)}
                className="w-full pl-16 p-5 bg-white border-2 border-gray-100 rounded-[30px] font-bold text-sm outline-none focus:border-[#1a237e] shadow-sm transition-all"
              />
            </div>

            <div className="flex items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm shrink-0">
              <span className="px-4 text-xs font-black text-gray-400 uppercase border-r mr-2">Status</span>
              {['ALL', 'QUOTED', 'CONVERTED'].map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${statusFilter === f ? 'bg-[#1a237e] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportAllData}
              className="p-4 bg-white border border-gray-100 rounded-2xl text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
              title="Export Backup"
            >
              <DownloadIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wide sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-10 py-6">ID / Date</th>
                  <th className="px-10 py-6">Customer</th>
                  <th className="px-10 py-6 text-center">Due Date</th>
                  <th className="px-10 py-6">Status</th>
                  <th className="px-10 py-6 text-right">Total (AED)</th>
                  <th className="px-10 py-6"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filteredQuotes.map(q => (
                  <tr key={q.id} className="hover:bg-indigo-50/40 transition-all group">
                    <td className="px-10 py-8 font-mono font-black text-sm text-indigo-600">
                      {safeStr(q.id)}
                      <br />
                      <span className="text-gray-400 font-bold text-xs">
                        {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '--'}
                      </span>
                    </td>
                    <td className="px-10 py-8 font-black text-gray-700 text-sm">
                      {safeStr(q.customerName) || '--'}
                    </td>
                    <td className="px-10 py-8 text-center">
                      <span className="px-3 py-1 bg-gray-50 rounded-lg text-xs font-black text-gray-500 border border-gray-100">
                        {safeStr(q.dueDate) || '--'}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wide shadow-sm border ${q.status === 'CONVERTED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-100'}`}>
                        {safeStr(q.status)}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-right font-black font-mono text-gray-800 text-sm">
                      {(q.grandTotal ?? 0).toFixed(2)}
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedQuote(q)}
                          className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:bg-[#1a237e] hover:text-white transition-all"
                          title="View Quote"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(q.id)}
                          className="p-4 bg-white border border-red-100 rounded-2xl shadow-sm hover:bg-red-600 hover:text-white transition-all text-red-400"
                          title="Delete Quote"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredQuotes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-gray-300 font-black uppercase text-xs">
                      没有匹配的记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== orders ===== */}
      {activeSubTab === 'orders' && (
        <div className="bg-white rounded-[50px] border border-gray-100 shadow-2xl overflow-hidden flex flex-col min-h-[650px]">
          <div className="p-10 bg-gray-50/50 border-b flex flex-col md:flex-row items-center gap-6">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
              <input
                type="text"
                placeholder="搜索订单..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-16 p-5 bg-white border-2 border-gray-100 rounded-[30px] font-bold text-sm outline-none focus:border-indigo-600 shadow-sm transition-all"
              />
            </div>

            <div className="flex items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm shrink-0">
              <button
                onClick={() => setOrderViewFilter('ALL')}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${orderViewFilter === 'ALL' ? 'bg-[#1a237e] text-white' : 'text-gray-400'}`}
              >
                全部订单
              </button>
              <button
                onClick={() => setOrderViewFilter('CONSIGNMENT')}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${orderViewFilter === 'CONSIGNMENT' ? 'bg-orange-600 text-white' : 'text-gray-400'}`}
              >
                代售订单
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wide sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-10 py-6">Order No.</th>
                  <th className="px-10 py-6">Customer</th>
                  <th className="px-10 py-6 text-center">Type</th>
                  <th className="px-10 py-6 text-center">Status</th>
                  <th className="px-10 py-6 text-right">Collected</th>
                  <th className="px-10 py-6 text-right">Total (AED)</th>
                  <th className="px-10 py-6"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-indigo-50/30 transition-all">
                    <td className="px-10 py-8 font-mono font-black text-sm text-[#1a237e]">
                      {safeStr(o.id)}
                      <br />
                      <span className="text-gray-400 font-bold text-xs">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '--'}
                      </span>
                    </td>
                    <td className="px-10 py-8 font-black text-gray-700 text-sm">
                      {safeStr(o.customerName) || '--'}
                    </td>
                    <td className="px-10 py-8 text-center">
                      <span className={`px-3 py-1 rounded-lg text-xs font-black ${o.transactionMode === 'Consignment' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                        {safeStr(o.transactionMode || 'Direct')}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wide border ${
                        o.status === 'PAID' ? 'bg-emerald-600 text-white border-emerald-600' :
                        o.status === 'VOIDED' ? 'bg-gray-200 text-gray-400 border-gray-200 line-through' :
                        o.status === 'CONSIGNMENT' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                        'bg-indigo-50 text-indigo-600 border-indigo-100'
                      }`}>
                        {safeStr(o.status)}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-right font-mono text-emerald-600 font-bold">
                      {(o.paidAmount ?? 0).toFixed(2)}
                    </td>
                    <td className="px-10 py-8 text-right font-black font-mono text-gray-800">
                      {(o.grandTotal ?? 0).toFixed(2)}
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedOrder(o)}
                          className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:bg-indigo-600 hover:text-white transition-all"
                          title="View Order"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(o as any).status !== 'VOIDED' && (
                          <button
                            onClick={() => (o as any).order_type === 'ADJUSTMENT'
                              ? handleVoidAdjustment(o.id)
                              : handleVoidOrder(o.id)
                            }
                            className="p-3 bg-white border border-red-100 rounded-xl shadow-sm hover:bg-red-600 hover:text-white transition-all text-red-400"
                            title={(o as any).order_type === 'ADJUSTMENT' ? 'Void Adjustment' : 'Void Order'}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-gray-300 font-black uppercase text-xs">
                      没有匹配的订单
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== AR ===== */}
      {activeSubTab === 'ar' && (
        <div className="space-y-6">
          {/* AR mode toggle */}
          <div className="flex items-center justify-center gap-2">
            <div className="flex bg-white p-2 rounded-[22px] shadow-sm border border-gray-100 w-fit">
              <button
                type="button"
                onClick={() => setArMode('OUTSTANDING')}
                className={`px-6 py-3 rounded-[16px] text-xs font-black uppercase tracking-wide transition-all ${arMode === 'OUTSTANDING' ? 'bg-[#1a237e] text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                仅应收(未结清)
              </button>
              <button
                type="button"
                onClick={() => setArMode('ALL')}
                className={`px-6 py-3 rounded-[16px] text-xs font-black uppercase tracking-wide transition-all ${arMode === 'ALL' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                全部订单(含已结清)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {arLedger.map(o => {
              const outstanding = roundTo2(o?.outstandingAmount || 0);
              const isPaid = outstanding === 0;
              const isOverdue = !isPaid && o?.dueDate ? (new Date() > new Date(o.dueDate)) : false;

              return (
                <div key={o.id} className="bg-white border border-gray-100 rounded-[50px] p-10 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden group">
                  {isPaid ? (
                    <div className="absolute top-0 right-0 bg-emerald-600 text-white px-8 py-2 rounded-bl-[30px] text-xs font-black uppercase tracking-wide">
                      PAID
                    </div>
                  ) : isOverdue ? (
                    <div className="absolute top-0 right-0 bg-red-600 text-white px-8 py-2 rounded-bl-[30px] text-xs font-black uppercase tracking-wide flex items-center gap-2 animate-pulse">
                      <AlertCircle className="w-3 h-3" /> OVERDUE
                    </div>
                  ) : (
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white px-8 py-2 rounded-bl-[30px] text-xs font-black uppercase tracking-wide">
                      PENDING
                    </div>
                  )}

                  <div className="mb-8">
                    <h4 className="text-sm font-black text-gray-500 mb-1">{safeStr(o.customerName) || '--'}</h4>
                    <p className="text-lg font-black text-gray-800 font-mono tracking-tighter">{safeStr(o.id)}</p>
                  </div>

                  <div className="space-y-4 mb-10">
                    <div className="flex justify-between items-center py-3 border-b border-gray-50">
                      <span className="text-xs font-black text-gray-400 uppercase">Total Value</span>
                      <span className="font-mono font-black text-gray-800">AED {(o.grandTotal ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-gray-50">
                      <span className="text-xs font-black text-gray-400 uppercase">Collected</span>
                      <span className="font-mono font-black text-emerald-600">AED {(o.paidAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-4">
                      <span className={`text-xs font-black uppercase ${isPaid ? 'text-emerald-500' : 'text-red-400'}`}>
                        Outstanding
                      </span>
                      <span className={`text-3xl font-black font-mono tracking-tighter leading-none ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                        AED {(o.outstandingAmount ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-black text-gray-400 uppercase tracking-wide mb-8">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" /> Due: {safeStr(o.dueDate) || '--'}
                    </div>
                    <div className="flex items-center gap-1 font-mono">{safeStr(o.paymentTerms).slice(0, 15)}...</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(o)}
                      className="w-full py-5 bg-white border border-gray-100 text-gray-700 rounded-[28px] font-black uppercase text-xs tracking-wide shadow-sm flex items-center justify-center gap-3 hover:bg-gray-50 transition-all active:scale-95"
                    >
                      <Eye className="w-4 h-4" /> 查看详情
                    </button>

                    <button
                      type="button"
                      disabled={isPaid}
                      onClick={() => setShowPaymentModal({ orderId: o.id, total: o.outstandingAmount })}
                      className={`w-full py-5 rounded-[28px] font-black uppercase text-xs tracking-wide shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 ${isPaid ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none' : 'bg-gray-900 text-white hover:bg-emerald-600'}`}
                    >
                      <CreditCard className="w-4 h-4" /> 录入收款
                    </button>
                  </div>
                </div>
              );
            })}

            {arLedger.length === 0 && (
              <div className="col-span-full py-40 text-center text-gray-300 uppercase text-xs font-black tracking-wide">
                {arMode === 'OUTSTANDING' ? '完美！所有应收已结清。' : '暂无任何订单记录。'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Quote Detail Modal (Invoice-style) ===== */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[5000] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl rounded-[60px] overflow-hidden flex flex-col shadow-2xl h-[85vh] border-4 border-white/20">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/50" data-no-pdf="true">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <ClipboardList className="w-6 h-6 text-[#1a237e]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">PI Summary: {safeStr(selectedQuote.id)}</h3>
                  <p className="text-xs font-bold text-gray-400 font-mono mt-0.5">
                    Finalized on {selectedQuote.createdAt ? new Date(selectedQuote.createdAt).toLocaleDateString() : '--'}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-full transition-all group">
                <X className="w-8 h-8 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* ✅ On-screen = invoice-like, and export uses same view (WYSIWYG) */}
            <div className="flex-1 overflow-auto custom-scrollbar bg-white">
              <div id="pi-export-view">
                <InvoiceLikeView
                  docNo={safeStr(selectedQuote.id)}
                  consignee={safeStr(selectedQuote.customerName) || 'VALUED CLIENT'}
                  title="PERFORMANCE INVOICE"
                  terms={safeStr(selectedQuote.paymentTerms)}
                  dueDate={safeStr(selectedQuote.dueDate)}
                  items={buildPiItems(selectedQuote)}
                  subtotal={Number(selectedQuote.subtotal ?? 0) || 0}
                  vat={Number(selectedQuote.vat ?? 0) || 0}
                  grandTotal={Number(selectedQuote.grandTotal ?? 0) || 0}
                />
              </div>
            </div>

            <div className="p-10 border-t border-gray-100 bg-white flex justify-between items-center shadow-[0_-20px_50px_rgba(0,0,0,0.02)]" data-no-pdf="true">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadPiPDF}
                  className="px-8 py-5 bg-white border-2 border-gray-100 text-gray-600 rounded-[28px] font-black uppercase text-xs tracking-wide hover:bg-gray-50 transition-all flex items-center gap-3"
                >
                  <DownloadIcon className="w-4 h-4" /> Download
                </button>
              </div>

              <div className="flex items-center gap-6">
                {selectedQuote.status === 'CONVERTED' ? (
                  <div className="flex flex-col items-end">
                    <div className="px-10 py-5 bg-emerald-50 text-emerald-600 rounded-[24px] font-black uppercase text-xs tracking-widest flex items-center gap-3 border border-emerald-100">
                      <PackageCheck className="w-5 h-5" /> 已转为订单
                    </div>
                    <span className="text-xs font-black text-emerald-500 mt-2 font-mono">SO Ref: {safeStr((selectedQuote as any).convertedOrderId)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-inner">
                      <button
                        onClick={() => setConversionMode('Direct Sale')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${conversionMode === 'Direct Sale' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                      >
                        Direct
                      </button>
                      <button
                        onClick={() => setConversionMode('Consignment')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${conversionMode === 'Consignment' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}
                      >
                        Consignment
                      </button>
                    </div>

                    <button
                      onClick={() => convertQuoteToOrder(selectedQuote, conversionMode)}
                      disabled={isConverting}
                      className={`px-12 py-6 ${conversionMode === 'Consignment' ? 'bg-orange-600' : 'bg-[#1a237e]'} text-white rounded-[32px] font-black uppercase text-xs tracking-[0.4em] flex items-center gap-4 hover:bg-black transition-all shadow-2xl active:scale-95 shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
                    >
                      <Zap className={`w-5 h-5 fill-white ${isConverting ? 'animate-spin' : ''}`} />
                      {isConverting ? '正在生成，请勿重复点击...' : (conversionMode === 'Consignment' ? '生成代售订单' : '生成直售订单')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Order Detail Modal (Invoice-style) ===== */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[5000] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl rounded-[60px] overflow-hidden flex flex-col shadow-2xl h-[85vh] border-4 border-white/20">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/50" data-no-pdf="true">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl"><PackageCheck className="w-6 h-6 text-indigo-600" /></div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Order Detail: {safeStr(selectedOrder.id)}</h3>
                  <p className="text-xs font-bold text-gray-400 font-mono mt-0.5">
                    Created on {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleDateString() : '--'}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-full transition-all">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar bg-white">
              {/* ✅ Export uses same invoice-like view */}
              <div id="order-export-view">
                <InvoiceLikeView
                  docNo={safeStr(selectedOrder.id)}
                  consignee={safeStr(selectedOrder.customerName) || 'VALUED CLIENT'}
                  title="PERFORMANCE INVOICE"
                  terms={safeStr(selectedOrder.paymentTerms)}
                  dueDate={safeStr(selectedOrder.dueDate)}
                  items={buildOrderItems(selectedOrder)}
                  subtotal={Number(selectedOrder.subtotal ?? 0) || 0}
                  vat={Number(selectedOrder.vat ?? 0) || 0}
                  grandTotal={Number(selectedOrder.grandTotal ?? 0) || 0}
                />
              </div>

              <div className="px-12 pb-12" data-no-pdf="true">
                {/* Payment History */}
                {(() => {
                  const orderPays = (payments || []).filter(p => p.orderId === selectedOrder.id);
                  if (orderPays.length === 0) return null;
                  return (
                    <div className="mt-8 p-8 bg-emerald-50/30 rounded-[40px] border border-emerald-100">
                      <h4 className="text-xs font-black text-emerald-700 uppercase tracking-wide mb-6 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" /> 收款记录 / Payment History
                      </h4>
                      <div className="space-y-2">
                        {orderPays.map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-white rounded-2xl px-6 py-4 border border-emerald-50 shadow-sm">
                            <span className="text-xs font-black text-gray-400 font-mono">{p.date || '--'}</span>
                            <span className="text-xs font-black text-gray-500">{p.method}</span>
                            <span className="font-mono font-black text-emerald-600 text-sm">AED {(p.amount ?? 0).toFixed(2)}</span>
                            <span className="text-xs text-gray-400 truncate max-w-[100px]">{p.note || '--'}</span>
                            <button
                              onClick={() => handleDeletePayment(p.id)}
                              className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title="Delete Payment"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Order Items Desc Edit */}
                {(() => {
                  const curItems = (orderItems || []).filter(i => i.orderId === selectedOrder.id);
                  if (curItems.length === 0) return null;
                  return (
                    <div className="mt-8 p-8 bg-gray-50/30 rounded-[40px] border border-gray-100">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Edit3 className="w-4 h-4" /> 订单明细 · 产品名修正
                      </h4>
                      <div className="space-y-2">
                        {curItems.map((item, idx) => {
                          const itemId = (item as any).id || `${item.orderId}-${idx}`;
                          return (
                            <div key={itemId} className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 border border-gray-100 shadow-sm">
                              {editingItemId === itemId ? (
                                <>
                                  <input
                                    value={editingItemDesc}
                                    onChange={e => setEditingItemDesc(e.target.value)}
                                    className="flex-1 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveItemDesc(item, editingItemDesc); if (e.key === 'Escape') setEditingItemId(null); }}
                                  />
                                  <button onClick={() => handleSaveItemDesc(item, editingItemDesc)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black shrink-0">保存</button>
                                  <button onClick={() => setEditingItemId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-black shrink-0">取消</button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm font-bold text-gray-700 truncate">{item.desc || '--'}</span>
                                  <span className="text-xs text-gray-400 font-mono shrink-0">×{item.qty}</span>
                                  <span className="text-xs font-mono text-gray-500 shrink-0">AED {(Number(item.lineTotal) || 0).toFixed(2)}</span>
                                  <button
                                    onClick={() => { setEditingItemId(itemId); setEditingItemDesc(item.desc || ''); }}
                                    className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all shrink-0"
                                    title="修改产品名"
                                  ><Edit3 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Consignment tracking section */}
                <div className="mt-8 p-10 bg-orange-50/30 rounded-[50px] border-2 border-orange-100/50 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-orange-500"></div>
                  <h4 className="text-xs font-black text-orange-700 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                    <Box className="w-5 h-5" /> 寄售发货跟踪 / Consignment Tracking
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-orange-400 uppercase tracking-wide ml-1">交易模式</label>
                      <select
                        value={selectedOrder.transactionMode || 'Direct Sale'}
                        onChange={(e) => handleUpdateOrderMetadata(selectedOrder.id, { transactionMode: e.target.value as any })}
                        className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-orange-500 shadow-sm transition-all"
                      >
                        <option value="Direct Sale">Direct Sale (直售)</option>
                        <option value="Consignment">Consignment (代售)</option>
                      </select>
                    </div>

                    {selectedOrder.transactionMode === 'Consignment' && (
                      <>
                        <div className="space-y-3 animate-in fade-in slide-in-from-left-4">
                          <label className="text-xs font-black text-orange-400 uppercase tracking-wide ml-1">代售状态</label>
                          <select
                            value={(selectedOrder as any).consignmentStatus || 'Sent'}
                            onChange={(e) => handleUpdateOrderMetadata(selectedOrder.id, { consignmentStatus: e.target.value as any } as any)}
                            className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-orange-500 shadow-sm transition-all"
                          >
                            <option value="Sent">已发货 (Sent)</option>
                            <option value="On Sale">上架销售中 (On Sale)</option>
                            <option value="Sold Reported">客户已报销售数 (Sold Reported)</option>
                            <option value="Settled">已结算 (Settled)</option>
                            <option value="Exception">异常 (Exception)</option>
                          </select>
                        </div>

                        <div className="space-y-3 animate-in fade-in slide-in-from-left-8">
                          <label className="text-xs font-black text-orange-400 uppercase tracking-wide ml-1">代售已售数量</label>
                          <input
                            type="number"
                            value={(selectedOrder as any).consignmentSoldQty === 0 ? '' : (selectedOrder as any).consignmentSoldQty}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              handleUpdateOrderMetadata(selectedOrder.id, { consignmentSoldQty: val === '' ? 0 : parseInt(val) } as any);
                            }}
                            className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-black text-sm outline-none focus:border-orange-500 shadow-sm transition-all font-mono"
                            placeholder="0"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-8 flex items-center gap-2 text-xs font-bold text-orange-400">
                    <Info className="w-3 h-3" /> 本栏仅记录发货状态，不产生收款、不影响应收。客户实际卖出后，请在下方「寄售销售结算」录入销售数量和收款。
                  </div>
                </div>

                {/* Consignment Settlement Tracker */}
                {selectedOrder.transactionMode === 'Consignment' && (
                  <div className="mt-12 p-10 bg-indigo-50/20 rounded-[50px] border-2 border-indigo-100/50 relative overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h4 className="text-xs font-black text-indigo-700 uppercase tracking-[0.2em] flex items-center gap-3">
                          <History className="w-5 h-5" /> 寄售销售结算 / Consignment Settlement
                        </h4>
                        <p className="text-xs font-bold text-indigo-400 mt-2">
                          客户实际卖出寄售商品后，在此录入销售数量、结算金额与收款状态。数据保存至结算台账，供对账查询使用。
                        </p>
                      </div>
                    </div>

                    {settlementTotals.sold_qty > deliveredQty && (
                      <div className="mb-6 p-4 bg-orange-100 border border-orange-200 rounded-2xl flex items-center gap-3 text-orange-700 text-xs font-black animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        ⚠️ 注意：结算总销售数量已超过发货数量（发货量：{deliveredQty}件），请核实。
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-6 mb-10">
                      <div className="bg-white p-5 rounded-3xl border border-indigo-50 shadow-sm">
                        <p className="text-xs font-black text-gray-400 uppercase mb-1">累计销售数量</p>
                        <p className="text-xl font-black text-indigo-600 font-mono">{settlementTotals.sold_qty} 件</p>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-indigo-50 shadow-sm">
                        <p className="text-xs font-black text-gray-400 uppercase mb-1">应收结算金额</p>
                        <p className="text-xl font-black text-indigo-600 font-mono">AED {settlementTotals.should_collect.toFixed(2)}</p>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-indigo-50 shadow-sm">
                        <p className="text-xs font-black text-emerald-400 uppercase mb-1">已收金额</p>
                        <p className="text-xl font-black text-emerald-600 font-mono">AED {settlementTotals.paid.toFixed(2)}</p>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-indigo-50 shadow-sm">
                        <p className="text-xs font-black text-red-400 uppercase mb-1">未收余额</p>
                        <p className="text-xl font-black text-red-600 font-mono">AED {settlementTotals.outstanding.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur p-8 rounded-[32px] border border-indigo-100 mb-10">
                      <h5 className="text-xs font-black text-indigo-400 uppercase tracking-wide mb-6 flex items-center gap-2">
                        <Plus className="w-3 h-3" /> 新增结算记录 / Add Settlement
                      </h5>

                      <div className="mb-8 p-6 bg-gray-50 border border-gray-100 rounded-3xl space-y-3">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-1">结算商品（选择本次销售的产品）</label>
                        <select
                          value={setForm.selectedItemName}
                          onChange={(e) => {
                            const name = e.target.value;
                            const match = (orderItems || []).find(it => it.orderId === selectedOrder.id && it.desc === name);
                            if (match) {
                              const preVat = match.price ?? 0;
                              const inclVat = roundTo2(preVat * 1.05);
                              const qty = setForm.sold_qty || 1;
                              setSetForm(prev => ({
                                ...prev,
                                selectedItemName: name,
                                unit_price: preVat as any,
                                tax_inclusive_price: inclVat,
                                amount: roundTo2(qty * inclVat),
                                paid_amount: roundTo2(qty * inclVat),
                              }));
                            }
                          }}
                          className="w-full p-4 bg-white border-2 border-indigo-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-indigo-500 shadow-sm transition-all"
                        >
                          {(orderItems || []).filter(it => it.orderId === selectedOrder.id).map((it, idx) => (
                            <option key={idx} value={safeStr(it.desc)}>
                              {safeStr(it.desc)} | 未税 {(it.price ?? 0).toFixed(2)} → 含税 {roundTo2((it.price ?? 0) * 1.05).toFixed(2)} AED
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* VAT 价格分解说明栏 */}
                      <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs font-bold text-amber-700">
                        <span>未税单价</span>
                        <span className="font-mono text-sm font-black">AED {(setForm.unit_price || 0).toFixed(2)}</span>
                        <span className="text-amber-400">×</span>
                        <span className="px-2 py-0.5 bg-amber-100 rounded-full font-black text-amber-600">VAT 5%</span>
                        <span className="text-amber-400">=</span>
                        <span>含税单价</span>
                        <span className="font-mono text-sm font-black text-emerald-700">AED {(setForm.tax_inclusive_price || roundTo2((setForm.unit_price || 0) * 1.05)).toFixed(2)}</span>
                      </div>

                      {/* Row 1: 数量 + 含税单价(只读) + 确认销售金额(只读) */}
                      <div className="grid grid-cols-3 gap-6 mb-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase">本次销售数量</label>
                          <input
                            type="number"
                            value={setForm.sold_qty || ''}
                            onChange={e => {
                              const qty = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                              const incl = setForm.tax_inclusive_price || roundTo2(setForm.unit_price * 1.05);
                              setSetForm(prev => ({
                                ...prev,
                                sold_qty: qty,
                                amount: roundTo2(qty * incl),
                                paid_amount: roundTo2(qty * incl),
                              }));
                            }}
                            className="w-full p-4 bg-white border border-indigo-100 rounded-2xl font-black text-sm outline-none focus:border-indigo-500"
                            placeholder="0 件"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase">含税单价 (AED) <span className="text-amber-400 normal-case font-normal">= 未税 × 1.05</span></label>
                          <input
                            type="number"
                            step="0.01"
                            value={(setForm.tax_inclusive_price || roundTo2((setForm.unit_price || 0) * 1.05)) || ''}
                            readOnly
                            className="w-full p-4 bg-amber-50 border border-amber-100 rounded-2xl font-black text-sm outline-none font-mono text-amber-700 cursor-not-allowed"
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase">本次确认销售金额 (AED) <span className="text-indigo-400 normal-case font-normal">自动</span></label>
                          <input
                            type="number"
                            step="0.01"
                            value={setForm.amount || ''}
                            readOnly
                            className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl font-black text-sm outline-none font-mono text-indigo-700 cursor-not-allowed"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Row 2: 实收金额 + 备注 */}
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase">本次实收金额 (AED) <span className="text-red-400 normal-case font-normal">必须 &gt; 0</span></label>
                          <input
                            type="number"
                            step="0.01"
                            value={setForm.paid_amount || ''}
                            onChange={e => setSetForm(prev => ({ ...prev, paid_amount: parseFloat(e.target.value) || 0 }))}
                            className="w-full p-4 bg-white border-2 border-emerald-200 rounded-2xl font-black text-sm outline-none focus:border-emerald-500 font-mono text-emerald-600"
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase">备注</label>
                          <input
                            type="text"
                            value={setForm.memo}
                            onChange={e => setSetForm(prev => ({ ...prev, memo: e.target.value }))}
                            className="w-full p-4 bg-white border border-indigo-100 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500"
                            placeholder="本次结算备注（可选）"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddSettlement}
                        className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-wide shadow-lg shadow-indigo-100 hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3"
                      >
                        <Save className="w-4 h-4" /> 新增结算记录
                      </button>
                    </div>

                    <div className="bg-white rounded-3xl border border-indigo-50 overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wide border-b">
                          <tr>
                            <th className="px-6 py-4">录入时间</th>
                            <th className="px-6 py-4">结算商品</th>
                            <th className="px-6 py-4">数量</th>
                            <th className="px-6 py-4 text-right">含税单价</th>
                            <th className="px-6 py-4 text-right">确认金额 (AED)</th>
                            <th className="px-6 py-4 text-right">实收金额 (AED)</th>
                            <th className="px-6 py-4">备注</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-50">
                          {(orderSettlements || []).map(s => {
                            const itemMatch = safeStr(s.memo).match(/\[ITEM: (.*?) \| (?:PRICE|EXCL):.*?\]/);
                            const itemName = itemMatch ? itemMatch[1] : '未知商品';
                            const displayMemo = safeStr(s.memo).replace(/\[ITEM:.*?\]/, '').trim();
                            const inclPrice = (s as any).tax_inclusive_price ?? roundTo2(((s as any).unit_price ?? 0) * 1.05);

                            return (
                              <tr key={s.id} className={`text-xs font-bold ${s.voided ? 'opacity-40 line-through' : 'text-gray-700'}`}>
                                <td className="px-6 py-4 font-mono text-gray-400">
                                  {s.created_at ? (new Date(s.created_at).toLocaleDateString() + ' ' + new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '--'}
                                </td>
                                <td className="px-6 py-4 uppercase text-indigo-600 truncate max-w-[150px]">{itemName}</td>
                                <td className="px-6 py-4">{s.sold_qty} 件</td>
                                <td className="px-6 py-4 text-right font-mono text-amber-600">{inclPrice.toFixed(2)}</td>
                                <td className="px-6 py-4 text-right font-mono">{(s.amount ?? 0).toFixed(2)}</td>
                                <td className="px-6 py-4 text-right font-mono text-emerald-600 font-black">{(s.paid_amount ?? 0).toFixed(2)}</td>
                                <td className="px-6 py-4 text-gray-400 truncate max-w-[120px]">{displayMemo || '--'}</td>
                                <td className="px-6 py-4">
                                  {!s.voided && (settlDelConfirm === s.id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => handleVoidSettlement(s.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-black">确认作废</button>
                                      <button onClick={() => setSettlDelConfirm(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-black">取消</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setSettlDelConfirm(s.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="作废此结算记录">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                                </td>
                              </tr>
                            );
                          })}

                          {(orderSettlements || []).length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-gray-400 text-xs font-black tracking-wide">
                                暂无结算记录 — 客户卖出并收到款后，在上方录入
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* Adjustment Overlay */}
            {showAdjForm && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[6000] flex items-center justify-center p-8 animate-in zoom-in-95" data-no-pdf="true">
                <div className="bg-white p-12 rounded-[50px] shadow-2xl max-w-lg w-full border-2 border-orange-100">
                  <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest mb-10 flex items-center gap-3">
                    <RefreshCw className="w-5 h-5" /> 订单冲账 / Create Adjustment
                  </h3>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-4">冲账金额 (正数, 将自动转负)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={adjAmount}
                        onChange={e => setAdjAmount(e.target.value)}
                        className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] font-black text-2xl outline-none focus:border-orange-500 shadow-inner transition-all"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-4">冲账原因 / Reason</label>
                      <input
                        type="text"
                        value={adjReason}
                        onChange={e => setAdjReason(e.target.value)}
                        className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] font-bold text-sm outline-none focus:border-orange-500 shadow-inner transition-all"
                        placeholder="退货、价格调整、重复收款..."
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-4">结算状态</label>
                      <select
                        value={adjStatus}
                        onChange={e => setAdjStatus(e.target.value as any)}
                        className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] font-black text-xs uppercase tracking-widest outline-none focus:border-orange-500 appearance-none shadow-inner cursor-pointer"
                      >
                        <option value="PENDING">PENDING (挂账，进入应收)</option>
                        <option value="PAID">PAID (直接平账，不进应收)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-8">
                      <button
                        onClick={() => { setShowAdjForm(false); setAdjAmount(''); }}
                        className="py-5 bg-gray-100 text-gray-400 rounded-[24px] font-black uppercase text-xs tracking-wide hover:bg-gray-200 transition-all"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleCreateAdjustment}
                        className="py-5 bg-orange-600 text-white rounded-[24px] font-black uppercase text-xs tracking-wide shadow-xl shadow-orange-100 hover:bg-black transition-all"
                      >
                        确认创建冲账单
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-10 border-t border-gray-100 bg-gray-50/30 flex justify-between items-center" data-no-pdf="true">
              <div className="flex items-center gap-4 text-gray-400">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-wide">Operator: {safeStr(selectedOrder.userId) || '--'}</span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleDownloadOrderPDF}
                  className="px-6 py-5 bg-white border-2 border-gray-100 text-gray-600 rounded-[28px] font-black uppercase text-xs tracking-wide hover:bg-gray-50 transition-all flex items-center gap-3"
                >
                  <DownloadIcon className="w-4 h-4" /> Download
                </button>

                {(selectedOrder as any).status !== 'VOIDED' && (
                  <>
                    <button
                      onClick={() => {
                        setAdjStatus('PENDING');
                        setAdjReason('');
                        setShowAdjForm(true);
                      }}
                      className="px-6 py-5 bg-orange-100 text-orange-600 rounded-[28px] font-black uppercase text-xs tracking-wide hover:bg-orange-200 transition-all flex items-center gap-3"
                    >
                      <RefreshCw className="w-4 h-4" /> 冲账
                    </button>

                    <button
                      onClick={() => handleVoidOrder(selectedOrder.id)}
                      className="px-6 py-5 bg-red-50 text-red-500 rounded-[28px] font-black uppercase text-xs tracking-wide hover:bg-red-600 hover:text-white transition-all flex items-center gap-3"
                    >
                      <Ban className="w-4 h-4" /> 作废
                    </button>
                  </>
                )}

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-10 py-5 bg-[#1a237e] text-white rounded-[28px] font-black uppercase text-xs tracking-wide shadow-xl hover:bg-black transition-all flex items-center gap-3"
                >
                  <Save className="w-4 h-4" /> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Payment Modal ===== */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[6000] flex items-center justify-center p-8 animate-in zoom-in-95 duration-300">
          <div className="bg-white p-12 rounded-[60px] shadow-2xl max-w-md w-full border-4 border-white/20">
            <div className="w-20 h-20 bg-emerald-50 rounded-[30px] flex items-center justify-center mx-auto mb-8">
              <CreditCard className="w-10 h-10 text-emerald-600" />
            </div>

            <h3 className="text-sm font-black text-[#1a237e] uppercase tracking-[0.3em] mb-10 text-center">登记收款金额</h3>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-4">核销金额 (AED)</label>
                <input
                  id="pay-amount-ar"
                  type="number"
                  step="0.01"
                  defaultValue={(showPaymentModal.total ?? 0).toFixed(2)}
                  className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] font-black text-2xl outline-none focus:border-emerald-500 shadow-inner transition-all"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-gray-400 uppercase tracking-wide ml-4">付款方式</label>
                <select
                  id="pay-method-ar"
                  className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[28px] font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500 appearance-none shadow-inner cursor-pointer"
                >
                  <option value="CASH">CASH</option>
                  <option value="BANK">BANK TRANSFER</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-8">
                <button
                  onClick={() => setShowPaymentModal(null)}
                  className="py-5 bg-gray-100 text-gray-400 rounded-[24px] font-black uppercase text-xs tracking-wide hover:bg-gray-200 transition-all"
                >
                  取消
                </button>

                <button
                  onClick={async () => {
                    const amtElement = document.getElementById('pay-amount-ar') as HTMLInputElement;
                    const amt = parseFloat(amtElement.value);
                    const mtd = (document.getElementById('pay-method-ar') as HTMLSelectElement).value;
                    await recordPayment(amt, mtd as any, "Received from client");
                  }}
                  className="py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase text-xs tracking-wide shadow-xl shadow-emerald-100 hover:bg-black transition-all"
                >
                  确认核销
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HistoryDashboard;
