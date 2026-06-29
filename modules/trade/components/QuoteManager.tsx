import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle,
  CreditCard,
  Download,
  Edit3,
  Printer,
  ReceiptText,
  X,
  Save as SaveIcon,
} from 'lucide-react';

import { QuoteRecord, QuoteItemRecord } from '../types';
import { roundTo2, calculateTradeTotals } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { exportElementToPdf } from '../services/pdfExport';
import { colors } from '@gci/design-system';

// V2 baseline colors — used only in the editable workbench (dropdowns,
// left input panel, Review & Edit Line Items modal). The live invoice
// preview / UNIVERSAL DOC CENTER / print HTML template further down are
// the customer-facing document and are intentionally left untouched.
const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

const CONFIG = {
  TOKEN: '', // removed hardcoded secret during monorepo migration -- this field is unused dead config here
  DB: {
    CUSTOMER: "2bfd0b13b3b980fc8b49e81603b8183d",
    PRODUCT_MASTER: "2bfd0b13b3b980da819fd1dbea638c81",
    INVENTORY: "2c6d0b13b3b9806db227fc01f723bc40",
    SALES: "2c6d0b13b3b980c88401ee6c4cc86df5"
  }
};


/** Wraps fetch with an AbortController timeout. Default: 15 s. */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface QuoteItem {
  desc: string;
  price: number;
  unit_price: number;
  targetPrice: number;
  qty: number;
  currentStock: number;
  unit: string;
  productId?: string;
}

// ── CustomerDropdown ────────────────────────────────────────────────────────
const CustomerDropdown: React.FC<{
  options: { name: string; id: string }[];
  value: string;
  onChange: (name: string) => void;
}> = ({ options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState(value);
  const [hi, setHi]     = useState(-1);
  const wrapRef         = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setQ(value); }, [value, open]);

  const filtered = q
    ? options.filter(o => o.name.toLowerCase().includes(q.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (name: string) => { onChange(name); setQ(name); setOpen(false); setHi(-1); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'ArrowDown')     { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter')   { if (hi >= 0 && filtered[hi]) select(filtered[hi].name); }
    else if (e.key === 'Escape')  { setOpen(false); setQ(value); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        className="w-full p-4 border-2 border-[#CBA85C]/20 rounded-2xl outline-none focus:border-[#CBA85C] font-bold bg-[#CBA85C]/5 text-[#0F1E45] uppercase"
        placeholder="选择客户..."
        value={q}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(-1); }}
        onKeyDown={handleKey}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.map((o, i) => (
            <li
              key={o.id}
              className={`px-4 py-3 cursor-pointer text-sm font-bold uppercase ${i === hi ? 'bg-[#CBA85C]/15 text-[#8A6D2F]' : 'text-gray-700 hover:bg-gray-50'}`}
              onMouseDown={() => select(o.name)}
              onMouseEnter={() => setHi(i)}
            >{o.name}</li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && q && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">无匹配客户</div>
      )}
    </div>
  );
};

// ── ProductDropdown ─────────────────────────────────────────────────────────
interface InvItem { name: string; nameEN?: string; stock: number; unit: string; targetPrice: number; productId: string; }

const ProductDropdown: React.FC<{
  items: InvItem[];
  value: string;
  placeholder?: string;
  onChange: (item: InvItem | null, displayName: string) => void;
}> = ({ items, value, placeholder, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState(value);
  const [hi, setHi]     = useState(-1);
  const wrapRef         = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setQ(value); }, [value, open]);

  const filtered = q
    ? items.filter(o => o.name.toLowerCase().includes(q.toLowerCase()))
    : items;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (item: InvItem) => { onChange(item, item.name); setQ(item.name); setOpen(false); setHi(-1); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return; }
    if (e.key === 'ArrowDown')     { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter')   { if (hi >= 0 && filtered[hi]) select(filtered[hi]); }
    else if (e.key === 'Escape')  { setOpen(false); setQ(value); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        className="w-full p-4 border-2 border-[#CBA85C]/20 rounded-2xl outline-none focus:border-[#CBA85C] font-bold bg-[#CBA85C]/5 text-[#0F1E45]"
        placeholder={placeholder || "搜索产品..."}
        value={q}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(-1); onChange(null, e.target.value); }}
        onKeyDown={handleKey}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {filtered.map((o, i) => (
            <li
              key={o.productId || o.name}
              className={`px-4 py-3 cursor-pointer border-b border-gray-50 last:border-0 ${i === hi ? 'bg-[#CBA85C]/15' : 'hover:bg-gray-50'}`}
              onMouseDown={() => select(o)}
              onMouseEnter={() => setHi(i)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: i === hi ? '#8A6D2F' : '#1f2937' }}>{o.name}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={
                  o.stock <= 0 ? { backgroundColor: 'rgba(224,132,106,0.16)', color: colors.statusDanger }
                  : o.stock <= 10 ? { backgroundColor: 'rgba(217,180,90,0.16)', color: colors.statusWarning }
                  : { backgroundColor: 'rgba(111,191,142,0.16)', color: colors.statusSuccess }
                }>
                  {o.stock} {o.unit}
                </span>
              </div>
              {o.targetPrice > 0 && (
                <div className="text-[10px] text-gray-400 mt-0.5">底价 AED {o.targetPrice.toFixed(2)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && q && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">无匹配产品</div>
      )}
    </div>
  );
};

const QuoteManager: React.FC = () => {
  // Notion token is server-side in /api/notion-proxy — auto-connected, no manual activation needed
  const [customerOptions, setCustomerOptions] = useState<{ name: string; id: string }[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [searchProduct, setSearchProduct] = useState('');

  // 付款条件与账期
  const [paymentTerms, setPaymentTerms] = useState('COD');
  const [termMode, setTermMode] = useState<'DAYS' | 'DATE'>('DAYS');
  const [termDays, setTermDays] = useState('0');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualDueDate, setManualDueDate] = useState(new Date().toISOString().split('T')[0]);

  const [tempStock, setTempStock] = useState<number>(0);
  const [tempUnit, setTempUnit] = useState<string>('--');
  const [tempTargetPrice, setTempTargetPrice] = useState<number>(0);
  const [tempProductId, setTempProductId] = useState<string>('');
  const [tempNameEN, setTempNameEN] = useState<string>('');

  const [livePrice, setLivePrice] = useState<string>('0.00');
  const [liveQty, setLiveQty] = useState<string>('1');

  const [isSyncing, setIsSyncing] = useState(false);
  const [custError, setCustError] = useState<string | null>(null);
  const [invError, setInvError]   = useState<string | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [logisticsInfo, setLogisticsInfo] = useState('');

  // Review & Edit
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<QuoteItem[]>([]);

  // Project PI — inbound from Quotation App (gci-living-engineering-studio)
  const [inboundPI, setInboundPI] = useState<{
    customerName: string;
    projectName: string;
    quoteRef: string;
    quoteDate: string;
    totalAmount: number;
    costAmount: number;
    marginRate: number;
    profitAmount: number;
    sourceApp: string;
    piType: 'PROJECT' | 'NON_STOCK';
    notes?: string;
  } | null>(null);

  const calculatedDueDate = useMemo(() => {
    if (termMode === 'DATE') return manualDueDate;
    const days = parseInt(termDays) || 0;
    const date = new Date(docDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0].replace(/-/g, '/');
  }, [termMode, termDays, docDate, manualDueDate]);

  const { subtotal, vat: vatAmount, total } = useMemo(
    () => calculateTradeTotals(items.map(i => ({ price: i.unit_price, qty: i.qty }))),
    [items]
  );

  // 每次打开单据中心生成一个ref号（保持你原逻辑）
  const orderId = useMemo(
    () => `DOC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
    [isDocModalOpen]
  );

  // Notion 读取逻辑 — via /api/notion-proxy (no cors-anywhere, no token in browser)
  const callNotionPaged = useCallback(async (dbId: string) => {
    let results: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const body: any = { page_size: 100 };
      if (nextCursor) body.start_cursor = nextCursor;

      const response = await fetchWithTimeout('/api/trade/notion-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/databases/${dbId}/query`, method: 'POST', body }),
      }, 15_000);

      if (!response.ok) throw new Error(`HTTP_STATUS_${response.status}`);
      const data = await response.json();

      results = [...results, ...data.results];
      hasMore = data.has_more;
      nextCursor = data.next_cursor;
    }
    return results;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setIsSyncing(true);
      setCustError(null);
      setInvError(null);

      try {
        // Promise.allSettled: one failure never kills the others.
        // fetchWithTimeout (15 s) ensures no fetch hangs forever.
        const [custSettled, invSettled, masterSettled] = await Promise.allSettled([
          callNotionPaged(CONFIG.DB.CUSTOMER),
          callNotionPaged(CONFIG.DB.INVENTORY),
          callNotionPaged(CONFIG.DB.PRODUCT_MASTER),
        ]);

        // ── CUSTOMER dropdown ────────────────────────────────────────────────
        if (custSettled.status === 'fulfilled') {
          setCustomerOptions(custSettled.value.map((r: any) => ({
            name: r.properties["Customer Name"]?.title?.[0]?.plain_text ||
              r.properties["Customer Name"]?.rich_text?.[0]?.plain_text || "Unknown",
            id: r.id
          })));
        } else {
          console.error('[QuoteManager] CUSTOMER fetch failed:', custSettled.reason);
          setCustError('客户读取失败，请刷新');
        }

        // ── PRODUCT / INVENTORY dropdown ─────────────────────────────────────
        if (invSettled.status === 'fulfilled') {
          const invRes    = invSettled.value;
          const masterRes = masterSettled.status === 'fulfilled' ? masterSettled.value : [];

          if (masterSettled.status === 'rejected') {
            console.error('[QuoteManager] PRODUCT_MASTER fetch failed:', masterSettled.reason);
          }

          const merged = invRes.map((inv: any) => {
            const props      = inv.properties;
            const relationId = props['产品名称']?.relation?.[0]?.id;
            const masterMatch = masterRes.find((m: any) => m.id === relationId);

            const invName  = props['名称']?.title?.[0]?.plain_text || '';
            const realName =
              masterMatch?.properties["产品名称"]?.rich_text?.[0]?.plain_text ||
              masterMatch?.properties["Product Master（产品主库）"]?.title?.[0]?.plain_text ||
              invName ||
              "Unknown";

            const nameEN = masterMatch?.properties?.["Product Name (EN)"]?.rich_text?.[0]?.plain_text || '';

            return {
              name:        realName,
              nameEN:      nameEN,
              stock:       props["当前库存"]?.formula?.number ?? 0,
              unit:        props["单位"]?.select?.name || "PCS",
              targetPrice: masterMatch?.properties?.["Target Wholesale"]?.number ?? 0,
              productId:   relationId,
            };
          }).filter((item: any) => item.name && item.name !== "Unknown");

          setInventoryData(merged);
        } else {
          console.error('[QuoteManager] INVENTORY fetch failed:', invSettled.reason);
          setInvError('库存读取失败，请刷新');
        }
      } finally {
        // Guaranteed to run regardless of success, failure, or timeout.
        setIsSyncing(false);
      }
    };

    bootstrap();
  }, [callNotionPaged]);

  // ── Project PI: parse ?inbound= URL param from Quotation App ─────────────
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('inbound');
    if (!raw) return;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
      setInboundPI({
        customerName: data.customerName || '',
        projectName: data.projectName || data.customerName || '',
        quoteRef: data.quoteNo || '',
        quoteDate: data.quoteDate || new Date().toISOString().split('T')[0],
        totalAmount: data.totalAmount || 0,
        costAmount: data.costAmount || 0,
        marginRate: data.marginRate || 0,
        profitAmount: data.profitAmount || 0,
        sourceApp: data.sourceApp || 'gci-living-engineering-studio',
        piType: data.piType || 'PROJECT',
        notes: data.notes || undefined,
      });
      setCustomerName(data.customerName || '');
      setDocDate(data.quoteDate || new Date().toISOString().split('T')[0]);
      // Pre-fill items as free-text (no productId → no inventory deduction)
      const preItems: QuoteItem[] = (data.items || []).map((it: any) => ({
        desc: it.desc || 'Project Item',
        price: Number(it.unitPrice) || 0,
        unit_price: Number(it.unitPrice) || 0,
        targetPrice: 0,
        qty: Number(it.qty) || 1,
        currentStock: 0,
        unit: it.unit || 'set',
        productId: undefined,
      }));
      if (preItems.length > 0) setItems(preItems);
      // Clean URL param without page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('inbound');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      console.error('[QuoteManager] Failed to parse inbound Project PI:', e);
    }
  }, []);

  // ============ 关键修复：打印只输出”正式单据页面”，并保持样式一致 ============
  const printElementById = useCallback((elementId: string, title = 'iCare Document') => {
    const el = document.getElementById(elementId);
    if (!el) {
      alert(`❌ 找不到打印区域: #${elementId}`);
      return;
    }

    // 1) 收集当前页面所有样式（link + style），保证打印出来和界面一致
    const headNodes: string[] = [];

    document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
      const href = (node as HTMLLinkElement).href;
      if (href) headNodes.push(`<link rel="stylesheet" href="${href}" />`);
    });

    document.querySelectorAll('style').forEach((node) => {
      headNodes.push(`<style>${node.innerHTML}</style>`);
    });

    // 2) 单独加：打印只保留 A4、去掉背景、锁定宽度
    headNodes.push(`
      <style>
        @page { size: A4; margin: 12mm; }
        html, body { background: #fff !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* 防止某些容器被overflow裁切 */
        * { overflow: visible !important; }
      </style>
    `);

    // 3) 用 iframe 打印（不会破坏当前页面，也不会把左侧操作区一起打印）
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden', 'true');

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      document.body.removeChild(iframe);
      alert('❌ 打印初始化失败（iframe不可用）');
      return;
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
          ${headNodes.join('\n')}
        </head>
        <body>
          ${el.outerHTML}
        </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    // 4) 等待字体/样式加载后打印
    const doPrint = async () => {
      try {
        // 等待一帧，确保DOM渲染
        await new Promise((r) => setTimeout(r, 150));
        win.focus();
        win.print();
      } finally {
        // 打印完成后清理
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 500);
      }
    };

    doPrint();
  }, []);

  // ✅ 你按钮现在调用的就是这个（不要再 window.print）
  const handlePrintPDF = useCallback(() => {
    // 只打印正式单据容器
    printElementById('final-universal-doc', `PI-${orderId}`);
  }, [orderId, printElementById]);

  // ============ HTML导出（保留你原思路） ============
  const buildPiHtml = () => {
    const itemsRows = items.map(it => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; font-size: 13px;">${it.desc}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-size: 13px;">${it.qty}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-size: 13px;">AED ${it.unit_price.toFixed(2)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-size: 13px; font-weight: bold;">AED ${(it.unit_price * it.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PI - ${orderId}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 40px; background: #fff; }
    .header { text-align: center; border-bottom: 3px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; color: #1a237e; text-transform: uppercase; margin: 0; }
    .company-info { font-size: 11px; color: #666; margin-top: 5px; font-weight: bold; }
    .doc-type { background: #1a237e; color: #fff; display: inline-block; padding: 8px 30px; margin: 20px 0; font-weight: bold; font-size: 16px; letter-spacing: 2px; }
    .meta-table { width: 100%; margin-bottom: 30px; border-collapse: collapse; }
    .meta-table td { font-size: 12px; vertical-align: top; padding: 5px 0; }
    .meta-label { font-weight: bold; color: #999; text-transform: uppercase; width: 100px; }
    .consignee-box { border: 1px solid #eee; padding: 15px; margin-bottom: 30px; background: #fcfcfc; }
    .consignee-label { font-size: 10px; font-weight: bold; color: #bbb; text-transform: uppercase; display: block; margin-bottom: 5px; }
    .consignee-name { font-size: 18px; font-weight: bold; color: #111; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f8f9fa; font-size: 10px; text-transform: uppercase; color: #1a237e; padding: 12px; border-bottom: 2px solid #1a237e; text-align: left; }
    .footer-section { border-top: 2px solid #1a237e; padding-top: 20px; }
    .summary-table { float: right; width: 250px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .grand-total { border-top: 1px dashed #ddd; margin-top: 10px; padding-top: 10px; font-size: 20px; font-weight: bold; color: #1a237e; }
    .terms-box { font-size: 12px; color: #444; margin-top: 40px; padding: 15px; border-left: 4px solid #1a237e; background: #f9f9f9; }
    @media print { body { padding: 0; } .container { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="company-name">GLOBALCARE INFO GENERAL TRADING FZCO</h1>
      <div class="company-info">
        TEL: +971585566809 | EMAIL: CHRISCHEN1579@GMAIL.COM<br>
        ADDRESS: DUBAI TRADERS MARKET F5245
      </div>
      <div class="doc-type">PERFORMANCE INVOICE / SALES ORDER</div>
    </div>

    <table class="meta-table">
      <tr>
        <td class="meta-label">REF NO:</td>
        <td style="font-weight: bold; color: #1a237e;">${orderId}</td>
        <td class="meta-label" style="text-align: right; padding-right: 15px;">DATE:</td>
        <td style="text-align: right; font-weight: bold;">${docDate.replace(/-/g, '/')}</td>
      </tr>
    </table>

    <div class="consignee-box">
      <span class="consignee-label">Consignee</span>
      <div class="consignee-name">${customerName || '--'}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Description</th>
          <th style="text-align: center; width: 60px;">Qty</th>
          <th style="text-align: right; width: 100px;">Unit Price</th>
          <th style="text-align: right; width: 120px;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="footer-section">
      <div style="float: left; width: 300px;">
        <div class="terms-box">
          <div style="font-weight: bold; margin-bottom: 5px; color: #1a237e; text-transform: uppercase; font-size: 10px;">Payment Terms</div>
          <div style="font-weight: bold;">${paymentTerms || '--'}</div>
          <div style="margin-top: 10px; font-weight: bold; color: #1a237e;">DUE DATE: ${calculatedDueDate}</div>
          ${logisticsInfo ? `<div style="margin-top: 10px; color: #888; font-style: italic;">Note: ${logisticsInfo}</div>` : ''}
        </div>
      </div>
      <div class="summary-table">
        <div class="summary-row">
          <span style="color: #999; font-weight: bold;">SUBTOTAL:</span>
          <span style="font-family: monospace;">AED ${subtotal.toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #999; font-weight: bold;">VAT (5%):</span>
          <span style="font-family: monospace;">AED ${vatAmount.toFixed(2)}</span>
        </div>
        <div class="summary-row grand-total">
          <span>GRAND TOTAL:</span>
          <span style="font-family: monospace;">AED ${total.toFixed(2)}</span>
        </div>
        <div style="text-align: right; font-size: 9px; color: #ccc; margin-top: 10px; text-transform: uppercase;">Currency: AED</div>
      </div>
      <div style="clear: both;"></div>
    </div>

    <div style="margin-top: 60px; text-align: center; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 10px;">
      This is a system generated document. No signature required.
    </div>
  </div>
</body>
</html>
    `;
  };

  const handleExportHTML = useCallback(() => {
    const htmlContent = buildPiHtml();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iCare_PI_${orderId}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }, [orderId, items, customerName, docDate, paymentTerms, calculatedDueDate, logisticsInfo, subtotal, vatAmount, total]);

  const saveSnapshotToLocal = useCallback(async (): Promise<boolean> => {
    if (items.length === 0) return false;
    try {
      const quoteId = orderId;
      const newQuote: QuoteRecord = {
        id: quoteId,
        createdAt: new Date().toISOString(),
        userId: "Admin",
        operatorName: "Admin User",
        customerId: "INTERNAL_ID",
        customerName: customerName || "Unknown Customer",
        subtotal,
        vat: vatAmount,
        grandTotal: total,
        status: 'QUOTED',
        currency: 'AED',
        paymentTerms: paymentTerms,
        dueDate: calculatedDueDate,
        // Project PI fields (only set when inbound from Quotation App)
        ...(inboundPI ? {
          piType: inboundPI.piType,
          projectName: inboundPI.projectName,
          quoteRef: inboundPI.quoteRef,
          sourceApp: inboundPI.sourceApp,
          costAmount: inboundPI.costAmount,
          marginRate: inboundPI.marginRate,
          profitAmount: inboundPI.profitAmount,
          notes: inboundPI.notes,
        } : {}),
      };

      const newItems: QuoteItemRecord[] = items.map(it => ({
        quoteId,
        productId: it.productId,
        desc: it.desc,
        qty: it.qty,
        price: roundTo2(it.price),
        unit_price: roundTo2(it.unit_price),
        lineTotal: roundTo2(it.unit_price * it.qty)
      }));

      await Promise.all([
        persistence.saveQuote(newQuote),
        persistence.saveQuoteItems(newItems)
      ]);

      return true;
    } catch (e) {
      return false;
    }
  }, [items, orderId, customerName, subtotal, vatAmount, total, paymentTerms, calculatedDueDate, inboundPI]);

  const resetUI = useCallback(() => {
    setCustomerName('');
    setSearchProduct('');
    setItems([]);
    setLivePrice('0.00');
    setLiveQty('1');
    setTempStock(0);
    setTempUnit('--');
    setTempTargetPrice(0);
    setTempProductId('');
    setLogisticsInfo('');
    setPaymentTerms('COD');
    setTermDays('0');
    setDocDate(new Date().toISOString().split('T')[0]);
  }, []);

  const handleAddItem = useCallback(() => {
    if (!searchProduct.trim()) return;

    const parsedQty = parseInt(liveQty);
    const finalQty = isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;

    const parsedPrice = parseFloat(livePrice);
    const finalPrice = isNaN(parsedPrice) ? 0 : parsedPrice;

    const newItem: QuoteItem = {
      desc: tempNameEN || searchProduct,
      price: finalPrice,
      unit_price: finalPrice,
      targetPrice: tempTargetPrice,
      qty: finalQty,
      currentStock: tempStock,
      unit: tempUnit,
      productId: tempProductId
    };

    setItems(prev => [...prev, newItem]);

    setSearchProduct('');
    setLivePrice('0.00');
    setLiveQty('1');
    setTempStock(0);
    setTempUnit('--');
    setTempTargetPrice(0);
    setTempProductId('');
    setTempNameEN('');
  }, [searchProduct, liveQty, livePrice, tempTargetPrice, tempStock, tempUnit, tempProductId, tempNameEN]);

  const handleOpenReview = useCallback(() => {
    setReviewItems([...items]);
    setIsReviewOpen(true);
  }, [items]);

  const handleUpdateReviewItem = useCallback((index: number, updates: Partial<QuoteItem>) => {
    setReviewItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      if (updates.unit_price !== undefined) updated[index].price = updates.unit_price;
      return updated;
    });
  }, []);

  const handleApplyReviewChanges = useCallback(() => {
    // ── 强制校验 & 重新计算，杜绝 wheel/ArrowKey 引入的残差 ──────────
    const normalized = reviewItems.map(it => {
      const qty       = Math.max(1, Math.round(Number(it.qty)       || 1));
      const unit_price = roundTo2(  Number(it.unit_price) || 0);
      return { ...it, qty, unit_price, price: unit_price };
    });
    const invalid = normalized.find(it => !Number.isInteger(it.qty) || it.qty < 1);
    if (invalid) {
      alert(`⚠️ 数量必须为正整数 (${invalid.desc})`);
      return;
    }
    setItems(normalized);
    setIsReviewOpen(false);
  }, [reviewItems]);

  return (
    <>
      {/* SUPPLY CHAIN 分区页面标题，跟其他分区保持一致的标题样式 — 独立于下面
          的双栏布局，不改它的高度计算，不影响打印逻辑 */}
      <h1 className="no-print text-2xl font-semibold mb-4" style={{ color: '#0F172A', fontFamily: "'Space Grotesk',sans-serif" }}>PI 报价</h1>
      <div className="flex flex-row w-full h-[calc(100vh-160px)] gap-8 overflow-hidden relative">
      {/* 左侧控制区 */}
      <section className="w-[40%] h-full flex flex-col gap-6 no-print overflow-y-auto custom-scrollbar pr-2 pb-10">

        {/* Project PI banner — only shown when inbound from Quotation App */}
        {inboundPI && (
          <div className="bg-gradient-to-r from-[#0C1B3A] to-[#0F2551] p-5 rounded-[24px] border border-[#C9A84C]/30 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#C9A84C] text-[#0C1B3A] text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                {inboundPI.piType} PI
              </span>
              <span className="text-[9px] text-white/50 font-bold uppercase tracking-wider">from Quotation App</span>
            </div>
            <p className="text-white font-black text-sm leading-tight">{inboundPI.projectName}</p>
            <p className="text-[#C9A84C] text-[10px] font-bold mt-1">Ref: {inboundPI.quoteRef}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div className="bg-white/5 rounded-lg p-2">
                <span className="text-white/40 block">Cost</span>
                <span className="text-white font-black">AED {inboundPI.costAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="text-white/40 block">Margin {inboundPI.marginRate}%</span>
                <span className="text-[#C9A84C] font-black">AED {inboundPI.profitAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            {inboundPI.notes && (
              <div className="mt-3 bg-white/5 rounded-lg p-3">
                <span className="text-white/40 text-[8px] font-black uppercase tracking-widest block mb-1">Terms &amp; Notes</span>
                <p className="text-white/70 text-[9px] leading-relaxed whitespace-pre-line">{inboundPI.notes}</p>
              </div>
            )}
            <p className="text-white/30 text-[8px] font-bold mt-2 uppercase">No inventory deduction · Project channel</p>
          </div>
        )}

        <div className="bg-white p-8 rounded-[32px] shadow-sm" style={{ border: `1px solid ${GOLD}30` }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>1. Customer Selection</label>
          <CustomerDropdown
            options={customerOptions}
            value={customerName}
            onChange={setCustomerName}
          />
          {custError && (
            <p className="mt-2 text-[13px] font-bold" style={{ color: colors.statusDanger }}>{custError}</p>
          )}
        </div>

        <div className="bg-white p-8 rounded-[32px] shadow-sm" style={{ border: `1px solid ${GOLD}30` }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>2. Inventory Lookup</label>
          <ProductDropdown
            items={inventoryData}
            value={searchProduct}
            placeholder={invError ?? (isSyncing ? "正在拉取库存..." : "搜索产品...")}
            onChange={(item, displayName) => {
              setSearchProduct(displayName);
              if (item) {
                setTempStock(item.stock);
                setTempUnit(item.unit);
                setTempTargetPrice(item.targetPrice);
                setTempProductId(item.productId);
                setTempNameEN(item.nameEN || '');
                setLivePrice((item.targetPrice ?? 0).toFixed(2));
              }
            }}
          />

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
              <span className="text-[8px] font-black text-gray-400 block uppercase mb-1">库存</span>
              <span className="text-lg font-black text-gray-700">{tempStock}</span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
              <span className="text-[8px] font-black text-gray-400 block uppercase mb-1">单位</span>
              <span className="text-lg font-black text-gray-700">{tempUnit}</span>
            </div>
            <div className="p-4 rounded-xl text-center" style={{ backgroundColor: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
              <span className="text-[8px] font-black block uppercase mb-1" style={{ color: GOLD }}>底价</span>
              <span className="text-lg font-black font-mono" style={{ color: '#6B4E15' }}>{tempTargetPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] shadow-sm border-2 border-[#CBA85C]/30">
          <label className="text-[10px] font-black text-[#0F1E45] uppercase tracking-widest block mb-4">3. Commercial Control</label>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-black text-gray-400 uppercase">Offer Price</span>
              <input
                type="text"
                value={livePrice}
                onChange={e => setLivePrice(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full p-4 border-2 border-[#CBA85C] rounded-xl font-black text-right outline-none text-[#0F1E45]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-black text-gray-400 uppercase">Quantity</span>
              <div className="flex items-center border-2 border-[#CBA85C]/40 rounded-xl overflow-hidden h-[56px]">
                <button
                  onClick={() => setLiveQty(q => Math.max(1, parseInt(q || "0") - 1).toString())}
                  className="w-10 h-full bg-[#CBA85C]/15 text-[#CBA85C] hover:bg-[#CBA85C]/25 font-black"
                >
                  -
                </button>
                <input
                  type="number"
                  value={liveQty}
                  onChange={e => setLiveQty(e.target.value.replace(/[^0-9]/g, ''))}
                  className="flex-1 text-center font-black text-[#0F1E45] outline-none bg-transparent"
                />
                <button
                  onClick={() => setLiveQty(q => (parseInt(q || "0") + 1).toString())}
                  className="w-10 h-full bg-[#CBA85C]/15 text-[#CBA85C] hover:bg-[#CBA85C]/25 font-black"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 付款条件与账期 */}
          <div className="mb-6 space-y-4 pt-4 border-t border-gray-100">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <CreditCard className="w-3 h-3 text-[#CBA85C]" /> Payment Terms (Manual Input)
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                placeholder="例如: 30% Deposit, 70% Balanced"
                className="w-full p-4 border-2 border-[#CBA85C]/20 rounded-xl font-bold text-gray-700 outline-none focus:border-[#CBA85C]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                <span>Due Date Calculation</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTermMode('DAYS')}
                    className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase transition-all ${termMode === 'DAYS' ? 'bg-[#0F1E45] text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
                  >
                    By Days
                  </button>
                  <button
                    onClick={() => setTermMode('DATE')}
                    className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase transition-all ${termMode === 'DATE' ? 'bg-[#0F1E45] text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
                  >
                    Manual Date
                  </button>
                </div>
              </label>

              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <span className="text-[8px] font-black text-gray-300 uppercase block mb-1">Base Date</span>
                  <input
                    type="date"
                    value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xs font-bold outline-none"
                  />
                </div>

                {termMode === 'DAYS' ? (
                  <div className="flex-1">
                    <span className="text-[8px] font-black text-gray-300 uppercase block mb-1">Days Count</span>
                    <input
                      type="number"
                      value={termDays}
                      onChange={e => setTermDays(e.target.value)}
                      className="w-full p-3 border-2 border-[#CBA85C]/30 rounded-xl font-mono font-black text-[#0F1E45] outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <span className="text-[8px] font-black text-gray-300 uppercase block mb-1">Pick Due Date</span>
                    <input
                      type="date"
                      value={manualDueDate}
                      onChange={e => setManualDueDate(e.target.value)}
                      className="w-full p-3 border-2 border-[#CBA85C]/30 rounded-xl font-mono font-black text-[#0F1E45] outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: `${GOLD}15`, border: `1px solid ${GOLD}30` }}>
                <span className="text-[9px] font-black uppercase" style={{ color: GOLD }}>Calculated Due:</span>
                <span className="text-xs font-black font-mono tracking-widest" style={{ color: NAVY }}>{calculatedDueDate}</span>
              </div>
            </div>
          </div>

          <button
            disabled={!searchProduct.trim() || isSyncing}
            onClick={handleAddItem}
            className="w-full text-white rounded-2xl font-black uppercase text-xs py-5 shadow-xl hover:opacity-90 mb-4 transition-all active:scale-[0.98]"
            style={{ backgroundColor: GOLD }}
          >
            加入清单 / ADD ITEM
          </button>

          <button
            onClick={() => items.length > 0 && setIsDocModalOpen(true)}
            disabled={items.length === 0}
            className="w-full py-6 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] hover:bg-black transition-all shadow-xl active:scale-[0.98]"
            style={{ backgroundColor: NAVY }}
          >
            🚀 进入单据中心 (CENTER)
          </button>
        </div>
      </section>

      {/* 右侧实时预览 */}
      <aside className="w-[60%] h-full flex flex-col no-print bg-white rounded-[40px] border border-gray-100 shadow-2xl relative overflow-hidden">
        <div className="p-8 pb-32 h-full overflow-y-auto custom-scrollbar flex flex-col items-center">
          <div id="home-live-preview" style={{ width: '595px', padding: '40px', backgroundColor: 'white' }} className="shadow-sm border border-gray-50 flex flex-col">
            <div className="flex flex-col items-center text-center w-full mb-10 border-b-2 border-[#1a237e] pb-6">
              <h1 className="text-xl font-black text-[#1a237e] uppercase tracking-tighter mb-1">Globalcare Info General Trading FZCO</h1>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">TEL: +971585566809 | EMAIL: CHRISCHEN1579@GMAIL.COM</div>
              <h2 className="text-md font-black text-[#1a237e] uppercase tracking-[0.2em] mt-4">PERFORMANCE INVOICE</h2>
            </div>

            <div className="mb-10 text-center">
              <span className="text-[9px] font-black text-gray-300 uppercase block mb-1">Consignee</span>
              <p className="text-xl font-black text-gray-800 uppercase border-b border-gray-200 pb-2 inline-block min-w-[200px]">{customerName || 'VALUED CLIENT'}</p>
            </div>

            <table className="w-full">
              <thead className="text-[10px] font-black text-gray-400 uppercase border-b-2 border-[#1a237e]">
                <tr>
                  <th className="text-left pb-3">Description</th>
                  <th className="text-right pb-3 w-16 px-2">Qty</th>
                  <th className="text-right pb-3 w-24 px-2">Unit Price</th>
                  <th className="text-right pb-3 w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr><td colSpan={4} className="py-24 text-center text-gray-200 font-black uppercase text-[10px]">EMPTY...</td></tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-4 text-[11px] font-bold text-gray-700 uppercase leading-tight">{it.desc}</td>
                      <td className="text-right py-4 font-mono font-bold text-gray-400 text-[11px] px-2">{it.qty}</td>
                      <td className="text-right py-4 font-mono font-bold text-gray-400 text-[11px] px-2">{it.unit_price.toFixed(2)}</td>
                      <td className="text-right py-4 font-mono font-black text-gray-800 text-[11px]">AED {(roundTo2(it.unit_price * it.qty)).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mt-12 pt-8 border-t-2 border-[#1a237e] w-full flex flex-col items-end space-y-2">
              <div className="flex justify-between w-full max-w-[200px] text-[10px] font-black text-gray-400 uppercase">
                <span>Subtotal</span><span className="font-mono">AED {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-[10px] font-black text-gray-400 uppercase">
                <span>VAT (5%)</span><span className="font-mono">AED {vatAmount.toFixed(2)}</span>
              </div>
              <div className="pt-4 border-t border-dashed border-gray-200 flex flex-col items-end w-full max-w-[200px]">
                <span className="text-[10px] font-black text-[#1a237e] uppercase mb-1">Grand Total (AED)</span>
                <p className="text-4xl font-black text-[#1a237e] font-mono tracking-tighter leading-none">AED {total.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 单据中心 */}
      {isDocModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-3xl z-[3000] flex items-center justify-center p-8 no-print animate-in fade-in">
          <div className="bg-white w-full h-full max-w-[1400px] rounded-[50px] overflow-hidden shadow-2xl flex flex-col border-4 border-white/20">
            <div className="bg-white p-8 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <ReceiptText className="w-6 h-6 text-[#1a237e]" />
                <h2 className="text-xl font-black text-[#1a237e] uppercase tracking-widest leading-none">UNIVERSAL DOC CENTER</h2>
              </div>
              <button onClick={() => setIsDocModalOpen(false)} className="p-2 text-gray-400 hover:text-red-500 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 flex flex-row overflow-hidden bg-[#f8fafc]">
              {/* 左：正式单据（打印就打这个） */}
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar flex flex-col items-center">
                <div
                  id="final-universal-doc"
                  style={{ width: '595px', padding: '40px', backgroundColor: 'white' }}
                  className="shadow-2xl flex flex-col min-h-[842px]"
                >
                  <div className="flex flex-col items-center text-center w-full mb-10 border-b-2 border-[#1a237e] pb-4">
                    <h1 className="text-xl font-black text-[#1a237e] uppercase tracking-tighter">Globalcare Info General Trading FZCO</h1>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                      TEL: +971585566809 | EMAIL: CHRISCHEN1579@GMAIL.COM | ADDRESS: DUBAI TRADERS MARKET F5245
                    </div>
                    <h2 className="text-sm font-black text-white bg-[#1a237e] px-8 py-2 uppercase tracking-[0.2em] w-full text-center mt-4">
                      PERFORMANCE INVOICE / SALES ORDER
                    </h2>
                    <div className="flex justify-between w-full mt-4 text-[9px] font-bold font-mono text-gray-600 uppercase">
                      <span>REF: {orderId}</span>
                      <span>DATE: {docDate.replace(/-/g, '/')}</span>
                    </div>
                  </div>

                  <div className="mb-10 text-center">
                    <span className="text-[9px] font-black text-gray-300 uppercase block mb-1">Consignee</span>
                    <p className="text-xl font-black text-gray-800 uppercase border-b border-gray-200 pb-2 px-10 inline-block min-w-[300px]">
                      {customerName || 'VALUED CLIENT'}
                    </p>
                  </div>

                  <table className="w-full mb-10 border-collapse">
                    <thead>
                      <tr className="text-[9px] font-black text-gray-400 uppercase border-b-2 border-[#1a237e]">
                        <th className="text-left pb-2">Description</th>
                        <th className="text-right pb-2 w-16 px-2">Qty</th>
                        <th className="text-right pb-2 w-24">Unit Price</th>
                        <th className="text-right pb-2 w-24">Total (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-3 text-[10px] font-bold uppercase text-gray-700">{it.desc}</td>
                          <td className="text-right py-3 text-[10px] font-mono font-bold text-gray-400">{it.qty}</td>
                          <td className="text-right py-3 text-[10px] font-mono font-bold text-gray-400">{it.unit_price.toFixed(2)}</td>
                          <td className="text-right py-3 text-[10px] font-mono font-black text-gray-900">
                            AED {(roundTo2(it.unit_price * it.qty)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 pt-4 border-t border-dashed border-gray-100 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-400 uppercase">Payment Terms:</p>
                        <p className="text-[11px] font-black text-gray-800 uppercase">{paymentTerms}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[9px] font-black text-[#1a237e] uppercase">Due Date:</p>
                        <p className="text-[11px] font-black text-[#1a237e] font-mono">{calculatedDueDate}</p>
                      </div>
                    </div>
                    {logisticsInfo ? (
                      <div className="text-[10px] font-bold text-gray-500 italic pt-2">
                        Note: {logisticsInfo}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-auto pt-8 border-t-2 border-[#1a237e] w-full flex flex-col items-end space-y-2">
                    <div className="flex justify-between w-full max-w-[200px] text-[9px] font-black text-gray-400 uppercase">
                      <span>Subtotal</span><span className="font-mono">AED {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between w-full max-w-[200px] text-[9px] font-black text-gray-400 uppercase">
                      <span>VAT (5%)</span><span className="font-mono">AED {vatAmount.toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-dashed border-gray-100 w-full max-w-[200px] flex flex-col items-end">
                      <span className="text-[9px] font-black text-[#1a237e] uppercase tracking-widest">Grand Total (AED)</span>
                      <span className="text-4xl font-black text-[#1a237e] font-mono tracking-tighter leading-none">
                        AED {total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右：操作区 */}
              <div className="w-[400px] bg-white p-10 flex flex-col gap-6 shadow-xl border-l border-gray-100">
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase border-b pb-2 tracking-widest">Output Control</h3>
                  <textarea
                    placeholder="备注信息 (例如物流、额外账号)..."
                    value={logisticsInfo}
                    onChange={e => setLogisticsInfo(e.target.value)}
                    className="w-full h-32 p-5 bg-gray-50 border-2 border-gray-100 rounded-[24px] outline-none font-bold text-gray-700 text-xs focus:border-[#1a237e] transition-all"
                  />
                </div>

                <div className="mt-auto flex flex-col gap-3">
                  <button
                    onClick={handleOpenReview}
                    className="w-full py-4 bg-orange-50 border-2 border-orange-100 text-orange-700 rounded-[20px] font-black text-[10px] uppercase flex items-center justify-center gap-3 hover:bg-orange-100 transition-all shadow-sm"
                  >
                    <Edit3 className="w-4 h-4" /> 复核并编辑 / Review & Edit
                  </button>

                  {/* ✅ 这里已修复：不再 window.print() 打整页，而是只打正式单据 */}
                  <button
                    onClick={handlePrintPDF}
                    className="w-full py-4 bg-white border-2 border-indigo-100 text-indigo-900 rounded-[20px] font-black text-[10px] uppercase flex items-center justify-center gap-3 hover:bg-indigo-50 shadow-sm transition-all"
                  >
                    <Printer className="w-4 h-4" /> 打印预览 / 保存 PDF
                  </button>

                  <button
                    onClick={handleExportHTML}
                    className="w-full py-5 bg-indigo-50 text-indigo-900 rounded-[20px] font-black text-[10px] uppercase flex items-center justify-center gap-3 hover:bg-indigo-100 border border-indigo-200 shadow-sm transition-all shadow-indigo-100"
                  >
                    <Download className="w-4 h-4" /> 下载 HTML (保留样式)
                  </button>

                  <button
                    onClick={async () => {
                      if (await saveSnapshotToLocal()) {
 
  setIsDocModalOpen(false);
  resetUI();
  alert("✅ 报价已存档！");
}
                    }}
                    className="w-full py-7 bg-[#1a237e] text-white rounded-[28px] font-black text-[11px] uppercase tracking-[0.4em] flex items-center justify-center gap-4 shadow-2xl mt-4 border-t-4 border-indigo-400 hover:bg-black transition-all active:scale-95 shadow-indigo-100"
                  >
                    <CheckCircle className="w-5 h-5" /> 确认并存档 (END)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[4000] flex items-center justify-center p-8 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-4xl rounded-[50px] overflow-hidden shadow-2xl flex flex-col border-4 border-white/20">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: `${GOLD}18`, color: GOLD }}>
                  <Edit3 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Review & Edit Line Items</h2>
                  <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">Edit quantity or unit price before final submission</p>
                </div>
              </div>
              <button onClick={() => setIsReviewOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
              <table className="w-full text-left">
                <thead className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <tr>
                    <th className="pb-4">Description</th>
                    <th className="pb-4 text-center w-32">Qty</th>
                    <th className="pb-4 text-center w-40">Unit Price (AED)</th>
                    <th className="pb-4 text-right w-40">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reviewItems.map((it, idx) => (
                    <tr key={idx} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="py-6 text-[11px] font-black text-gray-700 uppercase leading-tight pr-6">{it.desc}</td>
                      <td className="py-6 text-center">
                        <input
                          type="number"
                          value={it.qty}
                          onChange={(e) => handleUpdateReviewItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 0) })}
                          onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                          onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                          className="w-20 p-2 border-2 border-gray-100 rounded-xl font-black text-center text-xs outline-none focus:border-[#CBA85C] transition-all"
                        />
                      </td>
                      <td className="py-6 text-center">
                        <div className="relative inline-block w-32">
                          <input
                            type="number"
                            step="0.01"
                            value={it.unit_price}
                            onChange={(e) => handleUpdateReviewItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border-2 border-gray-100 rounded-xl font-black text-center text-xs outline-none focus:border-[#CBA85C] transition-all pr-4"
                          />
                        </div>
                      </td>
                      <td className="py-6 text-right font-mono font-black text-gray-800 text-xs">
                        AED {(roundTo2(it.unit_price * it.qty)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-8 border-t border-gray-100 bg-white flex justify-end gap-4">
              <button
                onClick={() => setIsReviewOpen(false)}
                className="px-8 py-4 bg-gray-100 text-gray-400 rounded-[20px] font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyReviewChanges}
                className="px-10 py-4 bg-[#080D1E] text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center gap-2"
              >
                <SaveIcon className="w-4 h-4" /> Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
export default QuoteManager;



