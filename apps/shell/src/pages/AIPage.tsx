import { useState, useEffect, useRef } from 'react';
import { DailyWorkbench } from '../components/DailyWorkbench';
import { useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { InvoiceAssistantPanel } from '../components/invoice/InvoiceAssistantPanel';
import { BillingProfileDraftPanel } from '../components/invoice/BillingProfileDraftPanel';
import { detectAIIntent, getIntentSteps } from '../ai/aiRouter';
import type { AIIntentMatch } from '../ai/aiRouter';

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

  // Pattern: 查/看 <customer> 的历史报价
  let m = s.match(/(?:查|看)(?:一下|查看|查询)?\s*(.+?)\s*(?:的)?(?:历史报价|以前报价|之前报价|报价记录)/u);
  if (m?.[1]) {
    const c = m[1].replace(/^[帮我请一下\s]+/, '').trim();
    if (c.length >= 2 && c.length <= 30) return c;
  }

  // Pattern: <customer> 以前/之前报价/报过
  m = s.match(/^(.+?)\s*(?:以前|之前|上次|历史)(?:报过|报价|的报价)/u);
  if (m?.[1]) {
    const c = m[1].replace(/^[帮我请一下\s]+/, '').trim();
    if (c.length >= 2 && c.length <= 30) return c;
  }

  // Pattern: <customer> 报过什么价
  m = s.match(/^(.+?)\s*报过什么价/u);
  if (m?.[1]) {
    const c = m[1].trim();
    if (c.length >= 2 && c.length <= 30) return c;
  }

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

function CommandPanel({ state, onApprove, onEdit, onCancel }: {
  state: CmdState;
  onApprove: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { dict } = useI18n();
  const { raw, match, phase, step } = state;
  const { intent, confidence } = match;

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

          {/* ── Inventory API error ── */}
          {intent.intentId === 'check_inventory' && state.resultData && !state.resultData.ok && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 12, padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: '1px solid rgba(224,132,106,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>库存 API 查询失败</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{state.resultData.error || '未知错误'}</div>
              {state.resultData.detail && (
                <div style={{ color: SUBTLE, fontSize: 11, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {typeof state.resultData.detail === 'string' ? state.resultData.detail : JSON.stringify(state.resultData.detail)}
                </div>
              )}
            </div>
          )}

          {/* ── Inventory result panel ── */}
          {intent.intentId === 'check_inventory' && state.resultData && state.resultData.ok && (
            <div style={{ marginBottom: 12 }}>
              {state.resultData.productFilter && (
                <div style={{ fontSize: 11, color: GOLD, marginBottom: 6 }}>
                  筛选：「{state.resultData.productFilter}」
                </div>
              )}
              {state.resultData.total === 0 ? (
                <div style={{ fontSize: 13, color: '#E0846A', padding: '10px 0' }}>
                  未找到与「{state.resultData.productFilter || '所查产品'}」相关的库存记录。
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                    共 {state.resultData.total} 种产品
                    {state.resultData.lowStockCount > 0 && (
                      <span style={{ marginLeft: 10, color: '#E0846A', fontWeight: 700 }}>
                        ⚠ {state.resultData.lowStockCount} 种库存偏低（≤5件）
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {state.resultData.products.map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: p.lowStock ? 'rgba(224,132,106,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.lowStock ? 'rgba(224,132,106,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                        <span style={{ flex: 1, fontSize: 13, color: TEXT, fontWeight: 600 }}>{p.productName}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: p.lowStock ? '#E0846A' : '#6FBF8E', minWidth: 60, textAlign: 'right' }}>
                          剩 {p.totalRemaining} 件
                        </span>
                        <span style={{ fontSize: 10, color: MUTED, minWidth: 70, textAlign: 'right' }}>
                          已售 {p.totalSold} / 寄售 {p.totalConsigned}
                        </span>
                        {p.lowStock && <span style={{ fontSize: 10, color: '#E0846A', fontWeight: 700 }}>库存偏低</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
                数据来源：consignment_stock · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* ── Inventory loading (resultData not yet returned) ── */}
          {intent.intentId === 'check_inventory' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
              正在查询库存数据…
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
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                {state.resultData.customerFilter
                  ? <>客户「{state.resultData.customerFilter}」共 {state.resultData.total} 条报价记录</>
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
                  {state.resultData.customerFilter
                    ? `未找到与「${state.resultData.customerFilter}」相关的报价记录。`
                    : '暂无报价记录。'}
                </div>
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {state.resultData.quotes.map((q: any, i: number) => (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{q.customerName}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap' }}>
                          AED {Number(q.grandTotal).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: q.status === 'GENERATED' ? 'rgba(203,168,92,0.12)' : q.status === 'SENT_TO_TRADE' ? 'rgba(111,191,142,0.12)' : 'rgba(255,255,255,0.06)', color: q.status === 'GENERATED' ? GOLD : q.status === 'SENT_TO_TRADE' ? '#6FBF8E' : MUTED }}>
                          {q.statusZh}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: MUTED }}>
                        <span>{q.quoteNo}</span>
                        {q.projectName && <span>{q.projectName}</span>}
                        <span>{q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}</span>
                        {q.salesperson && <span>{q.salesperson}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                数据来源：quotation_records · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
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

          {/* ── Receivables result panel ── */}
          {intent.intentId === 'check_receivables' && state.resultData && state.resultData.ok && (
            <div style={{ marginBottom: 12 }}>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.2)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>总未收款</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#E0846A' }}>
                    AED {Number(state.resultData.totalOutstanding).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>涉及客户</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{state.resultData.customerCount}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>涉及订单</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{state.resultData.orderCount}</div>
                </div>
                {state.resultData.overdueCount > 0 && (
                  <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(224,132,106,0.08)', border: '1px solid rgba(224,132,106,0.3)' }}>
                    <div style={{ fontSize: 10, color: '#E0846A', marginBottom: 2 }}>已逾期客户</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#E0846A' }}>{state.resultData.overdueCount}</div>
                  </div>
                )}
              </div>
              {state.resultData.customerCount === 0 ? (
                <div style={{ fontSize: 13, color: '#6FBF8E', padding: '10px 0' }}>✓ 暂无未收款记录。</div>
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {state.resultData.customers.map((c: any, i: number) => {
                    const hasOverdue = c.orders.some((o: any) => o.overdue);
                    return (
                      <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: hasOverdue ? 'rgba(224,132,106,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${hasOverdue ? 'rgba(224,132,106,0.22)' : 'rgba(255,255,255,0.07)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{c.customerName}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#E0846A' }}>
                            AED {Number(c.totalOutstanding).toLocaleString()} 未收
                          </span>
                          {hasOverdue && <span style={{ fontSize: 10, color: '#E0846A', fontWeight: 700 }}>⚠ 逾期</span>}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {c.orderCount} 张订单 · 已收 AED {Number(c.totalPaid).toLocaleString()} / 总计 AED {Number(c.totalGrandTotal).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                数据来源：orders · {new Date(state.resultData.asOf).toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* ── Receivables loading ── */}
          {intent.intentId === 'check_receivables' && !state.resultData && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>正在统计未收款数据…</div>
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

          {/* ── Default: show intent name for non-result done states ── */}
          {intent.intentId !== 'check_inventory' && intent.intentId !== 'check_quotation_followups' && intent.intentId !== 'check_quotation_history' && intent.intentId !== 'check_receivables' && intent.intentId !== 'check_consignment' && (
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
          const url = `${base}/api/trade/check-inventory${qs}`;
          console.log('[AI] fetching inventory:', url);
          fetch(url)
            .then(r => r.json())
            .then(data => {
              console.log('[AI] inventory API response:', JSON.stringify(data));
              // Store result regardless of ok — frontend shows error detail if ok=false
              setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
            })
            .catch(e => console.error('[AI] inventory fetch failed', e));
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
    const QUOTATION_HISTORY_RE = /历史报价|以前报价|之前报价|报价记录|报过什么价|报过价|quotation history|past quote/i;
    if (QUOTATION_HISTORY_RE.test(t)) {
      const customer = extractCustomerName(raw.trim());
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
          const qs = customer ? `?customer=${encodeURIComponent(customer)}` : '';
          fetch(`${base}/api/ai/quotation-history${qs}`)
            .then(r => r.json())
            .then(data => setCmdState(prev => prev ? { ...prev, resultData: data } : prev))
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
          intentNameZh: '未收款情况',
          intentNameEn: 'Receivables Summary',
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
        ['正在识别指令…', '正在连接订单数据库…', '正在统计未收款情况…'],
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

    // All other commands — use central router
    const match = detectAIIntent(raw.trim());
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
          // For check_inventory, fetch real data after animation completes
          if (intent.intentId === 'check_inventory') {
            const base = typeof window !== 'undefined' ? window.location.origin : '';
            const product = extractInventoryProduct(raw.trim());
            const qs = product ? `?product=${encodeURIComponent(product)}` : '';
            fetch(`${base}/api/trade/check-inventory${qs}`)
              .then(r => r.json())
              .then(data => {
                if (data.ok) setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
              })
              .catch(e => console.error('[check_inventory] fetch failed', e));
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
