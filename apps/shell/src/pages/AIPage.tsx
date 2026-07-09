import { useState, useEffect, useRef } from 'react';
import { DailyWorkbench } from '../components/DailyWorkbench';
import { useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { InvoiceAssistantPanel } from '../components/invoice/InvoiceAssistantPanel';
import { BillingProfileDraftPanel } from '../components/invoice/BillingProfileDraftPanel';
import { detectAIIntent, getIntentSteps } from '../ai/aiRouter';
import type { AIIntentMatch } from '../ai/aiRouter';
import { readCRMTasks, getCRMBriefStats, getCRMCustomerData } from '../lib/crmLocalStore';

// ── Product name extraction for inventory queries ─────────────────────────────
// Extracts a product keyword from natural language input, e.g.:
// "心相印的湿巾还有多少库存？" → "心相印的湿巾"
// "请帮我查一下心想印的库存"   → "心想印"
// "咖啡机的库存还有多少"        → "咖啡机"
// "查一下库存"                  → null (no specific product)
function extractInventoryProduct(raw: string): string | null {
  const s = raw.replace(/[？?。！!，,]/g, '').trim();

  // Pattern 1: <product>还有多少/剩多少/有没有货 ... (product comes before quantity phrases)
  let m = s.match(/^(.+?)(?:还有多少|剩多少|有没有货|是否有货|能不能出货|有货吗|有多少货|还有货)/u);
  if (m?.[1]) {
    const c = m[1].replace(/的$/, '').trim();
    if (c.length >= 2 && c.length <= 25) return c;
  }

  // Pattern 2: 查/看 <product> 库存
  m = s.match(/(?:查|看)(?:一下|查看|查询)?(.+?)(?:的)?库存/u);
  if (m?.[1]) {
    const c = m[1].replace(/^[帮我请一下\s]+/, '').trim();
    if (c.length >= 2 && c.length <= 25) return c;
  }

  // Pattern 3: <product>的库存
  m = s.match(/(.+?)的库存/u);
  if (m?.[1]) {
    const c = m[1].replace(/^.*(查|看|帮|我|请|一下)\s*/u, '').trim();
    if (c.length >= 2 && c.length <= 25) return c;
  }

  return null;
}

// ── Customer name extraction for quotation history queries ────────────────────
// "IFZA 之前报过什么价" → "IFZA"
// "查 Namas 的历史报价" → "Namas"
// "查历史报价"          → null (no specific customer)
function extractCustomerName(raw: string): string | null {
  const s = raw.replace(/[？?。！!，,]/g, '').trim();

  // Strip trailing Chinese particles / noise from an extracted name
  const clean = (c: string) =>
    c
      .replace(/\s*(?:的|这个客户|这个|客户)\s*$/, '')
      .replace(/^[帮我请一下\s]+/, '')
      .trim();

  // Pattern: 查/看 <customer> 的历史报价
  let m = s.match(/(?:查|看)(?:一下|查看|查询)?\s*(.+?)\s*(?:的\s*)?(?:历史报价|以前报价|之前报价|报价记录)/u);
  if (m?.[1]) {
    const c = clean(m[1]);
    if (c.length >= 2 && c.length <= 30) return c;
  }

  // Pattern: <customer> 以前/之前报价/报过  (add optional 的 before time words)
  m = s.match(/^(.+?)\s*(?:的\s*)?(?:以前|之前|上次|历史)(?:报过|报价|的报价)/u);
  if (m?.[1]) {
    const c = clean(m[1]);
    if (c.length >= 2 && c.length <= 30) return c;
  }

  // Pattern: <customer> 报过什么价
  m = s.match(/^(.+?)\s*报过什么价/u);
  if (m?.[1]) {
    const c = clean(m[1]);
    if (c.length >= 2 && c.length <= 30) return c;
  }

  return null;
}

// ── Product name extraction for product overview queries ──────────────────────
// Extracts a specific product name from natural language input, e.g.:
// "Coffee table 单价是多少" → "Coffee table"
// "查 心相印湿巾 的历史报价" → "心相印湿巾"
// "这个产品多少钱" → null (product not specified, user must clarify)
function extractProductName(raw: string): string | null {
  const s = raw.replace(/[？?。！!，,]/g, '').trim();

  // Pattern 1: <product> + price / stock / history suffix
  let m = s.match(/^(.+?)\s*(?:单价|价格|多少钱|以前报|报过多少|历史单价|历史报价|以前报价|报过价|还有多少库存|还有多少|库存和价格|建议报价|成本价|售价)/u);
  if (m?.[1]) {
    const name = m[1]
      .replace(/^(?:查一下|查看|查询|查|看|帮我|请|帮|你帮我)\s*/u, '')
      .replace(/\s*的\s*$/, '')
      .trim();
    if (name.length >= 2 && name.length <= 40 && !/^(?:以前|之前|现在|最近|历史|单价|价格|多少|这个|产品)$/.test(name)) {
      return name;
    }
  }

  // Pattern 2: 查/看 <product> 的 历史报价/单价/价格/库存
  m = s.match(/(?:查一下|查看|查询|查|看)\s+(.+?)\s*(?:的)?(?:历史报价|单价|价格|库存|多少钱)/u);
  if (m?.[1]) {
    const name = m[1].replace(/^[帮我请一下\s]+/u, '').trim();
    if (name.length >= 2 && name.length <= 40) return name;
  }

  // Pattern 3: <product> 这个产品 (e.g. "Coffee table 这个产品多少钱")
  m = s.match(/^(.+?)\s*这个产品/u);
  if (m?.[1] && m[1].trim().length >= 2) return m[1].trim();

  return null;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const NAVY = '#080D1E';
const TEXT = colors.textPrimary;
const MUTED = '#8A97B0';   // lifted for readability — was #505A70
const SUBTLE = '#5A6A84';  // was #3A4255, invisible on dark bg

type TabKey = 'chat' | 'assistant' | 'agent' | 'daily' | 'workflow' | 'inbox';

const TABS: { key: TabKey; label: string; icon: string; status: 'mock' | 'soon' | 'live' }[] = [
  { key: 'chat',      label: 'AI Chat',      icon: '💬', status: 'mock' },
  { key: 'assistant', label: 'AI Assistant', icon: '⚡', status: 'mock' },
  { key: 'agent',     label: 'AI Agent',     icon: '🤖', status: 'soon' },
  { key: 'daily',     label: '今日工作台',    icon: '📋', status: 'live' },
  { key: 'workflow',  label: 'AI Workflow',  icon: '🔄', status: 'soon' },
  { key: 'inbox',     label: 'AI Inbox',     icon: '📥', status: 'mock' },
];

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  mock: { label: 'MOCK',        color: '#D4A843', bg: 'rgba(212,168,67,0.12)' },
  soon: { label: 'COMING SOON', color: MUTED,     bg: 'rgba(255,255,255,0.05)' },
  live: { label: 'LIVE',        color: '#6FBF8E', bg: 'rgba(111,191,142,0.12)' },
};

// ── Command processing panel ──────────────────────────────────────────────────
interface CmdState {
  raw: string;
  match: AIIntentMatch;
  phase: 'processing' | 'done' | 'not_connected';
  step: number;
  resultData?: any;
}

const IMPL_STATUS_COLORS: Record<string, string> = {
  real: '#6FBF8E', partial: GOLD, mock: '#D4A843', missing: '#E0846A',
};

// ── CRM AI helpers ────────────────────────────────────────────────────────────
function resolveStatusAlias(text: string): string | null {
  if (/合同待签|等客户签合同|待签合同|签合同|待签约/i.test(text)) return '合同待签';
  if (/暂缓|暂不跟进|先不跟进|关闭本次跟进|归档本次跟进/i.test(text)) return '暂缓';
  if (/恢复跟进|继续跟进|重新跟进/i.test(text)) return '跟进中';
  if (/已报价待确认|等客户确认报价|报价待确认/i.test(text)) return '已报价待确认';
  if (/已成交|成交了/i.test(text)) return '已成交';
  if (/执行中|开始执行/i.test(text)) return '执行中';
  if (/归档/i.test(text)) return '已归档';
  return null;
}

function extractUpdateIntent(raw: string): { customerName: string; newStatus: string | null } {
  const clean = raw.trim();
  // "把 KHALED 更新到/改成 合同待签"
  const m1 = clean.match(/把\s+(.+?)\s+(?:更新到|更新为|改成|设置为|变成)\s*(.+)/u);
  if (m1) return { customerName: m1[1].trim(), newStatus: resolveStatusAlias(m1[2]) };
  // "KHALED 改成/更新到 暂缓"
  const m2 = clean.match(/^([A-Za-z一-龥][^\s,，。]{1,30}?)\s+(?:改成|更新到|更新为|设置为|变成)\s*(.+)/u);
  if (m2) return { customerName: m2[1].trim(), newStatus: resolveStatusAlias(m2[2]) };
  // "更新 KHALED 状态 合同待签"
  const m3 = clean.match(/更新\s+(.+?)\s+(?:状态|到|为)\s*(.+)/u);
  if (m3) return { customerName: m3[1].trim(), newStatus: resolveStatusAlias(m3[2]) };
  return { customerName: '', newStatus: resolveStatusAlias(clean) };
}

function parseCreateDraft(raw: string): {
  clientName: string; businessType: 'TRADE' | 'PROJECT';
  city: string; phone: string; whatsapp: string; email: string;
  lastContext: string; owner: string; nextFollowUpAt: string;
} {
  const clean = raw.trim();
  // Extract name after trigger keyword
  const nameM = clean.match(/(?:新增客户|增加客户|录入客户|新客户|create customer|add customer|new lead)[:：\s]+([A-Za-z一-龥][^\s,，。\n:：]{1,40})/iu);
  const clientName = nameM?.[1]?.trim() || '';

  const phoneM = clean.match(/(?:电话|phone|tel|手机)[:：\s]*(\+?[\d\s()-]{7,20})/i);
  const waM = clean.match(/(?:wa|whatsapp|wechat|微信|wp)[:：\s]*(\+?[\d\s()-]{7,20})/i);
  const emailM = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const cityM = clean.match(/(?:迪拜|dubai|中国|上海|北京|广州|深圳|沙特|利雅得|阿布扎比|sharjah|sharjah|ajman)/i);

  const isProject = /villa|fitout|装修|工程|项目|interior|FF&E|酒店|别墅/i.test(clean);
  const businessType: 'TRADE' | 'PROJECT' = isProject ? 'PROJECT' : 'TRADE';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextFollowUpAt = tomorrow.toISOString().slice(0, 10);

  // Context: everything after the name
  const afterName = nameM ? clean.slice((nameM.index ?? 0) + nameM[0].length).replace(/[,，。！!]/g, ' ').trim() : '';

  return {
    clientName,
    businessType,
    city: cityM?.[0]?.trim() || '',
    phone: phoneM?.[1]?.trim() || '',
    whatsapp: waM?.[1]?.trim() || '',
    email: emailM?.[0]?.trim() || '',
    lastContext: afterName.slice(0, 200),
    owner: 'Chris',
    nextFollowUpAt,
  };
}

// ── Quotation draft generation number ────────────────────────────────────────
function genQuoteNo(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `AI-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Parser for "register_existing_quotation" intent ───────────────────────────
// Input examples:
//   "登记一条报价：IFZA，咖啡机，AED 28,000，今天发给客户"
//   "记录客户报价：Namas，湿巾，AED 12,500，已发 WhatsApp"
function parseQuotationDraft(raw: string): {
  customerName: string;
  itemSummary: string;
  grandTotal: number | null;
  currency: string;
  quoteDate: string;
  quoteType: 'TRADE' | 'BOQ' | 'CUSTOM';
  source: string;
  notes: string;
  phoneWa: string;
  salesperson: string;
  quoteNo: string;
} {
  const clean = raw.replace(/[？?。！!]/g, '').trim();
  const today = new Date().toISOString().slice(0, 10);

  // Strip trigger prefix
  const body = clean
    .replace(/^(?:登记(?:一条)?报价|记录(?:客户)?报价|保存报价记录|已经报价|给客户报价|这个客户报价|register quotation|record quote|existing quotation)[：:\s]*/iu, '')
    .trim();

  // Split by Chinese / English comma or newline into parts
  const parts = body.split(/[，,\n]+/).map(s => s.trim()).filter(Boolean);

  // Part[0]: customer name (if no AED and not a date phrase)
  const customerName = (() => {
    const p0 = parts[0] || '';
    if (/^AED/i.test(p0) || /今天|昨天|上午|下午|刚才/.test(p0)) return '';
    return p0;
  })();

  // Find item summary: first non-customer, non-AED, non-date part
  const itemSummary = (() => {
    const start = customerName ? 1 : 0;
    for (let i = start; i < parts.length; i++) {
      const p = parts[i];
      if (/AED|aed|\d{4,}/.test(p)) continue;
      if (/今天|昨天|上午|下午|刚发|发给客户/.test(p)) continue;
      if (/whatsapp|wechat|微信|pdf|excel|upload/i.test(p)) continue;
      return p;
    }
    return '';
  })();

  // Find AED amount
  const aedMatch = clean.match(/AED\s*([\d,]+(?:\.\d+)?)/i);
  const grandTotal = aedMatch ? Number(aedMatch[1].replace(/,/g, '')) : null;

  // Find date
  const quoteDate = (() => {
    if (/今天/.test(clean)) return today;
    if (/昨天/.test(clean)) {
      const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
    }
    const dateM = clean.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    return dateM ? dateM[1].replace(/\//g, '-') : today;
  })();

  // Source detection
  const source = /whatsapp|wa\b/i.test(clean) ? 'WhatsApp'
    : /wechat|微信/.test(clean) ? '微信'
    : /excel|xlsx/i.test(clean) ? 'Excel'
    : /pdf/i.test(clean) ? 'PDF'
    : /upload|上传/.test(clean) ? 'Upload'
    : 'AI 手动录入';

  // Quote type
  const quoteType = /BOQ|boq/.test(clean) ? 'BOQ'
    : /CUSTOM|custom/i.test(clean) ? 'CUSTOM'
    : 'TRADE';

  // Phone/WA
  const waM = clean.match(/(?:wa|whatsapp|wp|电话|phone)[:：\s]*(\+?[\d\s()-]{7,20})/i);

  // Notes: everything after main fields that doesn't fit
  const notes = (() => {
    const nM = clean.match(/(?:备注|note[s]?)[:：\s]*(.+)/i);
    return nM ? nM[1].trim() : '';
  })();

  return {
    customerName,
    itemSummary,
    grandTotal,
    currency: 'AED',
    quoteDate,
    quoteType,
    source,
    notes,
    phoneWa: waM?.[1]?.trim() || '',
    salesperson: 'Chris',
    quoteNo: genQuoteNo(),
  };
}

function CommandPanel({ state, onApprove, onEdit, onCancel }: {
  state: CmdState;
  onApprove: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { dict } = useI18n();
  const { raw, match, phase, step } = state;
  const { intent, confidence } = match;

  // Local state for write-back intents (update_followup_status, create_customer_from_ai)
  const [writePhase, setWritePhase] = useState<'confirm' | 'sending' | 'done' | 'error'>('confirm');
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeResult, setWriteResult] = useState<any>(null);

  // Local state for register_existing_quotation
  const [regPhase, setRegPhase] = useState<'draft' | 'checking' | 'dupWarn' | 'saving' | 'saved' | 'followUpSaving' | 'followUpDone' | 'error'>('draft');
  const [regDups, setRegDups] = useState<any[]>([]);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSaved, setRegSaved] = useState<any>(null);
  const [regFollowUp, setRegFollowUp] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const IMPL_STATUS_LABELS: Record<string, string> = {
    real: dict.ai.panel.implReal,
    partial: dict.ai.panel.implPartial,
    mock: dict.ai.panel.implMock,
    missing: dict.ai.panel.implMissing,
  };

  const TAB_LABELS: Record<TabKey, string> = {
    chat: 'AI Chat', assistant: 'AI Assistant', agent: 'AI Agent',
    daily: 'AI Daily', workflow: 'AI Workflow', inbox: 'AI Inbox',
  };
  const MODULE_COLORS: Record<string, string> = {
    CRM: '#5BA3C9', Quotation: GOLD, Trade: '#8FA6D4',
    Warehouse: '#D4A843', Finance: '#6FBF8E', 'AI Inbox': '#94A3B8',
    'AI Daily': '#8FA6D4', 'AI Workflow': '#B084C9', 'AI Assistant': GOLD, 'AI Chat': '#5BA3C9',
  };
  const modColor = MODULE_COLORS[intent.targetModule] || GOLD;
  const implColor = IMPL_STATUS_COLORS[intent.implementationStatus] || MUTED;
  const steps = getIntentSteps(intent);

  return (
    <div style={{ margin: '16px 0 28px', padding: '20px 22px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16 }}>

      {/* Routing badge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: modColor }} />
        <span style={{ fontSize: 11.5, color: modColor, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
          {dict.ai.panel.routedTo} {TAB_LABELS[intent.targetTab as TabKey]} · {intent.targetModule}
        </span>
        {/* Implementation status badge */}
        <span style={{ fontSize: 9.5, color: implColor, background: `${implColor}22`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em' }}>
          {IMPL_STATUS_LABELS[intent.implementationStatus]}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        <span style={{ fontSize: 12, color: SUBTLE, fontStyle: 'italic' }}>"{raw}"</span>
        {confidence > 0 && (
          <span style={{ fontSize: 10, color: SUBTLE, fontFamily: 'IBM Plex Mono, monospace' }}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {/* Task label */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{intent.intentNameZh}</span>
        <span className="font-mono-label" style={{ marginLeft: 10, fontSize: 10, color: MUTED }}>/ {intent.intentNameEn}</span>
      </div>

      {/* NOT CONNECTED — skip animation, show message directly */}
      {phase === 'not_connected' && (
        <div style={{ padding: '16px 18px', background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 10 }}>
          <div className="font-mono-label" style={{ fontSize: 9.5, color: '#E0846A', letterSpacing: '0.15em', marginBottom: 10 }}>
            {dict.ai.panel.notConnectedTitle}
          </div>
          <div style={{ fontSize: 14, color: TEXT, marginBottom: 14, lineHeight: 1.7 }}>
            {intent.notConnectedMessage || `「${intent.intentNameZh}」功能暂未接入真实数据源。请前往对应模块手动操作。`}
          </div>
          <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
            {dict.ai.panel.close}
          </button>
        </div>
      )}

      {/* Step animation — only for non-missing intents */}
      {phase !== 'not_connected' && (
        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 16 }}>
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            const stepState = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                <div style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  {stepState === 'done' && <span style={{ color: '#6FBF8E', fontSize: 12 }}>✓</span>}
                  {stepState === 'active' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: modColor, animation: 'pulse 1s ease infinite' }} />}
                  {stepState === 'pending' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />}
                </div>
                <span style={{
                  fontSize: 13,
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: stepState === 'done'
                    ? (isLast ? modColor : '#6FBF8E')
                    : stepState === 'active' ? TEXT : SUBTLE,
                  fontWeight: stepState === 'active' ? 600 : 400,
                  transition: 'color 0.3s',
                }}>
                  {s}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Result + actions (done state, non-missing) */}
      {phase === 'done' && (
        <div style={{ padding: '14px 16px', background: intent.approvalRequired ? 'rgba(111,191,142,0.07)' : 'rgba(203,168,92,0.07)', border: `1px solid ${intent.approvalRequired ? 'rgba(111,191,142,0.22)' : 'rgba(203,168,92,0.22)'}`, borderRadius: 10 }}>
          <div className="font-mono-label" style={{ fontSize: 9.5, color: intent.approvalRequired ? '#6FBF8E' : GOLD, letterSpacing: '0.15em', marginBottom: 8 }}>
            {intent.approvalRequired ? dict.ai.panel.waitingApproval : dict.ai.panel.done}
          </div>

          {/* ── Inventory result panel (combined: warehouse + consignment) ── */}
          {intent.intentId === 'check_inventory' && state.resultData && state.resultData.ok && (() => {
            const wh = state.resultData.warehouse;
            const cs = state.resultData.consignment;
            const productFilter = state.resultData.productFilter;
            const inlineRowStyle = (alertType: string) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7,
              background: alertType === 'outOfStock' ? 'rgba(224,132,106,0.08)' : alertType === 'anomaly' ? 'rgba(143,166,212,0.05)' : alertType === 'lowStock' ? 'rgba(212,168,67,0.07)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${alertType === 'outOfStock' ? 'rgba(224,132,106,0.28)' : alertType === 'anomaly' ? 'rgba(143,166,212,0.2)' : alertType === 'lowStock' ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.07)'}`,
            });
            const qtyColor = (t: string) => t === 'outOfStock' ? '#E0846A' : t === 'anomaly' ? '#8FA6D4' : t === 'lowStock' ? '#D4A843' : '#6FBF8E';
            const inlineBadge = (t: string) => t === 'outOfStock'
              ? <span style={{ fontSize: 9, color: '#E0846A', fontWeight: 700, background: 'rgba(224,132,106,0.15)', padding: '1px 5px', borderRadius: 4 }}>缺货</span>
              : t === 'anomaly'
              ? <span style={{ fontSize: 9, color: '#8FA6D4', fontWeight: 700, background: 'rgba(143,166,212,0.12)', padding: '1px 5px', borderRadius: 4 }}>异常</span>
              : t === 'lowStock'
              ? <span style={{ fontSize: 9, color: '#D4A843', fontWeight: 700, background: 'rgba(212,168,67,0.12)', padding: '1px 5px', borderRadius: 4 }}>低库存</span>
              : null;
            return (
              <div style={{ marginBottom: 12 }}>
                {productFilter && (
                  <div style={{ fontSize: 11, color: GOLD, marginBottom: 8 }}>筛选：「{productFilter}」</div>
                )}

                {/* Warehouse (Notion) section */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
                    库存表 · Notion INVENTORY_DB
                  </div>
                  {!wh.ok ? (
                    <div style={{ fontSize: 12, color: '#E0846A', padding: '8px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)' }}>
                      {wh.error || '库存表读取失败'}
                    </div>
                  ) : wh.totalRows === 0 ? (
                    <div style={{ fontSize: 12, color: MUTED }}>无匹配产品记录。</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: MUTED }}>共 <strong style={{ color: TEXT }}>{wh.totalRows}</strong> 件</span>
                        {wh.outOfStockCount > 0 && <span style={{ fontSize: 11, color: '#E0846A', fontWeight: 700 }}>🔴 缺货 {wh.outOfStockCount}</span>}
                        {wh.lowStockCount > 0   && <span style={{ fontSize: 11, color: '#D4A843', fontWeight: 700 }}>🟡 低库存 {wh.lowStockCount}</span>}
                        {wh.anomalyCount > 0    && <span style={{ fontSize: 11, color: '#8FA6D4', fontWeight: 700 }}>⚪ 异常 {wh.anomalyCount}</span>}
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(wh.alertItems?.length > 0 ? wh.alertItems : wh.alertItems ?? []).map((item: any, i: number) => (
                          <div key={i} style={inlineRowStyle(item.alertType)}>
                            <span style={{ flex: 1, fontSize: 13, color: TEXT, fontWeight: 600 }}>{item.productName}</span>
                            <span style={{ fontSize: 12, color: MUTED }}>{item.category || ''}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: qtyColor(item.alertType) }}>
                              {item.currentQty === null ? '—' : `剩 ${item.currentQty}`}
                            </span>
                            {inlineBadge(item.alertType)}
                          </div>
                        ))}
                        {wh.alertItems?.length === 0 && !productFilter && (
                          <div style={{ fontSize: 12, color: '#6FBF8E', padding: '6px 0' }}>✅ 库存表无预警</div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Consignment (Supabase) section */}
                <div>
                  <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
                    寄售库存 · consignment_stock
                  </div>
                  {!cs.ok ? (
                    <div style={{ fontSize: 12, color: '#E0846A', padding: '8px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)' }}>
                      {cs.error || '寄售库存读取失败'}
                    </div>
                  ) : cs.total === 0 ? (
                    <div style={{ fontSize: 12, color: MUTED }}>无匹配寄售记录。</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: MUTED }}>共 <strong style={{ color: TEXT }}>{cs.total}</strong> 种产品</span>
                        {cs.outOfStockCount > 0 && <span style={{ fontSize: 11, color: '#E0846A', fontWeight: 700 }}>🔴 缺货 {cs.outOfStockCount}</span>}
                        {cs.lowStockCount > 0   && <span style={{ fontSize: 11, color: '#D4A843', fontWeight: 700 }}>🟡 低库存 {cs.lowStockCount}</span>}
                        {cs.anomalyCount > 0    && <span style={{ fontSize: 11, color: '#8FA6D4', fontWeight: 700 }}>⚪ 异常 {cs.anomalyCount}</span>}
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(cs.alertRows ?? []).map((r: any, i: number) => {
                          const t = r.rowAlertType || (r.remainingQty === null ? 'anomaly' : r.remainingQty <= 0 ? 'outOfStock' : 'lowStock');
                          return (
                            <div key={i} style={inlineRowStyle(t)}>
                              <span style={{ flex: 1, fontSize: 13, color: TEXT, fontWeight: 600 }}>{r.productName}</span>
                              <span style={{ fontSize: 11, color: MUTED }}>{r.customerName || ''}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: qtyColor(t) }}>
                                {r.remainingQty === null ? '—' : `剩 ${r.remainingQty}`}
                              </span>
                              {inlineBadge(t)}
                            </div>
                          );
                        })}
                        {cs.alertRows?.length === 0 && (
                          <div style={{ fontSize: 12, color: '#6FBF8E', padding: '6px 0' }}>✅ 寄售库存无预警</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Inventory loading (resultData not yet returned) ── */}
          {intent.intentId === 'check_inventory' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
              正在查询库存数据（库存表 + 寄售库存）…
            </div>
          )}

          {/* ── Quotation follow-up result panel ── */}
          {intent.intentId === 'check_quotation_followups' && state.resultData && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                待回复报价共 {state.resultData.total} 笔
                {state.resultData.overdueCount > 0 && (
                  <span style={{ marginLeft: 10, color: '#E0846A', fontWeight: 700 }}>
                    ⚠ {state.resultData.overdueCount} 笔已超 {state.resultData.overdueDays} 天未回复
                  </span>
                )}
                {state.resultData.total === 0 && (
                  <span style={{ marginLeft: 10, color: '#6FBF8E', fontWeight: 700 }}>✓ 无待跟进报价</span>
                )}
              </div>
              {state.resultData.quotes.length > 0 && (
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {state.resultData.quotes.map((q: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: q.overdue ? 'rgba(224,132,106,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${q.overdue ? 'rgba(224,132,106,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{q.customerName}</span>
                        {q.projectName && <span style={{ fontSize: 11, color: MUTED, marginLeft: 6 }}>{q.projectName}</span>}
                      </div>
                      <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {q.currency} {Number(q.grandTotal).toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: q.overdue ? '#E0846A' : MUTED, whiteSpace: 'nowrap', minWidth: 55, textAlign: 'right' }}>
                        {q.daysAgo} 天前
                      </span>
                      {q.overdue && <span style={{ fontSize: 10, color: '#E0846A', fontWeight: 700 }}>跟进!</span>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
                数据来源：quotation_records · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* ── Quotation follow-up loading ── */}
          {intent.intentId === 'check_quotation_followups' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
              正在查询报价数据…
            </div>
          )}

          {/* ── Quotation follow-up API error ── */}
          {intent.intentId === 'check_quotation_followups' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>报价 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
              {state.resultData.detail && (
                <div style={{ color: SUBTLE, fontSize: 11, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {typeof state.resultData.detail === 'string' ? state.resultData.detail : JSON.stringify(state.resultData.detail)}
                </div>
              )}
            </div>
          )}

          {/* ── Quotation history result panel ── */}
          {intent.intentId === 'check_quotation_history' && state.resultData && state.resultData.ok && (
            <div style={{ marginBottom: 12 }}>
              {/* Data source label */}
              <div style={{ fontSize: 10, color: SUBTLE, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '1px 7px', borderRadius: 8, background: 'rgba(203,168,92,0.10)', border: '1px solid rgba(203,168,92,0.22)', color: GOLD, fontWeight: 700, letterSpacing: '0.04em' }}>
                  数据来源：历史报价 / quotation_records
                </span>
                {state.resultData.productFilter && (
                  <span style={{ padding: '1px 7px', borderRadius: 8, background: 'rgba(111,191,142,0.08)', border: '1px solid rgba(111,191,142,0.2)', color: '#6FBF8E' }}>
                    产品筛选：{state.resultData.productFilter}
                  </span>
                )}
              </div>

              {/* Alias match notice */}
              {state.resultData.matchedBy && state.resultData.matchedBy !== state.resultData.customerFilter && (
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                  已使用别名匹配：{state.resultData.matchedBy}
                </div>
              )}
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                {state.resultData.normalizedCustomer
                  ? <>客户「{state.resultData.normalizedCustomer}」共 {state.resultData.total} 条报价记录</>
                  : <>最近 {state.resultData.total} 条报价记录</>
                }
                {state.resultData.total > 0 && (
                  <span style={{ marginLeft: 12, color: GOLD, fontWeight: 600 }}>
                    合计 AED {Number(state.resultData.totalAmount).toLocaleString()}
                  </span>
                )}
              </div>
              {/* Status summary chips */}
              {state.resultData.statusSummary && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {Object.entries(state.resultData.statusSummary as Record<string, number>).map(([label, count]) => (
                    <span key={label} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(203,168,92,0.1)', border: '1px solid rgba(203,168,92,0.2)', color: GOLD }}>
                      {label} × {count}
                    </span>
                  ))}
                </div>
              )}
              {state.resultData.total === 0 ? (
                <div style={{ fontSize: 13, color: '#E0846A', padding: '10px 0' }}>
                  <div style={{ marginBottom: 6 }}>
                    {state.resultData.dataNote || (
                      state.resultData.productFilter
                        ? `未在历史报价中找到包含「${state.resultData.productFilter}」的报价记录。`
                        : '未找到该客户的报价记录。'
                    )}
                  </div>
                  {state.resultData.searchTerms?.length > 0 && (
                    <div style={{ fontSize: 11, color: MUTED }}>
                      <div style={{ marginBottom: 3 }}>已尝试搜索：</div>
                      {(state.resultData.searchTerms as string[]).map((t: string, i: number) => (
                        <div key={i} style={{ paddingLeft: 8 }}>· {t}</div>
                      ))}
                      <div style={{ marginTop: 6, color: SUBTLE }}>请检查客户名称或产品名称在报价记录中的写法是否不同。</div>
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: SUBTLE, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    💡 降级建议：历史报价 (quotation_records) 未找到结果。如需查产品标准价格，请问"XX产品多少钱"，AI 将查询产品主库。
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {state.resultData.quotes.map((q: any, i: number) => {
                    // CRM customer_quote_record — different display
                    if (q.source === 'crm_customer_quote_record') {
                      const attFiles: any[] = q.attachments || [];
                      return (
                        <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#A5B4FC', fontWeight: 700 }}>
                              📋 CRM 客户报价留底
                            </span>
                            {q.isArchived && (
                              <span style={{ fontSize: 10, color: '#D4A843', padding: '1px 6px', borderRadius: 5, background: 'rgba(203,168,92,0.08)', border: '1px solid rgba(203,168,92,0.2)' }}>
                                已归档
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1 }}>{q.customerName}</span>
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(99,102,241,0.10)', color: '#A5B4FC' }}>
                              {q.statusZh}
                            </span>
                          </div>
                          {q.projectName && (
                            <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>{q.projectName}</div>
                          )}
                          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>
                            {q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}
                            {q.salesperson && <span style={{ marginLeft: 10 }}>{q.salesperson}</span>}
                            {q.tradeStatus && <span style={{ marginLeft: 10, color: '#A5B4FC' }}>{q.tradeStatus}</span>}
                          </div>
                          {/* 金额未结构化提示 */}
                          <div style={{ fontSize: 11, color: '#D4A843', padding: '4px 8px', borderRadius: 5, background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.15)', marginBottom: 4 }}>
                            💡 已留底，但金额尚未结构化。可打开附件查看原报价单。
                          </div>
                          {/* Next action */}
                          {q.nextAction && (
                            <div style={{ fontSize: 11, color: TEXT, marginBottom: 3 }}>
                              <span style={{ color: MUTED }}>下一步：</span>{q.nextAction}
                            </div>
                          )}
                          {/* Attachment list */}
                          {attFiles.length > 0 && (
                            <div style={{ marginTop: 4, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>报价文件：</div>
                              {attFiles.map((att: any, j: number) => {
                                const fileUrl = att.url || att.driveUrl || '';
                                const hasUrl = fileUrl && fileUrl.startsWith('http');
                                return (
                                <div key={j} style={{ fontSize: 11, color: hasUrl ? '#A5B4FC' : MUTED, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>📎 {att.name || att.filename || `附件 ${j + 1}`}</span>
                                  {hasUrl ? (
                                    <a href={fileUrl} target="_blank" rel="noreferrer"
                                      style={{ color: GOLD, fontSize: 10, border: '1px solid rgba(203,168,92,0.3)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                      打开文件 ↗
                                    </a>
                                  ) : (
                                    <span style={{ fontSize: 10, color: SUBTLE }}>[未上传云端]</span>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                          )}
                          {attFiles.length === 0 && (
                            <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>该报价留底暂无附件文件</div>
                          )}
                        </div>
                      );
                    }
                    // Standard quotation_records display
                    const validItems = (q.items || []).filter((it: any) => {
                      const name = (it.item_name || '').trim();
                      if (/^=DISPIMG/i.test(name) || /^=IMAGE/i.test(name)) return false;
                      if (!name && !(it.description || '').trim()) return false;
                      return true;
                    });
                    const hiddenCount = (q.items || []).length - validItems.length;
                    return (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: q.isArchived ? 'rgba(203,168,92,0.04)' : 'rgba(255,255,255,0.03)', border: q.isArchived ? '1px solid rgba(203,168,92,0.15)' : '1px solid rgba(255,255,255,0.07)' }}>
                      {/* 归档警告 */}
                      {q.isArchived && (
                        <div style={{ fontSize: 10, color: '#D4A843', marginBottom: 5, padding: '3px 7px', borderRadius: 5, background: 'rgba(203,168,92,0.08)', border: '1px solid rgba(203,168,92,0.2)', display: 'inline-block' }}>
                          ⚠️ 该报价已归档（未成交），不代表成交价格
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1 }}>{q.customerName}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap' }}>
                          AED {Number(q.grandTotal).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: q.status === 'GENERATED' ? 'rgba(203,168,92,0.12)' : q.status === 'SENT_TO_TRADE' ? 'rgba(111,191,142,0.12)' : 'rgba(255,255,255,0.06)', color: q.status === 'GENERATED' ? GOLD : q.status === 'SENT_TO_TRADE' ? '#6FBF8E' : MUTED }}>
                          {q.statusZh}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: MUTED, marginBottom: validItems.length ? 6 : 0 }}>
                        <span>{q.quoteNo}</span>
                        {q.projectName && <span>{q.projectName}</span>}
                        <span>{q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}</span>
                        {q.salesperson && <span>{q.salesperson}</span>}
                      </div>
                      {/* Line items (invalid rows filtered) */}
                      {validItems.length > 0 && (
                        <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {validItems.map((it: any, j: number) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, color: MUTED, padding: '2px 0' }}>
                              <span style={{ fontWeight: 700, color: TEXT, minWidth: 0, flex: '0 1 auto' }}>{j + 1}. {it.item_name}</span>
                              {it.description && <span style={{ color: SUBTLE }}>｜{it.description}</span>}
                              <span>｜×{it.qty} {it.unit}</span>
                              <span style={{ color: GOLD }}>@ AED {Number(it.selling_price).toLocaleString()}</span>
                              <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontWeight: 700, color: TEXT }}>
                                AED {Number(it.line_total).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(q.items || []).length === 0 && (
                        <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>该报价暂无产品明细</div>
                      )}
                      {hiddenCount > 0 && (
                        <div style={{ fontSize: 10, color: SUBTLE, marginTop: 4 }}>
                          已隐藏 {hiddenCount} 条图片 / 无效明细行
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>数据来源：quotation_records · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}</span>
                {state.resultData.hasCrmRecords && (
                  <span style={{ color: '#A5B4FC' }}>+ CRM 留底 {state.resultData.crmQuoteCount} 条</span>
                )}
              </div>
            </div>
          )}

          {/* ── Quotation history loading ── */}
          {intent.intentId === 'check_quotation_history' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在检索历史报价…</div>
          )}

          {/* ── Quotation history API error ── */}
          {intent.intentId === 'check_quotation_history' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>历史报价 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Product overview loading ── */}
          {intent.intentId === 'product_overview' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在查询产品信息…</div>
          )}

          {/* ── Product overview API error ── */}
          {intent.intentId === 'product_overview' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>产品查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Product overview result panel ── */}
          {intent.intentId === 'product_overview' && state.resultData && state.resultData.ok && (() => {
            const d = state.resultData;
            const CARD_BG  = 'rgba(255,255,255,0.03)';
            const CARD_BDR = '1px solid rgba(255,255,255,0.07)';
            const WARN_BG  = 'rgba(224,132,106,0.06)';
            const WARN_BDR = '1px solid rgba(224,132,106,0.2)';
            const GOLD_BDR = `1px solid rgba(203,168,92,0.25)`;
            const GREEN    = '#6FBF8E';
            return (
              <div style={{ marginBottom: 12 }}>
                {/* Search header */}
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                  关键词：<span style={{ color: GOLD, fontWeight: 700 }}>「{d.productKeyword}」</span>
                </div>

                {/* Project query warning */}
                {d.isProjectQuery && (
                  <div style={{ padding: '8px 12px', background: WARN_BG, border: WARN_BDR, borderRadius: 8, fontSize: 12, color: '#E0846A', marginBottom: 10 }}>
                    ⚠ {d.projectQueryNote}
                  </div>
                )}

                {/* Section A: 产品主库 */}
                <div style={{ padding: '10px 12px', background: CARD_BG, border: GOLD_BDR, borderRadius: 9, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>产品主库 / PRODUCT MASTER
                    <span style={{ marginLeft: 8, fontSize: 9, color: SUBTLE, fontWeight: 400 }}>Notion · 标准参考价</span>
                  </div>
                  {!d.productMaster.found ? (
                    <div style={{ fontSize: 12, color: MUTED }}>未在产品主库找到「{d.productKeyword}」的匹配记录。</div>
                  ) : (
                    d.productMaster.items.map((pm: any, i: number) => (
                      <div key={i} style={{ marginBottom: i < d.productMaster.items.length - 1 ? 10 : 0, paddingBottom: i < d.productMaster.items.length - 1 ? 10 : 0, borderBottom: i < d.productMaster.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{pm.productName}</span>
                          {pm.productNameEn && pm.productNameEn !== pm.productName && <span style={{ fontSize: 11, color: MUTED }}>{pm.productNameEn}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5, fontSize: 11 }}>
                          {pm.sku && <span style={{ color: MUTED }}>SKU: <span style={{ color: TEXT }}>{pm.sku}</span></span>}
                          {pm.category && <span style={{ color: MUTED }}>类别: <span style={{ color: TEXT }}>{pm.category}</span></span>}
                          {pm.brand && <span style={{ color: MUTED }}>品牌: <span style={{ color: TEXT }}>{pm.brand}</span></span>}
                          {pm.sellingUnit && <span style={{ color: MUTED }}>单位: <span style={{ color: TEXT }}>{pm.sellingUnit}</span></span>}
                          {pm.stockStatus && <span style={{ color: MUTED }}>状态: <span style={{ color: TEXT }}>{pm.stockStatus}</span></span>}
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 7, flexWrap: 'wrap' }}>
                          {pm.targetWholesale != null && (
                            <div style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(203,168,92,0.08)', border: GOLD_BDR }}>
                              <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>建议批发价</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>AED {Number(pm.targetWholesale).toLocaleString()}</div>
                            </div>
                          )}
                          {pm.costPriceAED != null && (
                            <div style={{ padding: '5px 10px', borderRadius: 6, background: CARD_BG, border: CARD_BDR }}>
                              <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>成本价（内部）</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>AED {Number(pm.costPriceAED).toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Section B: 库存 (qty only) */}
                <div style={{ padding: '10px 12px', background: CARD_BG, border: CARD_BDR, borderRadius: 9, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>库存数量 / INVENTORY</div>
                  {!d.inventory.found ? (
                    <div style={{ fontSize: 12, color: MUTED }}>库存表中未找到匹配记录。</div>
                  ) : (
                    d.inventory.items.map((inv: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12 }}>
                        <span style={{ flex: 1, color: TEXT }}>{inv.nameEN}</span>
                        <span style={{ color: MUTED }}>{inv.warehouse}</span>
                        <span style={{ fontWeight: 700, color: inv.outOfStock ? '#E0846A' : inv.lowStock ? '#D4AF37' : GREEN }}>
                          {inv.currentQty != null ? `${inv.currentQty} ${inv.unit}` : '—'}
                        </span>
                        {inv.outOfStock && <span style={{ fontSize: 10, color: '#E0846A', fontWeight: 700 }}>缺货</span>}
                        {inv.lowStock && !inv.outOfStock && <span style={{ fontSize: 10, color: '#D4AF37', fontWeight: 700 }}>低库存</span>}
                      </div>
                    ))
                  )}
                  <div style={{ fontSize: 10, color: SUBTLE, marginTop: 4 }}>库存仅显示数量。价格请参考产品主库或历史报价。</div>
                </div>

                {/* Section C: 寄售库存 */}
                {d.consignment.found && (
                  <div style={{ padding: '10px 12px', background: CARD_BG, border: CARD_BDR, borderRadius: 9, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>寄售库存 / CONSIGNMENT</div>
                    {d.consignment.items.map((cs: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0', fontSize: 12, flexWrap: 'wrap' }}>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{cs.customerName || '—'}</span>
                        {cs.soNo && <span style={{ color: MUTED }}>SO: {cs.soNo}</span>}
                        <span style={{ color: MUTED }}>剩余: <span style={{ color: TEXT, fontWeight: 700 }}>{cs.remainingQty != null ? cs.remainingQty : '—'}</span></span>
                        {cs.unitPrice != null && (
                          <span style={{ color: MUTED }}>批次价: <span style={{ color: GOLD }}>{cs.unitPrice} AED</span></span>
                        )}
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 4 }}>寄售批次价格 ≠ 产品主库标准售价</div>
                  </div>
                )}

                {/* Section D: 历史报价 */}
                <div style={{ padding: '10px 12px', background: CARD_BG, border: CARD_BDR, borderRadius: 9, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>历史报价 / QUOTATION HISTORY
                    <span style={{ marginLeft: 8, fontSize: 9, color: SUBTLE, fontWeight: 400 }}>来源：quotation_records（实际报价单价，非标准价）</span>
                  </div>
                  {!d.quotationHistory.found ? (
                    <div style={{ fontSize: 12, color: MUTED }}>
                      暂无历史报价记录。
                      {d.productMaster.found && (
                        <span style={{ color: SUBTLE }}> 可参考上方产品主库建议批发价。</span>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Price summary */}
                      {d.quotationHistory.priceSummary && (() => {
                        const ps = d.quotationHistory.priceSummary;
                        return (
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                            <div style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(203,168,92,0.08)', border: GOLD_BDR, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>最近报价</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>AED {Number(ps.latestPrice).toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '5px 10px', borderRadius: 6, background: CARD_BG, border: CARD_BDR, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>最低 / 最高</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                                {Number(ps.minPrice).toLocaleString()} – {Number(ps.maxPrice).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ padding: '5px 10px', borderRadius: 6, background: CARD_BG, border: CARD_BDR, textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>均价 / 次数</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                                {Number(ps.avgPrice).toLocaleString()} · {ps.quoteCount}次
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Individual rows */}
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {d.quotationHistory.items.slice(0, 20).map((it: any, i: number) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '3px 0', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ flex: '0 0 70px', color: MUTED, whiteSpace: 'nowrap' }}>
                              {it.quote_date ? it.quote_date.slice(0, 10) : '—'}
                            </span>
                            <span style={{ flex: 1, color: TEXT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {it.customer_name || '—'}
                            </span>
                            <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>×{it.qty} {it.unit}</span>
                            <span style={{ color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              AED {Number(it.selling_price).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Warnings */}
                {d.warnings && d.warnings.length > 0 && (
                  <div style={{ fontSize: 10, color: SUBTLE, padding: '6px 0' }}>
                    ⚠ {d.warnings.join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 10, color: SUBTLE, marginTop: 4 }}>
                  价格仅供参考，最终报价需人工确认 · {new Date(d.asOf).toLocaleString('zh-CN')}
                </div>
              </div>
            );
          })()}

          {/* ── Receivables result panel (v2 — three views) ── */}
          {intent.intentId === 'check_receivables' && state.resultData && state.resultData.ok && (() => {
            const d  = state.resultData;
            const OR = d.orderReceivables;
            const CR = d.consignmentReceivables;
            const IR = d.invoiceReceivables;
            const RD = '#E0846A';
            const GN = '#6FBF8E';
            const CARD_S = { padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', flex: '1 1 0', minWidth: 110 } as const;
            const SEC  = { padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 } as const;
            return (
              <div style={{ marginBottom: 12 }}>
                {/* Title */}
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, fontWeight: 600 }}>应收款总览 / Receivables Overview</div>

                {/* Three summary cards */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ ...CARD_S, background: OR ? 'rgba(224,132,106,0.07)' : CARD_S.background, border: OR ? '1px solid rgba(224,132,106,0.22)' : CARD_S.border }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 3, letterSpacing: '0.05em' }}>订单应收</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: RD }}>AED {OR ? Number(OR.total).toLocaleString() : '—'}</div>
                    {OR && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{OR.customerCount} 客户 · {OR.orderCount} 单{OR.overdueCount > 0 ? ` · ${OR.overdueCount} 逾期` : ''}</div>}
                    <div style={{ fontSize: 9, color: SUBTLE, marginTop: 3 }}>来源：orders</div>
                  </div>
                  <div style={CARD_S}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 3, letterSpacing: '0.05em' }}>寄售待结算货值</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: CR && CR.total > 0 ? GOLD : TEXT }}>AED {CR ? Number(CR.total).toLocaleString() : '—'}</div>
                    {CR && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{CR.customerCount} 客户 · {CR.soCount} SO</div>}
                    <div style={{ fontSize: 9, color: SUBTLE, marginTop: 3 }}>来源：consignment_stock</div>
                  </div>
                  <div style={CARD_S}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 3, letterSpacing: '0.05em' }}>发票应收</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: IR && IR.total > 0 ? '#5BA3C9' : TEXT }}>AED {IR ? Number(IR.total).toLocaleString() : '—'}</div>
                    {IR && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{IR.customerCount} 客户 · {IR.invoiceCount} 张{IR.overdueCount > 0 ? ` · ${IR.overdueCount} 逾期` : ''}</div>}
                    <div style={{ fontSize: 9, color: SUBTLE, marginTop: 3 }}>来源：invoice_drafts</div>
                  </div>
                </div>

                {/* Section A: 订单应收 */}
                <div style={SEC}>
                  <div style={{ fontSize: 11, color: RD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>订单应收 / ORDER RECEIVABLES</div>
                  {!OR ? (
                    <div style={{ fontSize: 12, color: MUTED }}>查询失败</div>
                  ) : OR.customerCount === 0 ? (
                    <div style={{ fontSize: 12, color: GN }}>✓ 暂无普通订单未收款。</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {OR.customers.map((c: any, i: number) => {
                        const hasOverdue = c.orders.some((o: any) => o.overdue);
                        return (
                          <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: hasOverdue ? 'rgba(224,132,106,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${hasOverdue ? 'rgba(224,132,106,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{c.customerName}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: RD, whiteSpace: 'nowrap' }}>AED {Number(c.totalOutstanding).toLocaleString()}</span>
                              {hasOverdue && <span style={{ fontSize: 9, color: RD, fontWeight: 700 }}>⚠ 逾期</span>}
                            </div>
                            <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                              {c.orderCount} 张订单 · 已收 AED {Number(c.totalPaid).toLocaleString()} / 总 AED {Number(c.totalGrandTotal).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {OR && <div style={{ fontSize: 9, color: SUBTLE, marginTop: 6 }}>{OR.note}</div>}
                </div>

                {/* Section B: 寄售待结算货值 */}
                <div style={SEC}>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>寄售待结算货值 / CONSIGNMENT PENDING</div>
                  {!CR ? (
                    <div style={{ fontSize: 12, color: MUTED }}>查询失败</div>
                  ) : CR.soCount === 0 ? (
                    <div style={{ fontSize: 12, color: GN }}>✓ 暂无未结算寄售记录。</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {CR.records.map((r: any, i: number) => (
                        <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{r.customerName}</span>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: r.settlementStatus === 'PARTIAL' ? 'rgba(203,168,92,0.12)' : 'rgba(224,132,106,0.08)', color: r.settlementStatus === 'PARTIAL' ? GOLD : RD }}>
                              {r.settlementZh}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap' }}>AED {Number(r.outstanding).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                            SO {r.soNo} · {r.productName} · 发货 {r.consignedQty} 件 · 含税单价 AED {Number(r.inclUnitPrice).toFixed(2)}
                            · 已售 {r.soldQty} 件 · 剩余 {r.remainingQty} 件
                            {r.receivedAmount > 0 ? ` · 已收 AED ${Number(r.receivedAmount).toLocaleString()}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {CR && <div style={{ fontSize: 9, color: SUBTLE, marginTop: 6 }}>{CR.note}</div>}
                  <div style={{ fontSize: 9, color: SUBTLE, marginTop: 4, fontStyle: 'italic' }}>
                    ℹ 该金额按寄售批次货值统计，与"已售数量应收"不同；如需查看已售数量，请进入寄售管理模块。
                  </div>
                </div>

                {/* Section C: 发票应收 */}
                <div style={SEC}>
                  <div style={{ fontSize: 11, color: '#5BA3C9', fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>发票应收 / INVOICE RECEIVABLES</div>
                  {!IR ? (
                    <div style={{ fontSize: 12, color: MUTED }}>查询失败</div>
                  ) : IR.invoiceCount === 0 ? (
                    <div style={{ fontSize: 12, color: GN }}>✓ 暂无 issued / approved 未收款发票。</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {IR.invoices.map((inv: any, i: number) => (
                        <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: inv.overdue ? 'rgba(224,132,106,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${inv.overdue ? 'rgba(224,132,106,0.18)' : 'rgba(255,255,255,0.05)'}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{inv.customerName}</span>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: inv.status === 'issued' ? 'rgba(91,163,201,0.12)' : 'rgba(111,191,142,0.1)', color: inv.status === 'issued' ? '#5BA3C9' : GN }}>
                              {inv.statusZh}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#5BA3C9', whiteSpace: 'nowrap' }}>AED {Number(inv.total).toLocaleString()}</span>
                            {inv.overdue && <span style={{ fontSize: 9, color: RD, fontWeight: 700 }}>⚠ 逾期</span>}
                          </div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                            {inv.invoiceNo}{inv.dueDate ? ` · 到期 ${inv.dueDate.slice(0, 10)}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {IR && IR.pendingApprovalCount > 0 && (
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 6, padding: '4px 6px', background: 'rgba(212,168,67,0.06)', borderRadius: 5 }}>
                      另有 {IR.pendingApprovalCount} 张待审批发票（AED {Number(IR.pendingApprovalAmount).toLocaleString()}），不计入正式应收。
                    </div>
                  )}
                  {IR && <div style={{ fontSize: 9, color: SUBTLE, marginTop: 4 }}>{IR.note}</div>}
                </div>

                {/* Overlap warning */}
                <div style={{ fontSize: 10, color: SUBTLE, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, marginBottom: 4 }}>
                  ⚠ 三个口径来源不同，可能存在重叠，仅作经营提醒，不作为财务最终对账依据。
                </div>
                <div style={{ fontSize: 10, color: SUBTLE }}>
                  {new Date(d.asOf).toLocaleString('zh-CN')}
                </div>
              </div>
            );
          })()}

          {/* ── Receivables loading ── */}
          {intent.intentId === 'check_receivables' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在查询订单 / 寄售 / 发票应收…</div>
          )}

          {/* ── Receivables API error ── */}
          {intent.intentId === 'check_receivables' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>应收 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
              {state.resultData.detail && (
                <div style={{ color: SUBTLE, fontSize: 11, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {typeof state.resultData.detail === 'string' ? state.resultData.detail : JSON.stringify(state.resultData.detail)}
                </div>
              )}
            </div>
          )}

          {/* ── Consignment result panel ── */}
          {intent.intentId === 'check_consignment' && state.resultData && state.resultData.ok && (
            <div style={{ marginBottom: 12 }}>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {state.resultData.unsettledCount > 0 && (
                  <div style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.2)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>未结算</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E0846A' }}>{state.resultData.unsettledCount} 条</div>
                  </div>
                )}
                {state.resultData.partialCount > 0 && (
                  <div style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>部分结算</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#D4A843' }}>{state.resultData.partialCount} 条</div>
                  </div>
                )}
                <div style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>剩余库存</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{state.resultData.totalRemaining} 件</div>
                </div>
                <div style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>已售数量</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#6FBF8E' }}>{state.resultData.totalSold} 件</div>
                </div>
              </div>
              {state.resultData.total === 0 ? (
                <div style={{ fontSize: 13, color: '#6FBF8E', padding: '10px 0' }}>✓ 暂无寄售记录。</div>
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {state.resultData.records.map((r: any, i: number) => (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: r.settlementStatus === 'UNSETTLED' ? 'rgba(224,132,106,0.05)' : r.settlementStatus === 'PARTIAL' ? 'rgba(212,168,67,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${r.settlementStatus === 'UNSETTLED' ? 'rgba(224,132,106,0.2)' : r.settlementStatus === 'PARTIAL' ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{r.customerName}</span>
                        <span style={{ fontSize: 11, color: MUTED }}>{r.productName}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: r.settlementStatus === 'UNSETTLED' ? 'rgba(224,132,106,0.12)' : r.settlementStatus === 'PARTIAL' ? 'rgba(212,168,67,0.12)' : 'rgba(111,191,142,0.12)', color: r.settlementStatus === 'UNSETTLED' ? '#E0846A' : r.settlementStatus === 'PARTIAL' ? '#D4A843' : '#6FBF8E' }}>
                          {r.settlementZh}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 3, display: 'flex', gap: 10 }}>
                        <span>寄售 {r.consignedQty}</span>
                        <span>已售 {r.soldQty}</span>
                        <span style={{ color: r.remainingQty > 0 ? GOLD : MUTED }}>剩余 {r.remainingQty}</span>
                        {r.soNo !== '—' && <span>SO: {r.soNo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                数据来源：consignment_stock · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* ── Consignment loading ── */}
          {intent.intentId === 'check_consignment' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在查询寄售情况…</div>
          )}

          {/* ── Consignment API error ── */}
          {intent.intentId === 'check_consignment' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>寄售 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Sales result panel ── */}
          {intent.intentId === 'check_sales' && state.resultData && state.resultData.ok && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                {state.resultData.periodZh}销售 · {state.resultData.orderCount} 张订单
              </div>
              {/* KPI bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(111,191,142,0.08)', border: '1px solid rgba(111,191,142,0.2)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>总销售额</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6FBF8E' }}>
                    AED {Number(state.resultData.totalGrandTotal).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(203,168,92,0.08)', border: '1px solid rgba(203,168,92,0.2)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>已收款</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>
                    AED {Number(state.resultData.totalPaid).toLocaleString()}
                  </div>
                </div>
                {state.resultData.totalOutstanding > 0 && (
                  <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.2)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>未收</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#E0846A' }}>
                      AED {Number(state.resultData.totalOutstanding).toLocaleString()}
                    </div>
                  </div>
                )}
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 1 }}>回款率</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{state.resultData.collectionRate}%</div>
                </div>
              </div>
              {/* Top customers */}
              {state.resultData.orderCount === 0 ? (
                <div style={{ fontSize: 13, color: MUTED, padding: '10px 0' }}>
                  {state.resultData.periodZh}暂无成交订单。
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>成交客户（按金额排序）</div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {state.resultData.topCustomers.map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: 11, color: SUBTLE, minWidth: 16, textAlign: 'right' }}>#{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{c.customerName}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#6FBF8E' }}>
                          AED {Number(c.grandTotal).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, color: MUTED }}>{c.orderCount} 单</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                数据来源：orders · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* ── Sales loading ── */}
          {intent.intentId === 'check_sales' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在统计销售数据…</div>
          )}

          {/* ── Sales API error ── */}
          {intent.intentId === 'check_sales' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>销售 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Daily brief result panel ── */}
          {intent.intentId === 'generate_daily_brief' && state.resultData && state.resultData.ok && (() => {
            const d = state.resultData;
            return (
              <div style={{ marginBottom: 12 }}>
                {/* Date + summary */}
                <div style={{ fontSize: 11, color: SUBTLE, marginBottom: 6 }}>{d.date}</div>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 14, padding: '10px 14px', background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.15)', borderRadius: 8, lineHeight: 1.7 }}>
                  {d.summary}
                </div>

                {/* Priorities */}
                {d.priorities.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GOLD, marginBottom: 6, letterSpacing: '0.06em' }}>TODAY'S PRIORITIES</div>
                    {d.priorities.map((p: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: GOLD, fontSize: 12, flexShrink: 0, marginTop: 1 }}>→</span>
                        <span style={{ fontSize: 13, color: TEXT }}>{p}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risks */}
                {d.risks.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#E0846A', marginBottom: 6, letterSpacing: '0.06em' }}>RISK ALERTS</div>
                    {d.risks.map((r: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: '#E0846A', fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠</span>
                        <span style={{ fontSize: 13, color: TEXT }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* KPI grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.15)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>本月销售额</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#6FBF8E' }}>AED {Number(d.sales.monthlyTotal).toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>{d.sales.monthlyCount} 张订单 · 今日 AED {Number(d.sales.todayTotal).toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.15)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>待收款合计</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E0846A' }}>AED {Number(d.receivables.totalOutstanding).toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>{d.receivables.unpaidOrderCount} 张订单</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.15)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>待回复报价</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{d.quotations.pendingCount} 张</div>
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>{d.quotations.overdueCount > 0 ? `其中 ${d.quotations.overdueCount} 张已超期` : '无超期'}</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(143,166,212,0.06)', border: '1px solid rgba(143,166,212,0.15)' }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>寄售待结算</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#8FA6D4' }}>{d.consignment.unsettledCount} 条</div>
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 2 }}>剩余库存 {d.consignment.totalRemaining} 件</div>
                  </div>
                </div>

                {/* Top receivables */}
                {d.receivables.topCustomers.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 5 }}>欠款最多客户</div>
                    {d.receivables.topCustomers.map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 12, color: TEXT }}>{c.customerName}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#E0846A' }}>AED {Number(c.outstanding).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>数据来源：{d.source}</span>
                  <span>{new Date(d.asOf).toLocaleString('zh-CN')}</span>
                </div>
                {/* CRM section — read from localStorage (Notion sync cache) */}
                {(() => {
                  const crmStats = getCRMBriefStats(readCRMTasks());
                  if (!crmStats.hasData) {
                    return (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(143,166,212,0.06)', border: '1px solid rgba(143,166,212,0.2)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#8FA6D4', marginBottom: 2 }}>CRM 跟进数据暂未加载</div>
                          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                            请先前往 <span style={{ color: '#8FA6D4' }}>CRM 模块</span> 同步 Notion 数据，之后简报将自动合并跟进记录。
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const PRIO_COLOR: Record<string, string> = { A: '#E0846A', B: '#D4A843', C: MUTED };
                  return (
                    <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(91,163,201,0.06)', border: '1px solid rgba(91,163,201,0.22)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#5BA3C9' }}>CRM 跟进（已从本地 Notion Sync 合并）</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(91,163,201,0.12)', color: '#5BA3C9', fontFamily: 'monospace' }}>localStorage</span>
                      </div>
                      {/* Stats chips */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(91,163,201,0.08)', border: '1px solid rgba(91,163,201,0.18)' }}>
                          <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>今日应跟进</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#5BA3C9' }}>{crmStats.todayCount} 个</div>
                        </div>
                        {crmStats.overdueCount > 0 && (
                          <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.2)' }}>
                            <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>已超期</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0846A' }}>{crmStats.overdueCount} 个</div>
                          </div>
                        )}
                        {crmStats.highPriorityCount > 0 && (
                          <div style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.15)' }}>
                            <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>A 级客户</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0846A' }}>{crmStats.highPriorityCount} 个</div>
                          </div>
                        )}
                      </div>
                      {/* Top follow-up items */}
                      {crmStats.topItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {crmStats.topItems.map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: item.isOverdue ? 'rgba(224,132,106,0.07)' : 'rgba(255,255,255,0.025)', border: `1px solid ${item.isOverdue ? 'rgba(224,132,106,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: PRIO_COLOR[item.priority] || MUTED, minWidth: 12 }}>{item.priority}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.clientName}</span>
                              <span style={{ fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>{item.tradeStatus}</span>
                              {item.owner && <span style={{ fontSize: 10, color: SUBTLE, whiteSpace: 'nowrap' }}>{item.owner}</span>}
                              {item.isOverdue && <span style={{ fontSize: 9, color: '#E0846A', fontWeight: 700, whiteSpace: 'nowrap' }}>超期 {item.daysOverdue}天</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── Daily brief loading ── */}
          {intent.intentId === 'generate_daily_brief' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在并行查询业务数据，生成简报中…</div>
          )}

          {/* ── Daily brief API error ── */}
          {intent.intentId === 'generate_daily_brief' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>简报生成失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Customer 360 result panel ── */}
          {intent.intentId === 'customer_overview' && state.resultData && state.resultData.ok && (() => {
            const d = state.resultData;
            const s = d.summary;
            return (
              <div style={{ marginBottom: 12 }}>
                {/* Match warning */}
                <div style={{ fontSize: 10, color: SUBTLE, marginBottom: 8, padding: '5px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                  ⚠ {d.matchWarning}
                </div>

                {/* Customer header */}
                <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 10 }}>
                  {d.customerQuery}
                </div>

                {/* KPI grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
                  {[
                    { label: '历史报价', value: `${s.quoteCount} 张`, sub: `AED ${Number(s.totalQuoteAmt).toLocaleString()}`, color: GOLD },
                    { label: '待回复', value: `${s.pendingQuoteCount} 张`, sub: '未回复报价', color: s.pendingQuoteCount > 0 ? '#D4A843' : MUTED },
                    { label: '订单记录', value: `${s.orderCount} 张`, sub: `AED ${Number(s.totalOrderAmt).toLocaleString()}`, color: TEXT },
                    { label: '未收款', value: `AED ${Number(s.totalOutstanding).toLocaleString()}`, sub: '', color: s.totalOutstanding > 0 ? '#E0846A' : '#6FBF8E' },
                    { label: '寄售记录', value: `${s.consignmentCount} 条`, sub: `${s.unsettledCount} 未结算`, color: '#8FA6D4' },
                    { label: '发票', value: `${s.invoiceCount} 张`, sub: '', color: TEXT },
                  ].map((k, i) => (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{k.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: k.color }}>{k.value}</div>
                      {k.sub && <div style={{ fontSize: 10, color: SUBTLE }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                {d.suggestions.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GOLD, marginBottom: 5, letterSpacing: '0.06em' }}>建议下一步</div>
                    {d.suggestions.map((sg: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 7, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, color: TEXT }}>
                        <span style={{ color: GOLD, flexShrink: 0 }}>→</span>{sg}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent quotes */}
                {d.quotes.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 5 }}>历史报价（最近 {Math.min(d.quotes.length, 5)} 条）</div>
                    {d.quotes.slice(0, 5).map((q: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 11, color: SUBTLE, minWidth: 80 }}>{q.quoteNo}</span>
                        <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>{q.projectName || '—'}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: GOLD }}>AED {Number(q.grandTotal).toLocaleString()}</span>
                        <span style={{ fontSize: 10, color: q.status === 'GENERATED' ? '#D4A843' : q.status === 'SENT_TO_TRADE' ? '#6FBF8E' : SUBTLE }}>{q.statusZh}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                  数据来源：{d.source} · {new Date(d.asOf).toLocaleString('zh-CN')}
                </div>
                {/* Alias info — show if multiple aliases were used */}
                {d.aliasesUsed && (
                  <div style={{ fontSize: 10, color: SUBTLE, marginTop: 6, padding: '5px 8px', background: 'rgba(203,168,92,0.04)', border: '1px solid rgba(203,168,92,0.12)', borderRadius: 6 }}>
                    🔗 别名搜索已启用：{d.aliases?.join(' / ')}
                  </div>
                )}

                {/* CRM section — read from localStorage and match by customer + aliases */}
                {(() => {
                  const allTasks = readCRMTasks();
                  const crmMatch = getCRMCustomerData(allTasks, d.customerQuery, d.aliases || []);
                  if (!crmMatch.hasData) {
                    return (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(143,166,212,0.06)', border: '1px solid rgba(143,166,212,0.2)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#8FA6D4', marginBottom: 2 }}>CRM 数据暂未加载</div>
                          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                            请先前往 <span style={{ color: '#8FA6D4' }}>CRM 模块</span> 同步 Notion 数据后查看。
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (crmMatch.totalCount === 0) {
                    return (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(143,166,212,0.04)', border: '1px solid rgba(143,166,212,0.15)', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: MUTED }}>
                          未在 CRM 跟进记录中找到「{d.customerQuery}」。如有拼写不同，请手动前往 CRM 模块搜索。
                        </div>
                      </div>
                    );
                  }
                  const latest = crmMatch.latestTask!;
                  const PRIO_COLOR: Record<string, string> = { A: '#E0846A', B: '#D4A843', C: MUTED };
                  return (
                    <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(91,163,201,0.06)', border: '1px solid rgba(91,163,201,0.22)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#5BA3C9' }}>CRM 跟进（本地 Notion Sync）</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(91,163,201,0.12)', color: '#5BA3C9', fontFamily: 'monospace' }}>
                          {crmMatch.totalCount} 条记录 · {crmMatch.activeCount} 活跃
                        </span>
                      </div>
                      {/* Latest record */}
                      <div style={{ padding: '8px 10px', borderRadius: 7, background: latest.isOverdue ? 'rgba(224,132,106,0.07)' : 'rgba(255,255,255,0.025)', border: `1px solid ${latest.isOverdue ? 'rgba(224,132,106,0.2)' : 'rgba(255,255,255,0.07)'}`, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: PRIO_COLOR[latest.priority] || MUTED }}>{latest.priority}级</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1 }}>{latest.clientName}</span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(91,163,201,0.1)', color: '#5BA3C9' }}>{latest.tradeStatus}</span>
                          {latest.isOverdue && <span style={{ fontSize: 9, color: '#E0846A', fontWeight: 700 }}>超期 {latest.daysOverdue}天</span>}
                        </div>
                        {latest.goal && <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>目标：{latest.goal}</div>}
                        {latest.lastContext && <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>上次：{latest.lastContext}</div>}
                        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: SUBTLE }}>
                          {latest.nextFollowUpAt && <span>下次跟进：{latest.nextFollowUpAt.slice(0, 10)}</span>}
                          {latest.owner && <span>负责人：{latest.owner}</span>}
                        </div>
                      </div>
                      {/* Older records summary */}
                      {crmMatch.matchedTasks.length > 1 && (
                        <div style={{ fontSize: 10, color: SUBTLE }}>
                          另有 {crmMatch.matchedTasks.length - 1} 条历史记录 · 状态：{[...new Set(crmMatch.matchedTasks.slice(1).map(t => t.tradeStatus))].join(' / ')}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── Customer 360 loading ── */}
          {intent.intentId === 'customer_overview' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在跨表查询客户数据…</div>
          )}

          {/* ── Customer 360 API error ── */}
          {intent.intentId === 'customer_overview' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>客户总览查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
            </div>
          )}

          {/* ── Update follow-up status panel ── */}
          {intent.intentId === 'update_followup_status' && state.resultData && (() => {
            const d = state.resultData;
            if (d.notFound) {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>未找到客户</div>
                  <div style={{ fontSize: 12, color: MUTED }}>在 CRM 本地记录中未找到「{d.customerName}」，请检查拼写或先前往 CRM 模块同步 Notion 数据。</div>
                </div>
              );
            }
            if (!d.newStatus) {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>无法识别目标状态</div>
                  <div style={{ fontSize: 12, color: MUTED }}>请在指令中指定目标状态，例如：「把 KHALED 更新到合同待签」</div>
                </div>
              );
            }
            if (writePhase === 'done' && writeResult) {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(111,191,142,0.07)', border: '1px solid rgba(111,191,142,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6FBF8E', fontWeight: 600, marginBottom: 4 }}>✓ 状态已更新</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{d.customerName} → {d.newStatus}（已写回 Notion）</div>
                </div>
              );
            }
            if (writePhase === 'error') {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>写回失败</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{writeError || '未知错误，请前往 CRM 手动更新。'}</div>
                </div>
              );
            }
            // confirm phase
            const task = d.matchedTask;
            const CLOSED_ON_WRITE = ['暂缓', '已归档', '已成交', '已关闭'];
            const willArchive = CLOSED_ON_WRITE.includes(d.newStatus);
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{d.customerName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: task ? 6 : 0 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: MUTED }}>{d.currentStatus || '未知'}</span>
                    <span style={{ color: SUBTLE }}>→</span>
                    <span style={{ padding: '2px 8px', borderRadius: 5, background: willArchive ? 'rgba(224,132,106,0.12)' : 'rgba(111,191,142,0.12)', color: willArchive ? '#E0846A' : '#6FBF8E', fontWeight: 700 }}>{d.newStatus}</span>
                  </div>
                  {willArchive && (
                    <div style={{ fontSize: 10, color: '#E0846A', marginTop: 4 }}>⚠ 此状态会将客户标记为归档，从跟进列表中移除。</div>
                  )}
                  {d.newStatus === '合同待签' && (
                    <div style={{ fontSize: 10, color: '#6FBF8E', marginTop: 4 }}>✓ 合同待签 = 活跃跟进，不会归档。</div>
                  )}
                  {task && (
                    <div style={{ fontSize: 10, color: SUBTLE, marginTop: 4 }}>
                      Notion 页面：{task.leadId ? task.leadId.slice(0, 8) + '…' : '未知'}
                      {task.owner && ` · 负责人：${task.owner}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={writePhase === 'sending'}
                    onClick={() => {
                      if (!task?.leadId) {
                        setWritePhase('error');
                        setWriteError('该客户无有效 Notion pageId，无法写回。请前往 CRM 模块手动更新。');
                        return;
                      }
                      setWritePhase('sending');
                      const base = typeof window !== 'undefined' ? window.location.origin : '';
                      fetch(`${base}/api/crm/notion-update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pageId: task.leadId, action: 'update_status', tradeStatus: d.newStatus }),
                      })
                        .then(r => r.json())
                        .then(res => {
                          if (res.ok) { setWritePhase('done'); setWriteResult(res); }
                          else { setWritePhase('error'); setWriteError(res.error || '写回失败'); }
                        })
                        .catch(e => { setWritePhase('error'); setWriteError(String(e)); });
                    }}
                    style={{ flex: 1, padding: '10px', borderRadius: 9, background: writePhase === 'sending' ? 'rgba(111,191,142,0.2)' : `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: writePhase === 'sending' ? '#6FBF8E' : NAVY, fontSize: 14, fontWeight: 700, cursor: writePhase === 'sending' ? 'not-allowed' : 'pointer' }}
                  >
                    {writePhase === 'sending' ? '写回中…' : '确认更新'}
                  </button>
                  <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>取消</button>
                </div>
              </div>
            );
          })()}

          {/* ── Update status loading ── */}
          {intent.intentId === 'update_followup_status' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在查找客户记录…</div>
          )}

          {/* ── Create customer panel ── */}
          {intent.intentId === 'create_customer_from_ai' && state.resultData && (() => {
            const d = state.resultData;
            const draft = d.draft;
            if (!draft.clientName) {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>未能解析客户姓名</div>
                  <div style={{ fontSize: 12, color: MUTED }}>请使用格式：「新增客户：姓名，联系方式，简要需求」</div>
                </div>
              );
            }
            if (writePhase === 'done' && writeResult) {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(111,191,142,0.07)', border: '1px solid rgba(111,191,142,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#6FBF8E', fontWeight: 600, marginBottom: 6 }}>✓ 客户已创建</div>
                  {writeResult.sbNumber && (
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>SB 编号：<span style={{ color: GOLD, fontWeight: 700 }}>{writeResult.sbNumber}</span></div>
                  )}
                  <div style={{ fontSize: 12, color: MUTED }}>已写入 Notion {draft.businessType === 'TRADE' ? 'SB Pool + Follow-up Log' : 'Follow-up Log'}</div>
                </div>
              );
            }
            if (writePhase === 'error') {
              return (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>创建失败</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{writeError || '未知错误，请前往 CRM 模块手动录入。'}</div>
                </div>
              );
            }
            const typeColor = draft.businessType === 'PROJECT' ? '#8FA6D4' : GOLD;
            return (
              <div style={{ marginBottom: 12 }}>
                {d.dupCheck?.hasDup && (
                  <div style={{ padding: '8px 12px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8, marginBottom: 8, fontSize: 12, color: '#E0846A' }}>
                    ⚠ CRM 中已有近似记录「{d.dupCheck.dupName}」，请确认是否为新客户。
                  </div>
                )}
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{draft.clientName}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: `${typeColor}22`, color: typeColor, fontWeight: 700 }}>{draft.businessType}</span>
                  </div>
                  {[
                    draft.city && ['城市', draft.city],
                    draft.phone && ['电话', draft.phone],
                    draft.whatsapp && ['WhatsApp', draft.whatsapp],
                    draft.email && ['Email', draft.email],
                    draft.lastContext && ['需求备注', draft.lastContext],
                    ['负责人', draft.owner],
                    ['下次跟进', draft.nextFollowUpAt],
                    ['初始状态', '新询盘'],
                  ].filter(Boolean).map(([label, value]: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                      <span style={{ color: SUBTLE, minWidth: 70 }}>{label}</span>
                      <span style={{ color: TEXT }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: SUBTLE, marginBottom: 8 }}>
                  写入目标：Notion {draft.businessType === 'TRADE' ? 'SB Pool + Follow-up Log' : 'Follow-up Log'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={writePhase === 'sending'}
                    onClick={() => {
                      setWritePhase('sending');
                      const base = typeof window !== 'undefined' ? window.location.origin : '';
                      const endpoint = draft.businessType === 'TRADE' ? '/api/crm/notion-write-lead' : '/api/crm/notion-create';
                      const payload = draft.businessType === 'TRADE'
                        ? { clientName: draft.clientName, phone: draft.phone, whatsapp: draft.whatsapp, email: draft.email, countryCity: draft.city, lastContext: draft.lastContext, owner: draft.owner, nextFollowUpAt: draft.nextFollowUpAt, source: 'AI录入' }
                        : { clientName: draft.clientName, followUpNotes: draft.lastContext, followUpMethod: 'WhatsApp', nextFollowUpAt: draft.nextFollowUpAt, owner: draft.owner, source: 'AI录入' };
                      fetch(`${base}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      })
                        .then(r => r.json())
                        .then(res => {
                          if (res.ok || res.sbNumber || res.pageId) { setWritePhase('done'); setWriteResult(res); }
                          else { setWritePhase('error'); setWriteError(res.error || '创建失败'); }
                        })
                        .catch(e => { setWritePhase('error'); setWriteError(String(e)); });
                    }}
                    style={{ flex: 1, padding: '10px', borderRadius: 9, background: writePhase === 'sending' ? 'rgba(111,191,142,0.2)' : `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: writePhase === 'sending' ? '#6FBF8E' : NAVY, fontSize: 14, fontWeight: 700, cursor: writePhase === 'sending' ? 'not-allowed' : 'pointer' }}
                  >
                    {writePhase === 'sending' ? '创建中…' : '确认创建客户'}
                  </button>
                  <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>取消</button>
                </div>
              </div>
            );
          })()}

          {/* ── Create customer loading ── */}
          {intent.intentId === 'create_customer_from_ai' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在解析客户信息…</div>
          )}

          {/* ── Register existing quotation panel ── */}
          {intent.intentId === 'register_existing_quotation' && state.resultData?.draft && (() => {
            const draft = state.resultData.draft;
            const base = typeof window !== 'undefined' ? window.location.origin : '';

            const fieldRow = (label: string, value: string | number | null, highlight?: boolean) => (
              <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: SUBTLE, width: 90, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: highlight ? GOLD : TEXT, fontWeight: highlight ? 700 : 500 }}>
                  {value !== null && value !== '' ? String(value) : <span style={{ color: SUBTLE, fontStyle: 'italic' }}>未识别</span>}
                </span>
              </div>
            );

            const doSave = () => {
              setRegPhase('saving');
              fetch(`${base}/api/ai/register-quotation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  quote_no: draft.quoteNo,
                  customer_name: draft.customerName,
                  project_name: draft.itemSummary,
                  grand_total: draft.grandTotal,
                  status: 'GENERATED',
                  quote_date: draft.quoteDate,
                  salesperson: draft.salesperson,
                  quote_type: draft.quoteType,
                  phone_wa: draft.phoneWa,
                }),
              })
                .then(r => r.json())
                .then(res => {
                  if (res.ok) { setRegSaved(res); setRegPhase('saved'); }
                  else { setRegPhase('error'); setRegError(res.error || '保存失败'); }
                })
                .catch(e => { setRegPhase('error'); setRegError(String(e)); });
            };

            const doCheck = () => {
              setRegPhase('checking');
              fetch(`${base}/api/ai/register-quotation?check=1&customer=${encodeURIComponent(draft.customerName)}&total=${draft.grandTotal || 0}&date=${draft.quoteDate}`)
                .then(r => r.json())
                .then(res => {
                  if (res.duplicates && res.duplicates.length > 0) {
                    setRegDups(res.duplicates);
                    setRegPhase('dupWarn');
                  } else {
                    doSave();
                  }
                })
                .catch(() => doSave()); // fail-open: skip check, proceed to save
            };

            const doFollowUp = () => {
              setRegFollowUp('saving');
              // Find the customer in CRM localStorage
              const tasks = (() => { try { return JSON.parse(localStorage.getItem('ICARE_HISTORY_V1') || '[]'); } catch { return []; } })();
              const nameLower = (draft.customerName || '').toLowerCase();
              const task = tasks.find((t: any) => {
                const tl = (t.clientName || '').toLowerCase();
                return tl.includes(nameLower) || nameLower.includes(tl);
              });
              if (!task?.leadId) {
                setRegFollowUp('error');
                return;
              }
              fetch(`${base}/api/crm/notion-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'update_status',
                  leadId: task.leadId,
                  tradeStatus: '已报价待确认',
                }),
              })
                .then(r => r.json())
                .then(res => setRegFollowUp(res.ok !== false ? 'done' : 'error'))
                .catch(() => setRegFollowUp('error'));
            };

            return (
              <div style={{ marginBottom: 12 }}>
                {/* ── Draft card ── */}
                {(regPhase === 'draft' || regPhase === 'checking' || regPhase === 'dupWarn') && (
                  <div style={{ marginBottom: 12, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10 }}>报价草稿</div>
                    {fieldRow('客户', draft.customerName, true)}
                    {fieldRow('产品/项目', draft.itemSummary)}
                    {fieldRow('金额', draft.grandTotal !== null ? `AED ${Number(draft.grandTotal).toLocaleString()}` : null, true)}
                    {fieldRow('报价日期', draft.quoteDate)}
                    {fieldRow('报价编号', draft.quoteNo)}
                    {fieldRow('类型', draft.quoteType)}
                    {fieldRow('来源', draft.source)}
                    {fieldRow('负责人', draft.salesperson)}
                    {draft.notes && fieldRow('备注', draft.notes)}
                  </div>
                )}

                {/* Draft: action buttons */}
                {regPhase === 'draft' && (
                  <>
                    {(!draft.customerName || draft.grandTotal === null) && (
                      <div style={{ fontSize: 11, color: '#D4A843', marginBottom: 8, padding: '6px 10px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 7 }}>
                        ⚠️ {!draft.customerName ? '未识别客户名称' : '未识别金额'}，请在确认前检查。
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={doCheck}
                        style={{ flex: 1, padding: '10px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                      >
                        确认保存
                      </button>
                      <button
                        onClick={() => setCmdState(null)}
                        style={{ padding: '10px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
                      >
                        取消
                      </button>
                    </div>
                  </>
                )}

                {/* Checking */}
                {regPhase === 'checking' && (
                  <div style={{ fontSize: 13, color: MUTED }}>正在检查重复记录…</div>
                )}

                {/* Dup warning */}
                {regPhase === 'dupWarn' && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: '#D4A843', fontWeight: 600, marginBottom: 8 }}>⚠️ 可能已有相似报价记录</div>
                    {regDups.slice(0, 3).map((d: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: MUTED, padding: '5px 10px', marginBottom: 4, background: 'rgba(212,168,67,0.06)', borderRadius: 7, border: '1px solid rgba(212,168,67,0.18)' }}>
                        {d.quote_no} · {d.customer_name} · AED {Number(d.grand_total).toLocaleString()} · {d.quote_date}
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={doSave} style={{ flex: 1, padding: '9px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        仍然保存
                      </button>
                      <button onClick={() => setCmdState(null)} style={{ padding: '9px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* Saving */}
                {regPhase === 'saving' && (
                  <div style={{ fontSize: 13, color: MUTED }}>正在写入报价记录…</div>
                )}

                {/* Saved success */}
                {regPhase === 'saved' && regSaved && (
                  <div>
                    <div style={{ padding: '12px 14px', background: 'rgba(111,191,142,0.07)', border: '1px solid rgba(111,191,142,0.25)', borderRadius: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 13, color: '#6FBF8E', fontWeight: 600, marginBottom: 4 }}>✅ 报价记录已保存</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{regSaved.quote_no} · {regSaved.customer_name} · AED {Number(regSaved.grand_total).toLocaleString()}</div>
                    </div>

                    {/* Follow-up prompt */}
                    {regFollowUp === 'idle' && (
                      <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>是否同时更新跟进状态为「已报价待确认」？</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={doFollowUp} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(203,168,92,0.15)', border: `1px solid ${GOLD}`, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            同步跟进状态
                          </button>
                          <button onClick={() => setRegFollowUp('done')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
                            跳过
                          </button>
                        </div>
                      </div>
                    )}
                    {regFollowUp === 'saving' && (
                      <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>正在更新跟进状态…</div>
                    )}
                    {regFollowUp === 'done' && (
                      <div style={{ fontSize: 12, color: '#6FBF8E', padding: '8px 10px', borderRadius: 7, background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.2)' }}>
                        ✅ 跟进状态已更新为「已报价待确认」
                      </div>
                    )}
                    {regFollowUp === 'error' && (
                      <div style={{ fontSize: 12, color: '#D4A843', padding: '8px 10px', borderRadius: 7, background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)' }}>
                        ⚠️ 未在跟进列表找到该客户，请前往 CRM 手动更新状态。
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {regPhase === 'error' && (
                  <div style={{ padding: '12px 14px', background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.25)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>保存失败</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{regError || '未知错误，请稍后重试。'}</div>
                  </div>
                )}

                {/* Field gap notice */}
                <div style={{ fontSize: 10, color: SUBTLE, marginTop: 10 }}>
                  ℹ️ quotation_records 暂无 source / notes 字段，来源和备注仅显示在草稿，不写入数据库。
                </div>
              </div>
            );
          })()}

          {/* ── Default: show intent name for non-result done states ── */}
          {intent.intentId !== 'check_inventory' && intent.intentId !== 'check_quotation_followups' && intent.intentId !== 'check_quotation_history' && intent.intentId !== 'check_receivables' && intent.intentId !== 'check_consignment' && intent.intentId !== 'check_sales' && intent.intentId !== 'generate_daily_brief' && intent.intentId !== 'customer_overview' && intent.intentId !== 'update_followup_status' && intent.intentId !== 'create_customer_from_ai' && intent.intentId !== 'register_existing_quotation' && (
            <div style={{ fontSize: 14, color: TEXT, marginBottom: intent.approvalRequired ? 14 : 0 }}>
              {intent.intentNameZh}{intent.approvalRequired ? dict.ai.panel.readyLabel : ''}
            </div>
          )}

          {intent.approvalRequired && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onApprove} style={{ flex: 1, padding: '11px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
                {dict.ai.panel.confirm}
              </button>
              <button onClick={onEdit} style={{ padding: '11px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: TEXT, fontSize: 14, cursor: 'pointer' }}>
                {dict.ai.panel.edit}
              </button>
              <button onClick={onCancel} style={{ padding: '11px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
                {dict.ai.panel.cancel}
              </button>
            </div>
          )}
          {!intent.approvalRequired && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
                {dict.ai.panel.close}
              </button>
              <span style={{ fontSize: 12, color: SUBTLE }}>— 或在顶部输入框继续追问</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: GOLD, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.3),transparent)' }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.soon;
  return (
    <span className="font-mono-label" style={{ fontSize: 9, letterSpacing: '0.14em', color: s.color, background: s.bg, borderRadius: 4, padding: '2px 7px' }}>
      {s.label}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', ...style }}>
      {children}
    </div>
  );
}

function ActionChip({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: '8px 16px', borderRadius: 20, background: hover ? 'rgba(203,168,92,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${hover ? 'rgba(203,168,92,0.45)' : 'rgba(255,255,255,0.12)'}`, color: hover ? GOLD_L : MUTED, fontSize: 13, cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap' }}
    >{label}</button>
  );
}

// ── useProcessor: runs a mock step-by-step animation ─────────────────────────
function useStepRunner() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function run(steps: string[], onStep: (i: number) => void, onDone: () => void) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const delays = steps.map(() => Math.floor(Math.random() * 300 + 500));
    let acc = 0;
    steps.forEach((_, i) => {
      const t = setTimeout(() => {
        onStep(i);
        if (i === steps.length - 1) setTimeout(onDone, 200);
      }, acc);
      timers.current.push(t);
      acc += delays[i];
    });
  }

  function clear() { timers.current.forEach(clearTimeout); timers.current = []; }
  useEffect(() => () => clear(), []);
  return { run, clear };
}

// ── TAB 1: AI Chat ─────────────────────────────────────────────────────────────
function AIChatTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const { dict } = useI18n();
  const [followUp, setFollowUp] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);

  function submit(v: string) {
    if (!v.trim()) return;
    onSubmit(v);
    setFollowUp('');
    setShowFollowUp(false);
  }

  return (
    <div>
      {/* Hint: top Ask GCI is the primary input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.15)', borderRadius: 10 }}>
        <span style={{ fontSize: 18 }}>⬆</span>
        <span style={{ fontSize: 13, color: MUTED }}>
          使用上方 <strong style={{ color: GOLD_L }}>Ask GCI</strong> 输入框发送任意指令。AI 自动识别意图并路由到正确功能。
        </span>
      </div>

      {/* Quick questions */}
      <SectionLabel text={dict.ai.chat.quickLabel} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {dict.ai.chat.suggestions.map(s => (
          <ActionChip key={s} label={s} onClick={() => submit(s)} />
        ))}
      </div>

      {/* Follow-up input — compact, secondary */}
      {!showFollowUp ? (
        <button
          onClick={() => setShowFollowUp(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: SUBTLE, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
        >
          <span style={{ fontSize: 14 }}>✎</span> 继续追问…
        </button>
      ) : (
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <input
            autoFocus
            value={followUp}
            onChange={e => setFollowUp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(followUp); if (e.key === 'Escape') setShowFollowUp(false); }}
            placeholder="继续追问 GCI…"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(203,168,92,0.3)', borderRadius: 10, padding: '11px 48px 11px 14px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.55)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(203,168,92,0.3)')}
          />
          <button onClick={() => submit(followUp)} disabled={!followUp.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: 8, background: followUp.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: followUp.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
      )}
    </div>
  );
}

// ── TAB 2: AI Assistant ────────────────────────────────────────────────────────
function AIAssistantTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const { dict } = useI18n();
  const [cmd, setCmd] = useState('');

  return (
    <div>
      <SectionLabel text={dict.ai.assistant.sectionLabel} />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>{dict.ai.assistant.description}</p>
        <div style={{ position: 'relative' }}>
          <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSubmit(cmd); setCmd(''); } }}
            placeholder={dict.ai.assistant.placeholder}
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
          <button onClick={() => { onSubmit(cmd); setCmd(''); }} disabled={!cmd.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: cmd.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: cmd.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {dict.ai.assistant.modules.map(mod => (
          <Card key={mod.name}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: mod.color }}>{mod.name}</span>
              <StatusBadge status="mock" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mod.actions.map(a => (
                <button key={a} onClick={() => onSubmit(`${dict.ai.cmdPrefix}${a}`)}
                  style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#8A9AB0', fontSize: 12.5, cursor: 'pointer', textAlign: 'left', transition: 'all 0.13s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = TEXT; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLButtonElement).style.color = '#8A9AB0'; }}
                >{a}</button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── TAB 3: AI Agent ────────────────────────────────────────────────────────────
function AIAgentTab() {
  const { dict } = useI18n();
  const [activeStates, setActiveStates] = useState<boolean[]>(
    () => dict.ai.agent.items.map(() => false)
  );
  return (
    <div>
      <SectionLabel text={dict.ai.agent.sectionLabel} />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: 0 }}>
          {dict.ai.agent.description}
          <span style={{ color: '#D4A843', marginLeft: 8 }}>{dict.ai.agent.phase2Note}</span>
        </p>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dict.ai.agent.items.map((agent, i) => (
          <Card key={agent.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{agent.name}</span>
                <StatusBadge status="soon" />
              </div>
              <div style={{ fontSize: 13, color: MUTED }}>{agent.desc}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div className="font-mono-label" style={{ fontSize: 10, color: SUBTLE, marginBottom: 8 }}>{agent.schedule}</div>
              <div onClick={() => setActiveStates(prev => prev.map((v, j) => j === i ? !v : v))}
                style={{ width: 42, height: 22, borderRadius: 11, background: activeStates[i] ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.08)', border: `1px solid ${activeStates[i] ? GOLD : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: activeStates[i] ? GOLD : '#3A4255', position: 'absolute', top: 2, left: activeStates[i] ? 22 : 2, transition: 'all 0.2s' }} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── TAB 4: AI Daily — Today's Workbench ───────────────────────────────────────
function AIDailyTab() {
  return <DailyWorkbench />;
}

// ── TAB 5: AI Workflow ─────────────────────────────────────────────────────────
function AIWorkflowTab() {
  const { dict } = useI18n();
  return (
    <div>
      <SectionLabel text={dict.ai.workflow.sectionLabel} />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: 0 }}>
          {dict.ai.workflow.description}
          <span style={{ color: '#D4A843', marginLeft: 8 }}>{dict.ai.workflow.phase2Note}</span>
        </p>
      </Card>
      <SectionLabel text={dict.ai.workflow.exampleLabel} />
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, background: 'linear-gradient(180deg,rgba(203,168,92,0.4),rgba(203,168,92,0.05))' }} />
        {dict.ai.workflow.steps.map((s, i) => (
          <div key={s.label} style={{ position: 'relative', display: 'flex', gap: 14, marginBottom: 10 }}>
            <div style={{ position: 'absolute', left: -24, top: 12, width: 22, height: 22, borderRadius: '50%', background: i === 0 ? GOLD : i === dict.ai.workflow.steps.length - 1 ? '#6FBF8E' : 'rgba(255,255,255,0.08)', border: `1px solid ${i === 0 ? GOLD : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>
              {i === dict.ai.workflow.steps.length - 1 ? '✓' : i + 1}
            </div>
            <Card style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px' }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{s.label}</div><div style={{ fontSize: 12, color: MUTED }}>{s.desc}</div></div>
              <StatusBadge status="soon" />
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB 6: AI Inbox ────────────────────────────────────────────────────────────
function AIInboxTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const { dict } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState('');

  return (
    <div>
      <SectionLabel text={dict.ai.inbox.sectionLabel} />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onSubmit('分析上传的文件'); }}
        style={{ border: `2px dashed ${dragging ? GOLD : 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', background: dragging ? 'rgba(203,168,92,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', marginBottom: 16, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>📥</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>{dict.ai.inbox.dropTitle}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{dict.ai.inbox.dropDesc}</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder={dict.ai.inbox.pastePlaceholder}
          rows={3}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: TEXT, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.6 }}
          onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.4)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')} />
        {text.trim() && (
          <button onClick={() => { onSubmit(text); setText(''); }} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
            {dict.ai.inbox.analyzeBtn}
          </button>
        )}
      </div>
      <SectionLabel text={dict.ai.inbox.sourceLabel} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
        {dict.ai.inbox.sources.map(s => (
          <Card key={s.label} style={{ textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{s.desc}</div>
          </Card>
        ))}
      </div>
      <SectionLabel text={dict.ai.inbox.exampleLabel} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dict.ai.inbox.examples.map(ex => (
          <div key={ex.input} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ex.color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: TEXT, flex: 1 }}>{ex.input}</span>
            <span style={{ fontSize: 14, color: ex.color, fontWeight: 500 }}>{ex.output}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main AI Page ───────────────────────────────────────────────────────────────
export function AIPage() {
  const [tab, setTab] = useState<TabKey>('chat');
  const [heroInput, setHeroInput] = useState('');
  const [cmdState, setCmdState] = useState<CmdState | null>(null);
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [billingProfileMode, setBillingProfileMode] = useState(false);
  const [billingProfileInitialText, setBillingProfileInitialText] = useState('');
  const runner = useStepRunner();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dict } = useI18n();

  // Capture URL params once at mount — useState initializer runs synchronously.
  // Supports both ?q= (generated by AIWorkspace) and ?command= (direct URL / legacy).
  const [autoCmd] = useState(() => searchParams.get('q') ?? searchParams.get('command') ?? '');
  const [autoTab] = useState(() => (searchParams.get('tab') ?? '') as TabKey | '');
  const didAutoRun = useRef(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  function handleCommand(raw: string) {
    if (!raw.trim()) return;
    const t = raw.toLowerCase();

    // Billing profile intent — opens dedicated UI panel, skip router
    const isBillingProfile =
      (t.includes('保存') && (t.includes('开票') || t.includes('资料'))) ||
      t.includes('开票资料') || t.includes('billing profile') ||
      t.includes('新增开票') || t.includes('存起来') ||
      (t.includes('保存') && t.includes('客户'));
    if (isBillingProfile) {
      setTab('assistant');
      setCmdState(null);
      setInvoiceMode(false);
      setBillingProfileInitialText(raw);
      setBillingProfileMode(true);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Invoice intent — opens InvoiceAssistantPanel, skip router
    if (t.includes('发票') || t.includes('invoice')) {
      setTab('assistant');
      setCmdState(null);
      setInvoiceMode(true);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Product overview intent — shows price (PRODUCT_MASTER) + stock qty + consignment + quotation history.
    // Must come BEFORE INVENTORY_RE to intercept specific product+price queries (e.g. "Coffee table 还有多少库存").
    // Falls through when: (a) no product name extracted, or (b) a customer name is detected instead.
    const PRODUCT_OVERVIEW_RE = /单价|价格|多少钱|成本价|售价|报过多少|以前报|历史单价|建议报价|还有多少库存|库存和价格|历史报价|以前报价|报价记录|product price|price history|item price|product overview|这个产品/i;
    if (PRODUCT_OVERVIEW_RE.test(t)) {
      const customer = extractCustomerName(raw.trim());
      const product  = extractProductName(raw.trim());
      if (product && !customer) {
        const overviewMatch: AIIntentMatch = {
          intent: {
            intentId: 'product_overview',
            intentNameZh: '产品查询',
            intentNameEn: 'Product Overview',
            category: 'query',
            triggerKeywordsZh: [],
            triggerKeywordsEn: [],
            targetTab: 'chat',
            targetModule: 'Trade',
            targetRoute: '/trade',
            readSources: ['PRODUCT_MASTER', 'INVENTORY_DB', 'consignment_stock', 'quotation_items'],
            writeTargets: [],
            requiredFields: [],
            approvalRequired: false,
            resultPanel: null,
            implementationStatus: 'real',
            notConnectedMessage: '',
            fallbackBehavior: '',
          },
          confidence: 1,
          raw: raw.trim(),
          detectedMissingFields: [],
        };
        setTab('chat');
        setCmdState({ raw: raw.trim(), match: overviewMatch, phase: 'processing', step: 0 });
        runner.run(
          ['正在识别产品…', '正在查询产品主库和价格…', '正在检索库存与历史报价…'],
          (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
          () => {
            setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
            const base = typeof window !== 'undefined' ? window.location.origin : '';
            fetch(`${base}/api/ai/product-overview?product=${encodeURIComponent(product)}`)
              .then(r => r.json())
              .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
              .catch(e => console.error('[AI] product overview fetch failed', e));
          },
        );
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
        return;
      }
      // No product name or customer query detected — fall through to INVENTORY_RE / QUOTATION_HISTORY_RE
    }

    // Inventory intent — hardcoded regex, bypass scoring system entirely.
    // Scoring normalization penalizes intents with many keywords; regex is reliable.
    const INVENTORY_RE = /库存|还有多少|剩多少|有没有货|是否有货|能不能出货|缺货|低库存|stock|inventory/i;
    if (INVENTORY_RE.test(t)) {
      console.log('[AI] inventory intent detected, raw:', raw);
      const product = extractInventoryProduct(raw.trim());
      console.log('[AI] extracted product keyword:', product);
      // Build a minimal intent match inline (avoids importing the whole map)
      const inventoryMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_inventory',
          intentNameZh: '库存查询结果',
          intentNameEn: 'Inventory Check',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Inventory',
          targetRoute: '/trade?tab=inventory',
          readSources: ['consignment_stock'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: inventoryMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在连接库存数据库…', '正在检查库存水位…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          const qs = product ? `?product=${encodeURIComponent(product)}` : '';
          Promise.allSettled([
            fetch(`${base}/api/ai/inventory-table-alerts${qs}`).then(r => r.json()),
            fetch(`${base}/api/trade/check-inventory${qs}`).then(r => r.json()),
          ]).then(([whRes, csRes]) => {
            const combined = {
              ok: true,
              warehouse: whRes.status === 'fulfilled' ? whRes.value : { ok: false, error: '库存表读取失败' },
              consignment: csRes.status === 'fulfilled' ? csRes.value : { ok: false, error: '寄售库存读取失败' },
              productFilter: product || null,
            };
            setCmdState(prev => prev ? { ...prev, resultData: combined } : prev);
          }).catch(e => console.error('[AI] inventory fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Quotation follow-up intent — hardcoded regex, bypass scoring.
    const QUOTATION_FOLLOWUP_RE = /报价.*没回复|报价没有回复|哪些报价|报价跟进|报价超时|超时报价|已报价.*待确认|quotation follow|quoted not replied|pending quotation/i;
    if (QUOTATION_FOLLOWUP_RE.test(t)) {
      const quotationMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_quotation_followups',
          intentNameZh: '报价跟进结果',
          intentNameEn: 'Quotation Follow-up',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Quotation',
          targetRoute: '/quotation',
          readSources: ['quotation_records'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: quotationMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在连接报价数据库…', '正在筛选待跟进报价…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          fetch(`${base}/api/trade/check-quotation-followups`)
            .then(r => r.json())
            .then(data => {
              setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
            })
            .catch(e => console.error('[AI] quotation followup fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Quotation history intent — hardcoded regex.
    // Must come AFTER quotation followup check (followup is more specific).
    const QUOTATION_HISTORY_RE = /历史报价|以前报价|之前报价|报价记录|报价留底|客户报价|报过什么价|报过价|上次.*报价|上次报|最近.*报价|quotation history|past quote|quote record/i;
    if (QUOTATION_HISTORY_RE.test(t)) {
      const customer = extractCustomerName(raw.trim());
      const product  = extractProductName(raw.trim());
      const historyMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_quotation_history',
          intentNameZh: '历史报价',
          intentNameEn: 'Quotation History',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Quotation',
          targetRoute: '/quotation',
          readSources: ['quotation_records'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: historyMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在连接报价数据库…', '正在检索历史报价…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          const params = new URLSearchParams();
          if (customer) params.set('customer', customer);
          if (product)  params.set('product',  product);
          const qs = params.toString() ? `?${params.toString()}` : '';
          // Helper: read CRM customer_quote_record tasks from localStorage
          const readCrmQuoteRecords = (customerQ: string, productQ: string) => {
            try {
              const tasks: any[] = JSON.parse(localStorage.getItem('ICARE_HISTORY_V1') || '[]');
              const cqLower = customerQ.trim().toLowerCase();
              const pqLower = productQ.trim().toLowerCase();
              return tasks
                .filter(t => {
                  // Must be a customer_quote_record
                  const isCqr = t.categories === 'customer_quote_record'
                    || (t.lastContext || '').includes('[客户报价留底]')
                    || (t.lastContext || '').includes('[customer_quote_record]');
                  if (!isCqr) return false;
                  // DO NOT include supplier_quote
                  if (t.categories === 'supplier_quote') return false;
                  // Customer filter
                  if (cqLower) {
                    const haystack = [t.clientName, t.inquirySummary, t.lastContext, t.goal]
                      .join(' ').toLowerCase();
                    if (!haystack.includes(cqLower)) return false;
                  }
                  // Product filter
                  if (pqLower) {
                    const pHaystack = [t.goal, t.lastContext, t.inquirySummary,
                      ...(t.attachments || []).map((a: any) => a.name)]
                      .join(' ').toLowerCase();
                    if (!pHaystack.includes(pqLower)) return false;
                  }
                  return true;
                })
                .map(t => ({
                  id:           t.id,
                  source:       'crm_customer_quote_record',
                  customerName: t.clientName || '—',
                  projectName:  t.inquirySummary || '',
                  quoteNo:      '—',
                  grandTotal:   null,
                  sellingTotal: null,
                  vatAmount:    null,
                  margin:       null,
                  currency:     'AED',
                  status:       'CRM_留底',
                  statusZh:     '报价留底',
                  quoteType:    'CRM',
                  salesperson:  t.owner || '',
                  quoteDate:    t.createdAt || '',
                  createdAt:    t.createdAt || '',
                  updatedAt:    t.updatedAt || '',
                  items:        [],
                  hiddenInvalidItemsCount: 0,
                  isArchived:   t.status === 'archived',
                  archiveReason: null,
                  amountStatus: 'not_structured',
                  // CRM-specific fields
                  nextAction:           t.goal || '',
                  lastContext:          t.lastContext || '',
                  attachments:          t.attachments || [],
                  categories:           t.categories || '',
                  notionFollowupPageId: t.notionFollowupPageId || '',
                  tradeStatus:          t.tradeStatus || '',
                }));
            } catch { return []; }
          };

          fetch(`${base}/api/ai/quotation-history${qs}`)
            .then(r => r.json())
            .then(data => {
              // Merge CRM customer_quote_records into results
              const crmRecords = readCrmQuoteRecords(customer || '', product || '');
              if (crmRecords.length > 0) {
                const merged = {
                  ...data,
                  quotes: [...(data.quotes || []), ...crmRecords],
                  total: (data.total || 0) + crmRecords.length,
                  crmQuoteCount: crmRecords.length,
                  hasCrmRecords: true,
                };
                setCmdState(prev => prev ? { ...prev, resultData: merged } : prev);
              } else {
                setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
              }
            })
            .catch(e => console.error('[AI] quotation history fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Receivables / outstanding payment intent — hardcoded regex.
    const RECEIVABLES_RE = /未收款|欠款|应收|还没付款|没有付款|unpaid|receivable|outstanding|谁欠|多少钱没收|还有多少.*没收/i;
    if (RECEIVABLES_RE.test(t)) {
      const receivablesMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_receivables',
          intentNameZh: '应收款总览',
          intentNameEn: 'Receivables Overview',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Finance',
          targetRoute: '/trade?tab=finance',
          readSources: ['orders'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: receivablesMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在查询三个应收口径…', '正在汇总订单 / 寄售 / 发票应收…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          fetch(`${base}/api/ai/receivables-summary`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
            .catch(e => console.error('[AI] receivables fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Consignment intent — hardcoded regex.
    const CONSIGNMENT_RE = /寄售|consignment|未结算|结算情况|寄售库存|寄售货|寄售结算/i;
    if (CONSIGNMENT_RE.test(t)) {
      const consignmentMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_consignment',
          intentNameZh: '寄售情况',
          intentNameEn: 'Consignment Summary',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Warehouse',
          targetRoute: '/trade?tab=inventory',
          readSources: ['consignment_stock'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: consignmentMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在连接寄售数据库…', '正在检查寄售结算情况…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          // Try to extract customer from raw input for consignment queries like "IFZA 有寄售货吗"
          const custM = raw.match(/^(.{2,20}?)(?:有寄售|的寄售|寄售情况)/u);
          const custKw = custM?.[1]?.replace(/[？?。！!，,\s]/g, '').trim() || '';
          const qs = custKw ? `?customer=${encodeURIComponent(custKw)}` : '';
          fetch(`${base}/api/ai/consignment-summary${qs}`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
            .catch(e => console.error('[AI] consignment fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Sales intent — hardcoded regex.
    const SALES_RE = /销售|成交|订单金额|卖了多少|revenue|sales|本月.*卖|今天.*卖|哪些客户.*成交|成交.*客户/i;
    if (SALES_RE.test(t)) {
      const period = /今天|today/i.test(t) ? 'today' : /本周|this week/i.test(t) ? 'week' : 'month';
      const salesMatch: AIIntentMatch = {
        intent: {
          intentId: 'check_sales',
          intentNameZh: '销售情况',
          intentNameEn: 'Sales Summary',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Trade',
          targetRoute: '/trade',
          readSources: ['orders'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: salesMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在连接订单数据库…', '正在统计销售数据…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          fetch(`${base}/api/ai/sales-summary?period=${period}`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
            .catch(e => console.error('[AI] sales fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Daily brief intent — hardcoded regex.
    const DAILY_BRIEF_RE = /今日简报|老板简报|今天重点|今天风险|经营简报|daily brief|生成简报|今天.*情况|今天有什么/i;
    if (DAILY_BRIEF_RE.test(t)) {
      const briefMatch: AIIntentMatch = {
        intent: {
          intentId: 'generate_daily_brief',
          intentNameZh: '今日经营简报',
          intentNameEn: 'Daily Business Brief',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'AI Daily',
          targetRoute: '/ai?tab=daily',
          readSources: ['quotation_records', 'orders', 'consignment_stock', 'invoice_drafts'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: briefMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在并行查询业务数据…', '正在汇总报价 / 应收 / 寄售 / 销售…', '正在生成今日简报…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          fetch(`${base}/api/ai/daily-brief`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
            .catch(e => console.error('[AI] daily brief fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Register existing quotation — must come before CUSTOMER_360_RE and INVENTORY_RE
    const REGISTER_QUOTE_RE = /登记(?:一条)?报价|记录(?:客户)?报价|保存报价记录|已经报价|给客户报价|这个客户报价|register quotation|record quote|existing quotation|上传(?:报价单|这个报价)|帮我登记到报价/i;
    if (REGISTER_QUOTE_RE.test(t)) {
      const draft = parseQuotationDraft(raw.trim());
      const regMatch: AIIntentMatch = {
        intent: {
          intentId: 'register_existing_quotation',
          intentNameZh: '登记报价记录',
          intentNameEn: 'Register Quotation',
          category: 'action',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'Quotation',
          targetRoute: '/quotation',
          readSources: ['quotation_records'],
          writeTargets: ['quotation_records'],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: regMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在解析报价信息…', '正在生成报价草稿…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? {
            ...prev,
            phase: 'done',
            resultData: { type: 'register_existing_quotation', draft },
          } : prev);
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Update follow-up status intent — must come before CUSTOMER_360_RE
    const UPDATE_STATUS_RE = /更新状态|改成|更新到|设置为|变成|待签合同|合同待签|等客户签合同|待签约|恢复跟进|关闭本次跟进|把.+(?:更新|改|变|设置)/i;
    if (UPDATE_STATUS_RE.test(t)) {
      const { customerName, newStatus } = extractUpdateIntent(raw.trim());
      const crmTasks = readCRMTasks();
      const nameLower = customerName.toLowerCase();
      const matchedTask = nameLower
        ? crmTasks.find(task =>
            task.clientName.toLowerCase().includes(nameLower) ||
            nameLower.includes(task.clientName.toLowerCase().trim())
          ) || null
        : null;
      const notFound = !!customerName && !matchedTask;
      const updateMatch: AIIntentMatch = {
        intent: {
          intentId: 'update_followup_status',
          intentNameZh: '更新跟进状态',
          intentNameEn: 'Update Follow-up Status',
          category: 'action',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'CRM',
          targetRoute: '/crm',
          readSources: ['ICARE_HISTORY_V1'],
          writeTargets: ['notion_followup_log'],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: updateMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在查找客户记录…', '正在准备状态更新…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? {
            ...prev,
            phase: 'done',
            resultData: { type: 'update_followup_status', customerName, newStatus, matchedTask, currentStatus: matchedTask?.tradeStatus || null, notFound },
          } : prev);
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Create customer intent — must come before CUSTOMER_360_RE
    const CREATE_CUSTOMER_RE = /新增客户|增加客户|录入客户|保存客户信息|新客户.*[:：]|create customer|add customer|new lead/i;
    if (CREATE_CUSTOMER_RE.test(t)) {
      const draft = parseCreateDraft(raw.trim());
      // De-dup check against localStorage
      const crmTasks = readCRMTasks();
      const nameLower = draft.clientName.toLowerCase();
      const dup = nameLower
        ? crmTasks.find(task => {
            const tl = task.clientName.toLowerCase();
            return tl.includes(nameLower) || nameLower.includes(tl);
          }) || null
        : null;
      const createMatch: AIIntentMatch = {
        intent: {
          intentId: 'create_customer_from_ai',
          intentNameZh: '录入新客户',
          intentNameEn: 'Create Customer',
          category: 'action',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'CRM',
          targetRoute: '/crm',
          readSources: ['ICARE_HISTORY_V1'],
          writeTargets: ['notion_sb_pool', 'notion_followup_log'],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'real',
          notConnectedMessage: '',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: createMatch, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在解析客户信息…', '正在检查重复记录…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? {
            ...prev,
            phase: 'done',
            resultData: {
              type: 'create_customer_from_ai',
              draft,
              dupCheck: { hasDup: !!dup, dupName: dup?.clientName || null },
            },
          } : prev);
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // Customer 360 intent — hardcoded regex.
    const CUSTOMER_360_RE = /客户情况|现在是什么情况|上次跟进|客户总览|customer overview|客户.*查询|查.*客户/i;
    if (CUSTOMER_360_RE.test(t)) {
      // Extract customer name: "IFZA 现在是什么情况" → "IFZA"
      const custM = raw.trim().match(/^(.{2,30}?)(?:现在是什么情况|的情况|上次跟进|的客户|客户情况|总览)/u)
        || raw.trim().match(/查\s*(.{2,30}?)\s*(?:客户|情况)/u);
      const custKw = custM?.[1]?.replace(/[？?。！!，,\s查看帮我请一下]/g, '').trim() || '';
      const c360Match: AIIntentMatch = {
        intent: {
          intentId: 'customer_overview',
          intentNameZh: '客户总览',
          intentNameEn: 'Customer 360',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'CRM',
          targetRoute: '/crm',
          readSources: ['quotation_records', 'orders', 'consignment_stock', 'invoice_drafts'],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: custKw ? 'real' : 'partial',
          notConnectedMessage: custKw ? '' : '请在指令中指定客户名称，例如：「IFZA 现在是什么情况？」',
          fallbackBehavior: '',
        },
        confidence: 1,
        raw: raw.trim(),
        detectedMissingFields: custKw ? [] : ['customerName'],
      };
      if (!custKw) {
        setTab('chat');
        setCmdState({ raw: raw.trim(), match: c360Match, phase: 'not_connected', step: 0 });
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
        return;
      }
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: c360Match, phase: 'processing', step: 0 });
      runner.run(
        ['正在识别指令…', '正在跨表查询客户数据…', '正在汇总报价 / 订单 / 寄售 / 发票…'],
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        () => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          fetch(`${base}/api/ai/customer-360?customer=${encodeURIComponent(custKw)}`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
            .catch(e => console.error('[AI] customer 360 fetch failed', e));
        },
      );
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // ── Business Intent Guard ─────────────────────────────────────────────────
    // If input contains business keywords but slipped past all hardcoded routes,
    // intercept before the generic scorer returns "通用查询".
    // Generic Query is only allowed for pure small talk (greetings, meta-questions).
    const BUSINESS_GUARD_RE = /客户|报价|库存|寄售|销售|应收|未收款|发票|订单|付款|跟进|简报|老板简报|历史报价|欠款|结算|出货|备货/;
    const routerMatch = detectAIIntent(raw.trim());
    if (routerMatch.intent.intentId === 'generic_query' && BUSINESS_GUARD_RE.test(t)) {
      const guardMatch: AIIntentMatch = {
        intent: {
          intentId: 'business_guard',
          intentNameZh: '业务查询 — 需要补充',
          intentNameEn: 'Business Query — Needs Clarification',
          category: 'query',
          triggerKeywordsZh: [],
          triggerKeywordsEn: [],
          targetTab: 'chat',
          targetModule: 'AI Chat',
          targetRoute: '',
          readSources: [],
          writeTargets: [],
          requiredFields: [],
          approvalRequired: false,
          resultPanel: null,
          implementationStatus: 'partial',
          notConnectedMessage:
            '我识别到这是业务查询，但还需要补充查询对象或时间范围。\n\n可以这样问：\n• 查 IFZA 的历史报价\n• 哪些报价没有回复？\n• 本月销售情况\n• 谁还没付款？\n• 哪些寄售还没结算？\n• 生成今日简报',
          fallbackBehavior: '',
        },
        confidence: 0,
        raw: raw.trim(),
        detectedMissingFields: [],
      };
      setTab('chat');
      setCmdState({ raw: raw.trim(), match: guardMatch, phase: 'not_connected', step: 0 });
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    // All other commands — use router result (pure small talk reaches here)
    const match = routerMatch;
    const { intent } = match;

    setTab(intent.targetTab as TabKey);

    if (intent.implementationStatus === 'missing') {
      // Skip animation — go straight to not_connected message
      const state: CmdState = { raw: raw.trim(), match, phase: 'not_connected', step: 0 };
      setCmdState(state);
    } else {
      const steps = getIntentSteps(intent);
      const state: CmdState = { raw: raw.trim(), match, phase: 'processing', step: 0 };
      setCmdState(state);
      runner.run(
        steps,
        (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
        ()  => {
          setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev);
          // For check_inventory, fetch both warehouse + consignment after animation completes
          if (intent.intentId === 'check_inventory') {
            const base = typeof window !== 'undefined' ? window.location.origin : '';
            const product = extractInventoryProduct(raw.trim());
            const qs = product ? `?product=${encodeURIComponent(product)}` : '';
            Promise.allSettled([
              fetch(`${base}/api/ai/inventory-table-alerts${qs}`).then(r => r.json()),
              fetch(`${base}/api/trade/check-inventory${qs}`).then(r => r.json()),
            ]).then(([whRes, csRes]) => {
              const combined = {
                ok: true,
                warehouse: whRes.status === 'fulfilled' ? whRes.value : { ok: false, error: '库存表读取失败' },
                consignment: csRes.status === 'fulfilled' ? csRes.value : { ok: false, error: '寄售库存读取失败' },
                productFilter: product || null,
              };
              setCmdState(prev => prev ? { ...prev, resultData: combined } : prev);
            }).catch(e => console.error('[check_inventory] fetch failed', e));
          }
          // For check_quotation_followups, fetch real data after animation completes
          if (intent.intentId === 'check_quotation_followups') {
            const base = typeof window !== 'undefined' ? window.location.origin : '';
            fetch(`${base}/api/trade/check-quotation-followups`)
              .then(r => r.json())
              .then(data => {
                setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
              })
              .catch(e => console.error('[check_quotation_followups] fetch failed', e));
          }
        },
      );
    }

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  // Auto-execute command passed from Home via ?q= or switch tab via ?tab=
  // Runs once on mount; clears URL params so back-navigation doesn't re-fire.
  useEffect(() => {
    if (didAutoRun.current) return;
    didAutoRun.current = true;
    if (searchParams.get('q') || searchParams.get('command') || searchParams.get('tab')) {
      setSearchParams({}, { replace: true });
    }
    if (autoCmd) {
      handleCommand(autoCmd);
    } else if (autoTab && TABS.some(t => t.key === autoTab)) {
      setTab(autoTab as TabKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearCmd() {
    runner.clear();
    setCmdState(null);
    setInvoiceMode(false);
    setBillingProfileMode(false);
    setBillingProfileInitialText('');
  }

  return (
    <div style={{ maxWidth: 1400, width: '100%', margin: '0 auto', padding: '40px 32px 80px' }}>

      {/* Hero header */}
      <div style={{ marginBottom: cmdState ? 0 : 36 }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 600, color: TEXT, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          {greeting}, Chris
        </h1>
        <p style={{ fontSize: 16, color: MUTED, margin: '0 0 24px' }}>What would you like GCI to do today?</p>

        <div style={{ position: 'relative', maxWidth: 720 }}>
          <input
            value={heroInput}
            onChange={e => setHeroInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && heroInput.trim()) { handleCommand(heroInput); setHeroInput(''); } }}
            placeholder={dict.ai.heroPlaceholder}
            disabled={cmdState?.phase === 'processing'}
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 14, padding: '16px 56px 16px 20px', fontSize: 15, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif", boxShadow: '0 0 40px rgba(203,168,92,0.06)', opacity: cmdState?.phase === 'processing' ? 0.6 : 1 }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.55)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(203,168,92,0.25)')}
          />
          <button
            onClick={() => { if (heroInput.trim()) { handleCommand(heroInput); setHeroInput(''); } }}
            disabled={!heroInput.trim() || cmdState?.phase === 'processing'}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: 10, background: heroInput.trim() && cmdState?.phase !== 'processing' ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: heroInput.trim() ? 'pointer' : 'not-allowed', fontSize: 17, transition: 'background 0.2s' }}
          >↵</button>
        </div>
      </div>

      {/* Billing profile panel — shown when billing profile intent detected */}
      {billingProfileMode && tab === 'assistant' && (
        <BillingProfileDraftPanel
          initialText={billingProfileInitialText}
          onClose={clearCmd}
        />
      )}

      {/* Invoice wizard — shown when invoice intent detected */}
      {invoiceMode && tab === 'assistant' && (
        <InvoiceAssistantPanel onClose={clearCmd} />
      )}

      {/* Command panel — shows intent routing result for non-invoice commands */}
      {cmdState && !invoiceMode && (
        <CommandPanel
          state={cmdState}
          onApprove={clearCmd}
          onEdit={clearCmd}
          onCancel={clearCmd}
        />
      )}

      {/* Tab bar — scrollbar hidden via .ai-tab-bar CSS class */}
      <div className="ai-tab-bar" style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (cmdState) clearCmd(); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t.key ? GOLD_L : MUTED, fontSize: 13, fontWeight: tab === t.key ? 600 : 400, fontFamily: "'Space Grotesk',sans-serif", transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.status !== 'live' && (
              <span className="font-mono-label" style={{ fontSize: 8, color: STATUS_STYLES[t.status].color, background: STATUS_STYLES[t.status].bg, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.1em' }}>
                {STATUS_STYLES[t.status].label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content — hidden while a command result is active (top input is the only entry point).
          User clicks tab or "关闭" in CommandPanel to restore. */}
      {!cmdState && !invoiceMode && !billingProfileMode && (
        <>
          {tab === 'chat'      && <AIChatTab      onSubmit={handleCommand} />}
          {tab === 'assistant' && <AIAssistantTab onSubmit={handleCommand} />}
          {tab === 'agent'     && <AIAgentTab />}
          {tab === 'daily'     && <AIDailyTab />}
          {tab === 'workflow'  && <AIWorkflowTab />}
          {tab === 'inbox'     && <AIInboxTab     onSubmit={handleCommand} />}
        </>
      )}
    </div>
  );
}
