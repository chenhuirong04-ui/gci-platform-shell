/**
 * AIIntakePanel — AI-first follow-up record entry.
 * Dark premium style matching GCI AI Workspace.
 *
 * Workflow:
 *   Step 1 — paste text / upload files (no required fields)
 *   Step 2 — AI organises a draft card (missing fields shown as 待确认)
 *   Step 3 — user confirms → saved as follow-up record
 */

import React, { useEffect, useRef, useState } from 'react';
import { Attachment, BusinessType, FollowUpTask, Project } from '../types';
import {
  Sparkles, UploadCloud, X, ImageIcon, FileText,
  Trash2, ChevronDown, ChevronUp, User, Globe, Phone, Mail,
  CheckCircle2, AlertCircle, Edit2, FileCheck,
} from 'lucide-react';

// ── Dark theme tokens ────────────────────────────────────────────────
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const GOLD_L = '#D4AF37';
const T1     = '#E8F0FF';   // primary text
const T2     = '#7A9CC5';   // secondary text
const T3     = '#4A6080';   // muted / placeholder

// ── internal-task detection ──────────────────────────────────────────
const INTERNAL_KW = [
  'lili','novie','内部','内部任务','确认','跟进一下','提醒',
  '让lili','让novie','让 lili','让 novie','internal','task for','安排',
];
function isInternalTask(text: string): boolean {
  const t = text.toLowerCase();
  return INTERNAL_KW.some(kw => t.includes(kw.toLowerCase()));
}

// ── mock AI analyser ─────────────────────────────────────────────────
interface FollowUpDraft {
  title: string;
  clientName: string;
  type: BusinessType | 'INTERNAL';
  source: string;
  priority: 'High' | 'Medium' | 'Low';
  assignedTo: string;
  nextAction: string;
  dueDate: string;
  notes: string;
  missingFields: string[];
}

function analyseInput(text: string, hasFiles: boolean): FollowUpDraft {
  const internal = isInternalTask(text);
  let assignedTo = '本人';
  if (/lili/i.test(text)) assignedTo = 'Lili';
  else if (/novie/i.test(text)) assignedTo = 'Novie';

  let type: BusinessType | 'INTERNAL' = 'TRADE';
  if (internal) type = 'INTERNAL';
  else if (/project|项目|工程|villa|fitout|interior|renovation|ff&e|design|装修|室内/i.test(text)) type = 'PROJECT';
  else if (/log|仅记录|note|备注/i.test(text)) type = 'LOG_ONLY';

  let source = '手动输入';
  if (/whatsapp/i.test(text)) source = 'WhatsApp';
  else if (/email|邮件/i.test(text)) source = '邮件';
  else if (/wechat|微信/i.test(text)) source = '微信';
  else if (hasFiles) source = '附件 / 截图';

  let priority: 'High' | 'Medium' | 'Low' = 'Medium';
  if (/urgent|紧急|asap|今天|立刻/i.test(text)) priority = 'High';
  else if (/low|不急|慢慢|暂时/i.test(text)) priority = 'Low';

  let clientName = '待确认';
  // Priority 1: explicit new-customer Chinese/English patterns
  const custMatch =
    text.match(/(?:新增|录入|添加|创建)\s*客户\s+([A-Za-z0-9一-鿿]{1,20})/i) ||
    text.match(/(?:新增|录入|添加|创建)\s+([A-Za-z0-9一-鿿]{1,20})\s*(?:这个)?客户/i) ||
    text.match(/把\s+([A-Za-z0-9一-鿿]{1,20})\s*加入(?:客户池|客户)?/i) ||
    text.match(/(?:add|create|new)\s+customer\s+([A-Za-z0-9]{1,20})/i) ||
    text.match(/客户\s+([A-Za-z0-9一-鿿]{1,20})(?:\s|，|,|$)/i) ||
    text.match(/([A-Za-z0-9一-鿿]{1,20})\s*这个客户/i);
  if (custMatch) {
    clientName = custMatch[1].trim();
  } else {
    // Fallback: formal company name ending in LLC/FZCO/Ltd etc.
    const co = text.match(/([A-Z][A-Za-z&\s]{2,30}(?:LLC|FZCO|Ltd|Co|Corp|Group|Trading|Co\.|Ltd\.|Inc|FZE|EST|Establishment))/);
    if (co) clientName = co[1].trim();
  }

  let nextAction = '确认需求并回复';
  if (/confirm|确认/i.test(text)) nextAction = '确认相关信息并回复';
  if (/send|发送|发一下|发报价/i.test(text)) nextAction = '发送报价 / 资料';
  if (/follow.?up|跟进/i.test(text)) nextAction = '跟进进展';
  if (/invoice|发票/i.test(text)) nextAction = '确认发票问题并回复';
  if (internal) nextAction = text.length < 60 ? text.trim() : text.slice(0, 60).trim() + '…';

  let title = '待确认';
  if (internal) {
    title = text.replace(/让\s*(lili|novie|本人)/i, '').trim();
    if (title.length > 50) title = title.slice(0, 50) + '…';
  } else if (text.trim()) {
    const firstLine = text.trim().split('\n')[0];
    title = firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
  }

  const missingFields: string[] = [];
  if (!internal) {
    if (clientName === '待确认') missingFields.push('客户名称');
    missingFields.push('联系方式');
  }

  const tom = new Date();
  tom.setDate(tom.getDate() + 1);

  return {
    title, clientName, type, source, priority, assignedTo,
    nextAction, dueDate: tom.toISOString().slice(0, 10),
    notes: text.slice(0, 300), missingFields,
  };
}

// ── line item ────────────────────────────────────────────────────────
interface LineItem {
  id: string;
  item_name: string;
  description: string;
  qty: number | '';
  unit: string;
  selling_price: number | '';
  line_total: number | '';
  item_notes: string;
}

function mkLine(): LineItem {
  return { id: `LI_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, item_name: '', description: '', qty: '', unit: '件', selling_price: '', line_total: '', item_notes: '' };
}

const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易询盘', PROJECT: '项目推进', LOG_ONLY: '仅记录', INTERNAL: '内部任务',
};

// ── quotation detection ───────────────────────────────────────────────
interface QuoteDraft {
  customerName: string;
  itemSummary: string;
  grandTotal: number | null;
  quoteDate: string;
  quoteType: 'TRADE' | 'BOQ' | 'CUSTOM';
  source: string;
  isReady: boolean;
}

function detectQuotation(text: string, clientNameHint: string): QuoteDraft | null {
  const hasKw = /报价|已报价|报给客户|发了报价|price|quote|quotation|offer|\bPI\b|proforma|proposal/i.test(text);
  if (!hasKw) return null;

  // AED amount — prefer explicit currency prefix
  let grandTotal: number | null = null;
  const aedExplicit = text.match(/(?:AED|DHS)\s*([\d,]+(?:\.\d+)?)/i);
  if (aedExplicit) {
    const v = parseFloat(aedExplicit[1].replace(/,/g, ''));
    if (!isNaN(v) && v >= 10) grandTotal = v;
  }
  if (grandTotal === null) {
    const fallback = text.match(/([\d,]+(?:\.\d+)?)\s*(?:AED|DHS|迪拉姆)/i);
    if (fallback) {
      const v = parseFloat(fallback[1].replace(/,/g, ''));
      if (!isNaN(v) && v >= 10) grandTotal = v;
    }
  }

  const customerName = clientNameHint && clientNameHint !== '待确认' ? clientNameHint : '待确认';

  // Date
  const today = new Date();
  let quoteDate = today.toISOString().slice(0, 10);
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) quoteDate = iso[1];
  else if (/昨天|yesterday/i.test(text)) {
    const y = new Date(); y.setDate(y.getDate() - 1); quoteDate = y.toISOString().slice(0, 10);
  }

  // Item summary
  let itemSummary = '';
  const prodMatch = text.match(/(?:报价|reported?|quote[sd]?|offer(?:ed)?)\s+(.{3,40}?)(?:\s+(?:AED|给|to|for|\d)|[，。,.]|$)/i);
  if (prodMatch) itemSummary = prodMatch[1].trim();

  let source = 'AI手动录入';
  if (/whatsapp/i.test(text)) source = 'WhatsApp';
  else if (/wechat|微信/i.test(text)) source = '微信';
  else if (/email|邮件/i.test(text)) source = 'Email';
  else if (/pdf/i.test(text)) source = 'PDF';

  let quoteType: 'TRADE' | 'BOQ' | 'CUSTOM' = 'TRADE';
  if (/BOQ|bill\s*of\s*quantity/i.test(text)) quoteType = 'BOQ';
  else if (/custom|定制/i.test(text)) quoteType = 'CUSTOM';

  return {
    customerName, itemSummary, grandTotal, quoteDate, quoteType,
    source, isReady: customerName !== '待确认' && grandTotal !== null,
  };
}

interface Props {
  onAdd: (task: Partial<FollowUpTask>) => Promise<void>;
  isLoading: boolean;
  projects: Project[];
}

export default function AIIntakePanel({ onAdd, isLoading }: Props) {
  const [rawText, setRawText]         = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging]   = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [optional, setOptional] = useState({
    clientName: '', countryCity: '', phoneE164: '', whatsapp: '', email: '',
  });
  const [draft, setDraft]       = useState<FollowUpDraft | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [saved, setSaved]       = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // quotation state
  const [quoteDraft, setQuoteDraft]     = useState<QuoteDraft | null>(null);
  const [registerQuote, setRegisterQuote] = useState(false);
  const [quotePhase, setQuotePhase]     = useState<'idle'|'checking'|'dupWarn'|'saving'|'done'|'failed'|'skipped'>('idle');
  const [dupRecords, setDupRecords]     = useState<any[]>([]);
  const [quoteError, setQuoteError]     = useState('');

  // edit mode (Bug 3)
  const [isEditing, setIsEditing]   = useState(false);
  const [draftEdit, setDraftEdit]   = useState<FollowUpDraft | null>(null);

  // line items
  const [lineItems, setLineItems]   = useState<LineItem[]>([]);
  const [showItems, setShowItems]   = useState(false);

  // xlsx parse state
  const [parsedFromFile, setParsedFromFile] = useState(false);
  const [xlsxStatus, setXlsxStatus] = useState<'idle'|'parsing'|'done'|'error'|'warn'>('idle');
  const [xlsxMsg, setXlsxMsg]       = useState('');

  const hasInput = rawText.trim().length > 0 || attachments.length > 0;

  // ── Excel / CSV file parser (frontend-only, no API key) ──────────
  const parseExcelFile = async (file: File) => {
    setXlsxStatus('parsing');
    setXlsxMsg('正在解析 Excel 报价单…');
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });

      // Pick sheet with most data rows (skip obvious summary sheets)
      const SKIP = ['summary','total','totals','总表','汇总','合计','总计'];
      const candidates = wb.SheetNames.filter(
        n => !SKIP.some(k => n.toLowerCase().includes(k))
      );
      const sheets = candidates.length > 0 ? candidates : wb.SheetNames;
      let bestSheet = sheets[0];
      let maxRows = 0;
      for (const sn of sheets) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 }) as any[][];
        const count = rows.filter(r => r.some((c: any) => c != null && String(c).trim() !== '')).length;
        if (count > maxRows) { maxRows = count; bestSheet = sn; }
      }

      const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[bestSheet], { header: 1 });
      if (!raw || raw.length < 2) throw new Error('表格为空或只有一行数据');

      // Column keyword detection (Chinese + English)
      const KW = {
        item:  ['产品名称','品名','产品','名称','货物名称','工程项目','分项','项目名称','furniture item','item','product','description'],
        spec:  ['规格','规格型号','尺寸','描述','spec','specification','size','dimension'],
        qty:   ['数量','数','qty','quantity'],
        unit:  ['单位','unit'],
        price: ['单价','单价(aed)','单价aed','价格','目标价','报价单价','unit price','price','target price'],
        total: ['合计','行合计','行小计','小计','金额','总价','total','amount','subtotal','line total'],
        notes: ['备注','说明','remark','remarks','notes','note','交期','交货期'],
      };

      // Find header row (first 20 rows, highest keyword score)
      let headerIdx = 0, bestScore = 0;
      for (let i = 0; i < Math.min(raw.length, 20); i++) {
        const row = (raw[i] || []).map((c: any) => String(c ?? '').toLowerCase().trim());
        let score = 0;
        if (row.some((c: string) => KW.item.some(k => c === k || (c.length > 1 && c.includes(k))))) score += 4;
        if (row.some((c: string) => KW.qty.some(k => c === k || (c.length > 1 && c.includes(k))))) score += 2;
        if (row.some((c: string) => KW.price.some(k => c === k || (c.length > 1 && c.includes(k))))) score += 2;
        if (row.some((c: string) => KW.total.some(k => c === k || (c.length > 1 && c.includes(k))))) score += 1;
        if (score > bestScore) { bestScore = score; headerIdx = i; }
      }

      const headers = (raw[headerIdx] || []).map((c: any) => String(c ?? '').toLowerCase().trim());
      const findCol = (kws: string[]) =>
        headers.findIndex((h: string) => kws.some(k => h === k || (h.length > 1 && h.includes(k))));

      const COL = {
        item:  findCol(KW.item),
        spec:  findCol(KW.spec),
        qty:   findCol(KW.qty),
        unit:  findCol(KW.unit),
        price: findCol(KW.price),
        total: findCol(KW.total),
        notes: findCol(KW.notes),
      };

      if (COL.item === -1) {
        const detected = headers.filter(Boolean).slice(0, 8).join('、');
        throw new Error(`未找到产品名称列。检测到的列：${detected || '(空)'}`);
      }

      const items: LineItem[] = [];
      let sumTotal = 0;
      let detectedGrandTotal: number | null = null;

      for (let i = headerIdx + 1; i < raw.length; i++) {
        const row = raw[i] || [];
        let name = String(row[COL.item] ?? '').trim();
        // If item column contains an image formula, try description column as fallback
        if (/^=DISPIMG\b/i.test(name) || /^=IMAGE\b/i.test(name)) {
          const descFallback = COL.spec !== -1 ? String(row[COL.spec] ?? '').trim() : '';
          if (descFallback && !/^=DISPIMG\b/i.test(descFallback) && !/^=IMAGE\b/i.test(descFallback)) {
            name = descFallback;
          } else {
            continue; // skip image-only rows
          }
        }
        if (!name) continue;
        // Skip grand-total summary rows
        if (/^(合计|小计|总计|grand total|total|subtotal|sum)\s*[:：]?\s*$/i.test(name)) {
          if (COL.total !== -1 && row[COL.total] != null) {
            const t = parseFloat(String(row[COL.total]).replace(/,/g, ''));
            if (!isNaN(t) && t > 0) detectedGrandTotal = t;
          }
          continue;
        }

        const qty   = COL.qty   !== -1 ? parseFloat(String(row[COL.qty]   ?? '').replace(/,/g, '')) : NaN;
        const price = COL.price !== -1 ? parseFloat(String(row[COL.price] ?? '').replace(/,/g, '')) : NaN;
        const rawTot = COL.total !== -1 ? parseFloat(String(row[COL.total] ?? '').replace(/,/g, '')) : NaN;
        const lineTotal = !isNaN(rawTot) ? rawTot : (!isNaN(qty) && !isNaN(price) ? qty * price : NaN);
        if (!isNaN(lineTotal) && lineTotal > 0) sumTotal += lineTotal;

        items.push({
          id: `LI_${Date.now()}_${i}`,
          item_name:     name,
          description:   COL.spec  !== -1 ? String(row[COL.spec]  ?? '').trim() : '',
          qty:           !isNaN(qty)   ? qty   : '',
          unit:          COL.unit  !== -1 ? String(row[COL.unit] ?? '件').trim() || '件' : '件',
          selling_price: !isNaN(price) ? price : '',
          line_total:    !isNaN(lineTotal) ? lineTotal : '',
          item_notes:    COL.notes !== -1 ? String(row[COL.notes] ?? '').trim() : '',
        });
      }

      if (items.length === 0) throw new Error('未能识别任何产品行，请检查文件格式（需含产品名称列）');

      const grandTotal = detectedGrandTotal ?? (sumTotal > 0 ? sumTotal : null);
      const clientHint = optional.clientName.trim();

      setLineItems(items);
      setShowItems(true);
      setQuoteDraft({
        customerName: clientHint || '待确认',
        itemSummary:  file.name.replace(/\.\w+$/, ''),
        grandTotal,
        quoteDate:    new Date().toISOString().slice(0, 10),
        quoteType:    'TRADE',
        source:       'Excel',
        isReady:      grandTotal != null && !!clientHint,
      });
      setRegisterQuote(grandTotal != null && !!clientHint);
      setParsedFromFile(true);
      setXlsxStatus('done');
      setXlsxMsg(
        `已解析 ${items.length} 行产品明细` +
        (grandTotal ? `，合计 AED ${grandTotal.toLocaleString()}` : '（未检测到总额，请手动填写）')
      );
    } catch (err: any) {
      setXlsxStatus('error');
      setXlsxMsg(`Excel 解析失败：${err?.message || '未知错误'}`);
    }
  };

  // ── AI file parser — PDF / image via Edge Function ───────────────
  const parseFileWithAI = async (mimeType: string, dataURL: string, fileName: string) => {
    setXlsxStatus('parsing');
    setXlsxMsg('正在用 AI 识别报价内容（PDF / 图片）…');
    try {
      const res = await fetch('/api/ai/parse-quotation-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, data: dataURL, fileName }),
      });
      const data = await res.json();

      if (!data.ok || !Array.isArray(data.items) || data.items.length === 0) {
        if (data.visionUnavailable) {
          // Gemini 503 / 502 / overload — soft warning, do not block the flow
          setXlsxStatus('warn');
          setXlsxMsg(
            rawText.trim()
              ? '截图识别暂时失败，已根据文字内容生成草稿。直接点击下方按钮继续。'
              : '截图识别服务暂时不可用。请在上方输入框补充关键信息，再点击「让 AI 整理成跟进记录」。'
          );
        } else {
          setXlsxStatus('error');
          setXlsxMsg(data.error || '文件已收到，但未能识别出产品明细，请手动录入报价明细。');
        }
        return;
      }

      const items: LineItem[] = data.items.map((it: any, i: number) => ({
        id:            `LI_${Date.now()}_${i}`,
        item_name:     it.item_name     || '',
        description:   it.description   || '',
        qty:           it.qty           != null ? it.qty           : '',
        unit:          it.unit          || '件',
        selling_price: it.selling_price != null ? it.selling_price : '',
        line_total:    it.line_total    != null ? it.line_total    : '',
        item_notes:    it.item_notes    || '',
      }));

      const apiTotal     = data.grandTotal != null ? Number(data.grandTotal) : 0;
      const computedTotal = items.reduce((s, li) => s + (Number(li.line_total) || 0), 0);
      const grandTotal   = apiTotal > 0 ? apiTotal : (computedTotal > 0 ? computedTotal : null);
      const clientHint   = optional.clientName.trim();
      const customerName = data.customerName || clientHint || '待确认';

      setLineItems(items);
      setShowItems(true);
      setQuoteDraft({
        customerName,
        itemSummary: fileName.replace(/\.\w+$/, ''),
        grandTotal:  grandTotal ?? null,
        quoteDate:   new Date().toISOString().slice(0, 10),
        quoteType:   'TRADE',
        source:      mimeType === 'application/pdf' ? 'PDF' : 'Image',
        isReady:     grandTotal != null && customerName !== '待确认',
      });
      setRegisterQuote(grandTotal != null && customerName !== '待确认');
      setParsedFromFile(true);

      const confNote = data.confidence === 'high' ? '识别度高'
        : data.confidence === 'low' ? '识别度较低，请核对每行数据'
        : '请核对关键数值';
      const warnNote = data.warnings?.length > 0 ? ` — ⚠ ${data.warnings[0]}` : '';
      setXlsxStatus('done');
      setXlsxMsg(
        `AI 已识别 ${items.length} 行产品明细` +
        (grandTotal ? `，合计 AED ${Number(grandTotal).toLocaleString()}` : '（未检测到总额，请手动填写）') +
        ` · ${confNote}${warnNote}`
      );
    } catch {
      setXlsxStatus('error');
      setXlsxMsg('网络错误，无法连接 AI 服务，请手动录入明细。');
    }
  };

  // ── file handling ─────────────────────────────────────────────────
  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: Attachment[] = [];
    for (const f of arr) {
      const base64 = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f);
      });
      next.push({
        id: `ATT_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        name: f.name, type: f.type, data: base64,
        size: f.size, uploadedAt: new Date().toISOString(), isAnalyzed: false,
      });
      // Auto-parse by file type
      if (/\.(xlsx|xls|csv)$/i.test(f.name)) {
        parseExcelFile(f);
      } else if (f.type === 'application/pdf' || f.type.startsWith('image/')) {
        parseFileWithAI(f.type, base64, f.name);
      }
    }
    setAttachments(p => [...p, ...next]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };
  const handlePasteOnArea = (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].kind === 'file') {
        const f = e.clipboardData.items[i].getAsFile(); if (f) files.push(f);
      }
    }
    if (files.length) handleFiles(files);
  };

  // ── analyse ───────────────────────────────────────────────────────
  const handleAnalyse = () => {
    setErrorMsg(''); setAnalysing(true);
    setTimeout(() => {
      const text = rawText.trim() ||
        (attachments.length ? `[附件: ${attachments.map(a => a.name).join(', ')}]` : '');
      const result = analyseInput(text, attachments.length > 0);
      if (optional.clientName.trim()) {
        result.clientName = optional.clientName.trim();
        result.missingFields = result.missingFields.filter(f => f !== '客户名称');
      }
      // detect quotation alongside followup — preserve Excel-parsed quoteDraft
      if (!parsedFromFile) {
        const clientHint = optional.clientName.trim() || result.clientName;
        const qd = detectQuotation(text, clientHint);
        setQuoteDraft(qd);
        setRegisterQuote(qd?.isReady ?? false);
      } else {
        // update customerName if optional field is now filled
        const cn = optional.clientName.trim();
        if (cn) {
          setQuoteDraft(p => p ? { ...p, customerName: cn, isReady: p.grandTotal != null } : null);
          setRegisterQuote(true);
        }
      }
      setQuotePhase('idle');
      setDraft(result); setAnalysing(false);
    }, 900);
  };

  // ── reset all state ───────────────────────────────────────────────
  const resetAll = () => {
    setSaved(false); setDraft(null); setRawText(''); setAttachments([]);
    setOptional({ clientName:'', countryCity:'', phoneE164:'', whatsapp:'', email:'' });
    setQuoteDraft(null); setRegisterQuote(false);
    setQuotePhase('idle'); setDupRecords([]); setQuoteError('');
    setIsEditing(false); setDraftEdit(null);
    setLineItems([]); setShowItems(false);
    setParsedFromFile(false); setXlsxStatus('idle'); setXlsxMsg('');
  };

  // ── line item helpers ─────────────────────────────────────────────
  const updateLine = (id: string, field: keyof LineItem, val: any) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li;
      const updated: LineItem = { ...li, [field]: val };
      if (field === 'qty' || field === 'selling_price') {
        const q  = Number(field === 'qty' ? val : updated.qty);
        const pr = Number(field === 'selling_price' ? val : updated.selling_price);
        if (!isNaN(q) && !isNaN(pr) && q > 0 && pr > 0) updated.line_total = q * pr;
      }
      return updated;
    }));
  };

  // Sync lineItems total → quoteDraft.grandTotal
  useEffect(() => {
    if (lineItems.length === 0) return;
    const total = lineItems.reduce((s, li) => s + (Number(li.line_total) || 0), 0);
    if (total > 0) {
      setQuoteDraft(p => p ? { ...p, grandTotal: total, isReady: p.customerName !== '待确认' } : null);
    }
  }, [lineItems]);

  // ── quotation save flow ───────────────────────────────────────────
  const doSaveQuote = async (qd: QuoteDraft) => {
    setQuotePhase('saving');
    try {
      const validItems = lineItems
        .filter(li => li.item_name.trim() && (Number(li.qty) > 0 || Number(li.selling_price) > 0))
        .map(li => ({
          item_name:     li.item_name.trim(),
          description:   li.description || null,
          qty:           Number(li.qty) || 1,
          unit:          li.unit || '件',
          selling_price: Number(li.selling_price) || 0,
          line_total:    Number(li.line_total) || 0,
          currency:      'AED',
          item_notes:    li.item_notes || null,
        }));
      const res = await fetch('/api/ai/register-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: qd.customerName,
          project_name: qd.itemSummary || null,
          grand_total: qd.grandTotal,
          quote_date: qd.quoteDate,
          quote_type: qd.quoteType,
          salesperson: 'Chris',
          status: 'GENERATED',
          items: validItems,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setQuotePhase('done');
        if (data.itemsWarning) setQuoteError(data.itemsWarning);
        setTimeout(resetAll, data.itemsWarning ? 4000 : 2500);
      } else { setQuotePhase('failed'); setQuoteError(data.error || '保存失败'); setTimeout(resetAll, 3500); }
    } catch {
      setQuotePhase('failed'); setQuoteError('网络错误'); setTimeout(resetAll, 3500);
    }
  };

  const startQuoteFlow = async (qd: QuoteDraft) => {
    setQuotePhase('checking');
    try {
      const params = new URLSearchParams({
        check: '1', customer: qd.customerName,
        total: String(qd.grandTotal ?? 0), date: qd.quoteDate,
      });
      const res = await fetch(`/api/ai/register-quotation?${params}`);
      const data = await res.json();
      const dups: any[] = data.duplicates ?? [];
      if (dups.length > 0) { setDupRecords(dups); setQuotePhase('dupWarn'); }
      else await doSaveQuote(qd);
    } catch { await doSaveQuote(qd); } // fail-open: skip dedup on error
  };

  // ── save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft) return;
    setErrorMsg('');
    const isInternal = draft.type === 'INTERNAL';
    const clientName = optional.clientName || (isInternal ? '' : (draft.clientName === '待确认' ? '未知客户' : draft.clientName));
    const contactKey = (optional.whatsapp || optional.phoneE164 || optional.email || '').replace(/[\s+]/g,'').toLowerCase();
    const task: Partial<FollowUpTask> = {
      clientName: isInternal ? '' : clientName,
      countryCity: optional.countryCity || 'Unknown',
      phoneE164: optional.phoneE164, whatsapp: optional.whatsapp, email: optional.email,
      contactKey, businessType: isInternal ? 'LOG_ONLY' : draft.type as BusinessType,
      goal: draft.nextAction, lastContext: draft.notes,
      owner: draft.assignedTo === '本人' ? '本人' : draft.assignedTo,
      priority: draft.priority === 'High' ? 'A' : draft.priority === 'Low' ? 'C' : 'B',
      nextFollowUpAt: draft.dueDate + 'T09:00:00.000Z',
      attachments, inquirySummary: draft.title,
    };
    try {
      await onAdd(task);
      setSaved(true);
      if (registerQuote && quoteDraft?.isReady) {
        // kick off quote flow (keeps draft card visible until done)
        startQuoteFlow(quoteDraft);
      } else {
        setTimeout(resetAll, 1500);
      }
    } catch { setErrorMsg('保存失败，请重试'); }
  };

  // ── step badge ────────────────────────────────────────────────────
  const stepActive = (i: number) =>
    (i === 0 && !draft) || (i === 1 && analysing) || (i === 2 && !!draft);

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div className="px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2.5 mb-1">
          <Sparkles className="w-5 h-5 shrink-0" style={{ color: GOLD_L }} />
          <h3 className="text-lg font-black" style={{ color: T1 }}>丢给 AI，生成跟进记录</h3>
        </div>
        <p className="text-sm" style={{ color: T2 }}>
          可以先不填客户资料。把 WhatsApp、邮件、截图、文件或一句话丢给 AI，AI 会先整理，再提示缺少哪些信息。
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs font-bold">
          {['丢进内容', 'AI 整理草稿', '保存跟进记录'].map((s, i) => (
            <React.Fragment key={s}>
              <span
                className="px-3 py-1 rounded-lg transition-colors"
                style={stepActive(i)
                  ? { background: GOLD, color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: T3 }}
              >
                {i + 1}. {s}
              </span>
              {i < 2 && <span style={{ color: T3 }}>→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* Raw text input */}
        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setDraft(null); }}
          placeholder={'把内容粘贴在这里：WhatsApp 消息、邮件内容、一句话说明...\n\n例：让 Lili 今天确认 IFZA 发票问题\n例：IFZA FZCO 问了咖啡机报价，WhatsApp 来的'}
          rows={5}
          disabled={!!draft}
          className="w-full rounded-xl px-5 py-4 text-sm font-medium outline-none resize-none leading-relaxed"
          style={{
            background: CARD2, border: `1px solid ${BORDER}`,
            color: T1, caretColor: GOLD_L,
          }}
          onFocus={e => (e.target.style.borderColor = GOLD)}
          onBlur={e => (e.target.style.borderColor = BORDER)}
        />

        {/* File upload zone */}
        <div
          tabIndex={0}
          onDragEnter={handleDrag} onDragOver={handleDrag}
          onDragLeave={handleDrag} onDrop={onDrop}
          onPaste={handlePasteOnArea}
          onClick={() => !draft && fileInputRef.current?.click()}
          className="relative rounded-xl px-5 py-4 flex items-center gap-3 transition-all cursor-pointer select-none"
          style={{
            border: `2px dashed ${isDragging ? GOLD : BORDER}`,
            background: isDragging ? 'rgba(184,150,12,0.06)' : CARD2,
            opacity: draft ? 0.5 : 1,
            pointerEvents: draft ? 'none' : 'auto',
          }}
        >
          <input ref={fileInputRef} type="file" multiple className="hidden"
            accept="image/*,application/pdf,.xls,.xlsx,.doc,.docx,.txt"
            onChange={e => e.target.files && handleFiles(e.target.files)} />
          <UploadCloud className="w-5 h-5 shrink-0" style={{ color: isDragging ? GOLD_L : T3 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: T2 }}>
              拖拽截图 / 文件，或点击上传，或 Ctrl+V 粘贴图片
            </p>
            <p className="text-xs mt-0.5" style={{ color: T3 }}>支持图片、PDF、Word、Excel、TXT</p>
          </div>
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map(att => (
              <div key={att.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T2 }}>
                {att.type.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-indigo-400" /> : <FileText className="w-3 h-3" style={{ color: T3 }} />}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button type="button"
                  onClick={() => setAttachments(p => p.filter(a => a.id !== att.id))}
                  className="ml-1 hover:text-red-400 transition-colors" style={{ color: T3 }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Excel parse status banner */}
        {xlsxStatus !== 'idle' && (
          <div className="flex items-center gap-2 text-xs font-bold rounded-xl px-4 py-2.5"
            style={{
              background: xlsxStatus === 'parsing' ? 'rgba(255,255,255,0.04)'
                : xlsxStatus === 'done'   ? 'rgba(5,150,105,0.08)'
                : xlsxStatus === 'warn'   ? 'rgba(245,158,11,0.08)'
                : 'rgba(239,68,68,0.08)',
              border: `1px solid ${
                xlsxStatus === 'parsing' ? BORDER
                : xlsxStatus === 'done'  ? 'rgba(5,150,105,0.3)'
                : xlsxStatus === 'warn'  ? 'rgba(245,158,11,0.35)'
                : 'rgba(239,68,68,0.25)'
              }`,
              color: xlsxStatus === 'parsing' ? T2
                : xlsxStatus === 'done' ? '#6EE7B7'
                : xlsxStatus === 'warn' ? '#FCD34D'
                : '#FCA5A5',
            }}>
            {xlsxStatus === 'parsing' ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
            ) : xlsxStatus === 'done' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            {xlsxMsg}
          </div>
        )}

        {/* Optional fields toggle */}
        <button type="button" onClick={() => setShowOptional(v => !v)}
          className="flex items-center gap-2 text-xs font-bold transition-colors"
          style={{ color: T2 }}>
          {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          可选信息（客户资料 / 联系方式）— 不填也可以先分析
        </button>

        {showOptional && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl"
            style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
            {[
              { key: 'clientName',  label: '客户名称', icon: <User className="w-3 h-3" />,  placeholder: '可留空' },
              { key: 'countryCity', label: '国家 / 城市', icon: <Globe className="w-3 h-3" />, placeholder: 'UAE / Dubai' },
              { key: 'phoneE164',   label: '电话',   icon: <Phone className="w-3 h-3" />, placeholder: '+971…' },
              { key: 'whatsapp',    label: 'WhatsApp', icon: <Phone className="w-3 h-3" />, placeholder: '+971…' },
              { key: 'email',       label: '邮箱',   icon: <Mail className="w-3 h-3" />,  placeholder: '可留空' },
            ].map(({ key, label, icon, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest" style={{ color: T3 }}>
                  {icon} {label}
                </label>
                <input type="text"
                  value={(optional as any)[key]}
                  onChange={e => setOptional(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}
                  onFocus={e => (e.target.style.borderColor = GOLD)}
                  onBlur={e => (e.target.style.borderColor = BORDER)}
                />
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 text-sm font-bold rounded-xl px-4 py-2.5"
            style={{ color: '#FCA5A5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* Excel parse preview — shown before analyse */}
        {!draft && parsedFromFile && lineItems.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD}40`, background: CARD2 }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <FileCheck className="w-4 h-4" style={{ color: GOLD }} />
              <span className="text-sm font-black" style={{ color: GOLD_L }}>文件报价预览</span>
              <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(184,150,12,0.15)', color: GOLD }}>
                {lineItems.length} 行{quoteDraft?.grandTotal ? ` · AED ${quoteDraft.grandTotal.toLocaleString()}` : ''}
              </span>
            </div>
            <div className="px-5 py-3 space-y-1.5 max-h-44 overflow-y-auto">
              {lineItems.slice(0, 6).map((li, i) => (
                <div key={li.id} className="flex items-baseline gap-2 text-xs">
                  <span className="font-black shrink-0 w-4 text-right" style={{ color: T3 }}>{i + 1}.</span>
                  <span className="font-bold flex-1 truncate" style={{ color: T1 }}>{li.item_name}</span>
                  {li.description && <span className="truncate max-w-[120px]" style={{ color: T3 }}>{li.description}</span>}
                  {li.qty !== '' && <span className="shrink-0" style={{ color: T2 }}>× {li.qty}</span>}
                  {li.selling_price !== '' && (
                    <span className="shrink-0" style={{ color: GOLD }}>AED {Number(li.selling_price).toLocaleString()}</span>
                  )}
                </div>
              ))}
              {lineItems.length > 6 && (
                <div className="text-[10px] pt-1" style={{ color: T3 }}>…还有 {lineItems.length - 6} 行</div>
              )}
            </div>
            <div className="px-5 py-2.5 text-[11px] font-medium" style={{ color: T3, borderTop: `1px solid ${BORDER}` }}>
              确认内容后，补充客户名称（可选），再点击下方按钮生成跟进记录。
            </div>
          </div>
        )}

        {/* Primary action */}
        {!draft && (
          <button type="button" onClick={handleAnalyse}
            disabled={!hasInput || analysing}
            className="w-full py-4 rounded-xl text-base font-black text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: hasInput && !analysing ? `linear-gradient(135deg, #0F172A, #1E3A5F)` : '#1E3A5F', border: `1px solid ${GOLD}40` }}
            onMouseEnter={e => { if (hasInput && !analysing) (e.currentTarget.style.borderColor = GOLD); }}
            onMouseLeave={e => { (e.currentTarget.style.borderColor = `${GOLD}40`); }}
          >
            {analysing ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> AI 正在整理…</>
            ) : (
              <><Sparkles className="w-5 h-5" style={{ color: GOLD_L }} /> 让 AI 整理成跟进记录</>
            )}
          </button>
        )}

        {/* AI draft result card */}
        {draft && (
          <div className="rounded-xl overflow-hidden animate-fadeIn" style={{ border: `1px solid ${GOLD}50` }}>
            {/* Card header */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: `${GOLD}18` }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: GOLD_L }} />
                <span className="text-sm font-black" style={{ color: GOLD_L }}>AI 整理草稿</span>
              </div>
              <button onClick={() => setDraft(null)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-3.5 h-3.5" style={{ color: T3 }} />
              </button>
            </div>

            {/* Rows */}
            <div style={{ background: CARD2 }}>
              {([
                ['标题', draft.title],
                ['客户', draft.clientName],
                ['类型', TYPE_LABEL[draft.type] ?? draft.type],
                ['来源', draft.source],
                ['优先级', draft.priority],
                ['负责人', draft.assignedTo],
                ['下一步', draft.nextAction],
                ['跟进日期', draft.dueDate],
                ...(draft.missingFields.length ? [['缺少信息', draft.missingFields.join('、')]] : []),
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex items-start px-5 py-2.5 gap-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0 pt-0.5" style={{ color: T3 }}>{label}</span>
                  <span className={`text-sm font-bold flex-1 ${val === '待确认' ? '' : ''}`}
                    style={{ color: val === '待确认' ? '#F59E0B' : T1 }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>

            {/* Missing warning */}
            {draft.missingFields.length > 0 && (
              <div className="px-5 py-3 flex items-center gap-2 text-xs font-bold" style={{ background: 'rgba(245,158,11,0.08)', borderTop: '1px solid rgba(245,158,11,0.20)', color: '#FCD34D' }}>
                <AlertCircle className="w-3 h-3 shrink-0" />
                可在保存后补充缺少的信息，不影响现在保存记录。
              </div>
            )}

            {/* Quotation block — shown when quotation keywords detected */}
            {quoteDraft && (
              <div style={{ borderTop: `1px solid ${BORDER}`, background: '#0B1926' }}>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>检测到报价内容</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={registerQuote}
                      onChange={e => setRegisterQuote(e.target.checked)}
                      disabled={saved} className="w-3.5 h-3.5 accent-amber-500" />
                    <span className="text-xs font-bold" style={{ color: T2 }}>同时登记为历史报价</span>
                  </label>
                </div>

                {registerQuote && (
                  <div className="px-5 pb-3 space-y-2">
                    {/* File attachment notice */}
                    {attachments.length > 0 && (
                      parsedFromFile && lineItems.length > 0 ? (
                        <div className="px-3 py-2 rounded-lg flex items-start gap-2 text-xs font-bold"
                          style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', color: '#6EE7B7' }}>
                          <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                          已自动识别 {lineItems.length} 行产品明细，请在下方核对数据后保存。
                        </div>
                      ) : (
                        <div className="px-3 py-2 rounded-lg flex items-start gap-2 text-xs font-bold"
                          style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', color: '#A5B4FC' }}>
                          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                          当前附件尚未自动识别（暂无 OCR），请粘贴报价文字或在下方手动补充金额。
                        </div>
                      )
                    )}

                    {/* Field display */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {([
                        ['客户', quoteDraft.customerName],
                        ['报价日期', quoteDraft.quoteDate],
                        ['类型', quoteDraft.quoteType],
                        ['来源', quoteDraft.source],
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest w-14 shrink-0 pt-0.5" style={{ color: T3 }}>{k}</span>
                          <span className="text-xs font-bold" style={{ color: T1 }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Editable: amount */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[9px] font-black uppercase tracking-widest w-14 shrink-0" style={{ color: T3 }}>金额</span>
                      {quoteDraft.grandTotal != null ? (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-bold" style={{ color: T1 }}>AED {quoteDraft.grandTotal.toLocaleString()}</span>
                          <button onClick={() => setQuoteDraft(p => p ? { ...p, grandTotal: null, isReady: false } : null)}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: T3, background: 'rgba(255,255,255,0.07)' }}>修改</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-[10px] font-bold" style={{ color: '#F59E0B' }}>AED</span>
                          <input
                            type="number" min="0" placeholder="请输入报价总额"
                            className="flex-1 rounded-lg px-3 py-1.5 text-sm font-bold outline-none"
                            style={{ background: CARD, border: `1px solid #F59E0B60`, color: T1 }}
                            onFocus={e => e.target.style.borderColor = GOLD}
                            onBlur={e => e.target.style.borderColor = '#F59E0B60'}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              setQuoteDraft(p => p ? {
                                ...p,
                                grandTotal: isNaN(v) ? null : v,
                                isReady: !isNaN(v) && p.customerName !== '待确认',
                              } : null);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Editable: item summary */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest w-14 shrink-0" style={{ color: T3 }}>产品摘要</span>
                      <input
                        type="text" placeholder="产品名称 / 项目摘要（可选）"
                        value={quoteDraft.itemSummary}
                        onChange={e => setQuoteDraft(p => p ? { ...p, itemSummary: e.target.value } : null)}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
                        style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}
                        onFocus={e => e.target.style.borderColor = GOLD}
                        onBlur={e => e.target.style.borderColor = BORDER}
                      />
                    </div>

                    {/* Line items section */}
                    <div className="pt-1">
                      <button type="button"
                        onClick={() => { setShowItems(v => !v); if (!showItems && lineItems.length === 0) setLineItems([mkLine()]); }}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-2"
                        style={{ color: showItems ? GOLD_L : T3 }}>
                        {showItems ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        报价明细（{lineItems.length} 行）
                      </button>

                      {showItems && (
                        <div className="space-y-2">
                          {attachments.length > 0 && lineItems.length === 0 && (
                            <div className="px-3 py-2 rounded-lg text-xs font-medium"
                              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#A5B4FC' }}>
                              当前无法自动读取截图明细，请手动补充报价明细，至少填写产品名称、数量和单价。
                            </div>
                          )}
                          {lineItems.map((li, idx) => (
                            <div key={li.id} className="p-3 rounded-xl space-y-2"
                              style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black" style={{ color: T3 }}>#{idx + 1}</span>
                                <input placeholder="产品名称 *" value={li.item_name}
                                  onChange={e => updateLine(li.id, 'item_name', e.target.value)}
                                  className="flex-1 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                                  style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
                                  onFocus={e => e.target.style.borderColor = GOLD}
                                  onBlur={e => e.target.style.borderColor = BORDER}
                                />
                                <button onClick={() => setLineItems(p => p.filter(l => l.id !== li.id))}
                                  className="p-1 rounded hover:text-red-400 transition-colors" style={{ color: T3 }}>
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input placeholder="规格 / 描述" value={li.description}
                                  onChange={e => updateLine(li.id, 'description', e.target.value)}
                                  className="rounded-lg px-2 py-1 text-xs font-medium outline-none"
                                  style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
                                  onFocus={e => e.target.style.borderColor = GOLD}
                                  onBlur={e => e.target.style.borderColor = BORDER}
                                />
                                <div className="flex gap-1">
                                  <input type="number" placeholder="数量" value={li.qty}
                                    onChange={e => updateLine(li.id, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-16 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                                    style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
                                    onFocus={e => e.target.style.borderColor = GOLD}
                                    onBlur={e => e.target.style.borderColor = BORDER}
                                  />
                                  <input placeholder="件" value={li.unit}
                                    onChange={e => updateLine(li.id, 'unit', e.target.value)}
                                    className="w-12 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                                    style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
                                    onFocus={e => e.target.style.borderColor = GOLD}
                                    onBlur={e => e.target.style.borderColor = BORDER}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black shrink-0" style={{ color: T3 }}>单价 AED</span>
                                  <input type="number" placeholder="0" value={li.selling_price}
                                    onChange={e => updateLine(li.id, 'selling_price', e.target.value === '' ? '' : Number(e.target.value))}
                                    className="flex-1 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                                    style={{ background: CARD2, border: `1px solid ${BORDER}`, color: GOLD_L }}
                                    onFocus={e => e.target.style.borderColor = GOLD}
                                    onBlur={e => e.target.style.borderColor = BORDER}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black shrink-0" style={{ color: T3 }}>合计 AED</span>
                                  <input type="number" placeholder="自动" value={li.line_total}
                                    onChange={e => updateLine(li.id, 'line_total', e.target.value === '' ? '' : Number(e.target.value))}
                                    className="flex-1 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                                    style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
                                    onFocus={e => e.target.style.borderColor = GOLD}
                                    onBlur={e => e.target.style.borderColor = BORDER}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => setLineItems(p => [...p, mkLine()])}
                            className="w-full py-2 rounded-xl text-xs font-black transition-colors"
                            style={{ background: 'rgba(255,255,255,0.04)', border: `1px dashed ${BORDER}`, color: T3 }}>
                            + 添加一行
                          </button>
                          {lineItems.length > 0 && (
                            <div className="text-right text-xs font-black" style={{ color: GOLD }}>
                              明细合计 AED {lineItems.reduce((s, li) => s + (Number(li.line_total) || 0), 0).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Missing warning */}
                    {!quoteDraft.isReady && (
                      <div className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-bold"
                        style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D' }}>
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {quoteDraft.customerName === '待确认' && '缺少客户名称。'}
                        {quoteDraft.grandTotal == null && '缺少报价金额，无法登记历史报价；可以只保存跟进记录。'}
                      </div>
                    )}
                  </div>
                )}

                {/* Dup warning */}
                {quotePhase === 'dupWarn' && dupRecords.length > 0 && (
                  <div className="mx-5 mb-3 p-3 rounded-xl space-y-2"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }}>
                    <p className="text-xs font-black" style={{ color: '#FCD34D' }}>⚠ 发现 {dupRecords.length} 条相似报价，确认是否仍然登记：</p>
                    {dupRecords.slice(0, 2).map((r: any) => (
                      <div key={r.id} className="text-[10px] font-bold" style={{ color: T2 }}>
                        {r.quote_no} · {r.customer_name} · AED {Number(r.grand_total).toLocaleString()} · {r.quote_date}
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => quoteDraft && doSaveQuote(quoteDraft)}
                        className="px-3 py-1.5 rounded-lg text-xs font-black"
                        style={{ background: GOLD, color: '#000' }}>仍然登记</button>
                      <button onClick={() => { setQuotePhase('skipped'); setTimeout(resetAll, 1500); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${BORDER}`, color: T2 }}>跳过</button>
                    </div>
                  </div>
                )}

                {/* Quote phase result */}
                {quotePhase !== 'idle' && quotePhase !== 'dupWarn' && (
                  <div className="mx-5 mb-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-bold"
                    style={{
                      background: quotePhase === 'done' ? 'rgba(5,150,105,0.12)' : quotePhase === 'failed' ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${quotePhase === 'done' ? 'rgba(5,150,105,0.4)' : quotePhase === 'failed' ? 'rgba(239,68,68,0.3)' : BORDER}`,
                      color: quotePhase === 'done' ? '#6EE7B7' : quotePhase === 'failed' ? '#FCA5A5' : T2,
                    }}>
                    {quotePhase === 'checking' && '🔍 检查重复中…'}
                    {quotePhase === 'saving'   && '💾 登记中…'}
                    {quotePhase === 'done' && !quoteError && <><CheckCircle2 className="w-3 h-3 shrink-0" /> 历史报价已登记</>}
                    {quotePhase === 'done' && quoteError  && <><AlertCircle  className="w-3 h-3 shrink-0" /> {quoteError}</>}
                    {quotePhase === 'failed'   && <><AlertCircle  className="w-3 h-3 shrink-0" /> 登记失败：{quoteError}</>}
                    {quotePhase === 'skipped'  && '已跳过报价登记'}
                  </div>
                )}
              </div>
            )}

            {/* Edit mode panel (Bug 3) */}
            {isEditing && draftEdit && (
              <div className="px-5 py-4 space-y-3 rounded-b-none" style={{ background: '#07111F', borderTop: `1px solid ${GOLD}40` }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>编辑草稿字段</p>
                {([
                  ['客户名称', 'clientName', 'text'],
                  ['下一步',   'nextAction', 'text'],
                  ['跟进日期', 'dueDate',    'date'],
                ] as [string, keyof FollowUpDraft, string][]).map(([label, key, type]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0" style={{ color: T3 }}>{label}</span>
                    <input type={type}
                      value={(draftEdit[key] as string) || ''}
                      onChange={e => setDraftEdit(p => p ? { ...p, [key]: e.target.value } : null)}
                      className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
                      style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}
                      onFocus={e => e.target.style.borderColor = GOLD}
                      onBlur={e => e.target.style.borderColor = BORDER}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0" style={{ color: T3 }}>类型</span>
                  <select value={draftEdit.type}
                    onChange={e => setDraftEdit(p => p ? { ...p, type: e.target.value as any } : null)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
                    style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}>
                    <option value="TRADE">贸易询盘</option>
                    <option value="PROJECT">项目推进</option>
                    <option value="LOG_ONLY">仅记录</option>
                    <option value="INTERNAL">内部任务</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0" style={{ color: T3 }}>优先级</span>
                  <select value={draftEdit.priority}
                    onChange={e => setDraftEdit(p => p ? { ...p, priority: e.target.value as any } : null)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
                    style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0" style={{ color: T3 }}>负责人</span>
                  <select value={draftEdit.assignedTo}
                    onChange={e => setDraftEdit(p => p ? { ...p, assignedTo: e.target.value } : null)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none"
                    style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}>
                    <option value="本人">本人</option>
                    <option value="Lili">Lili</option>
                    <option value="Novie">Novie</option>
                  </select>
                </div>
                {/* Quotation amount edit in edit mode */}
                {quoteDraft && registerQuote && (
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest w-16 shrink-0" style={{ color: T3 }}>报价金额</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-bold" style={{ color: T3 }}>AED</span>
                      <input type="number" min="0"
                        placeholder="手动输入报价总额"
                        defaultValue={quoteDraft.grandTotal ?? ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setQuoteDraft(p => p ? { ...p, grandTotal: isNaN(v) ? null : v, isReady: !isNaN(v) && p.customerName !== '待确认' } : null);
                        }}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-bold outline-none"
                        style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}
                        onFocus={e => e.target.style.borderColor = GOLD}
                        onBlur={e => e.target.style.borderColor = BORDER}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (draftEdit) {
                      setDraft(draftEdit);
                      // sync clientName to quoteDraft
                      if (quoteDraft && draftEdit.clientName !== '待确认') {
                        setQuoteDraft(p => p ? { ...p, customerName: draftEdit.clientName, isReady: p.grandTotal != null } : null);
                      }
                    }
                    setIsEditing(false);
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-black text-white transition-all"
                  style={{ background: `linear-gradient(135deg, #0F172A, #1E3A5F)`, border: `1px solid ${GOLD}` }}>
                  ✓ 确认修改
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="px-5 py-4 flex flex-wrap gap-3" style={{ background: CARD2, borderTop: `1px solid ${BORDER}` }}>
              <button onClick={handleSave} disabled={isLoading || saved || isEditing}
                className="flex-1 min-w-[120px] py-3 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: saved ? '#059669' : '#0F172A', border: `1px solid ${saved ? '#059669' : GOLD}50` }}>
                {saved
                  ? <><CheckCircle2 className="w-4 h-4" /> 已保存</>
                  : isLoading ? '保存中…' : '保存为跟进记录'}
              </button>
              <button
                onClick={() => {
                  if (isEditing) { setIsEditing(false); setDraftEdit(null); }
                  else { setIsEditing(true); setDraftEdit(draft ? { ...draft } : null); }
                }}
                disabled={saved}
                className="px-5 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: isEditing ? `${GOLD}20` : 'rgba(255,255,255,0.05)', border: `1px solid ${isEditing ? GOLD : BORDER}`, color: isEditing ? GOLD_L : T2 }}>
                <Edit2 className="w-3.5 h-3.5 inline mr-1.5" />{isEditing ? '收起编辑' : '修改'}
              </button>
              <button onClick={resetAll} disabled={saved}
                className="px-5 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: T3 }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
