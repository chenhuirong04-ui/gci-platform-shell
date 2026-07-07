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
// "请帮我查一下心想印的库存" → "心想印"
// "咖啡机的库存还有多少"      → "咖啡机"
// "查一下库存"                → null (no specific product)
function extractInventoryProduct(raw: string): string | null {
  // Pattern: <word>的库存 or 查<word>库存 etc.
  const before = raw.match(/查(?:一下)?(.+?)(?:的库存|库存)/);
  if (before?.[1]) {
    const candidate = before[1].replace(/^[一下帮我请]+/, '').trim();
    if (candidate.length >= 2 && candidate.length <= 20) return candidate;
  }
  const after = raw.match(/(.+?)的库存/);
  if (after?.[1]) {
    const candidate = after[1].replace(/^.*(查|看|帮|我|请|一下)\s*/u, '').trim();
    if (candidate.length >= 2 && candidate.length <= 20) return candidate;
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

          {/* ── Inventory result panel ── */}
          {intent.intentId === 'check_inventory' && state.resultData && (
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

          {/* ── Inventory error ── */}
          {intent.intentId === 'check_inventory' && !state.resultData && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 8 }}>
              库存数据加载失败，请前往 贸易 → 库存管理 查看。
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

          {/* ── Quotation follow-up error ── */}
          {intent.intentId === 'check_quotation_followups' && !state.resultData && (
            <div style={{ fontSize: 13, color: '#E0846A', marginBottom: 8 }}>
              报价数据加载失败，请前往 报价管理 查看。
            </div>
          )}

          {/* ── Default: show intent name for non-result done states ── */}
          {intent.intentId !== 'check_inventory' && intent.intentId !== 'check_quotation_followups' && (
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
            <button onClick={onCancel} style={{ marginTop: 10, padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
              {dict.ai.panel.close}
            </button>
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
  const [query, setQuery] = useState('');

  function submit(v?: string) {
    const val = v ?? query;
    if (!val.trim()) return;
    onSubmit(val);
    setQuery('');
  }

  return (
    <div>
      <SectionLabel text={dict.ai.chat.sectionLabel} />
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>
          {dict.ai.chat.description}<strong style={{ color: TEXT }}>{dict.ai.chat.descriptionBold}</strong>
        </p>
        <div style={{ position: 'relative' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={dict.ai.chat.placeholder}
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
          <button onClick={() => submit()} disabled={!query.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: query.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: query.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
      </Card>
      <SectionLabel text={dict.ai.chat.quickLabel} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dict.ai.chat.suggestions.map(s => <ActionChip key={s} label={s} onClick={() => submit(s)} />)}
      </div>
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
                if (data.ok) setCmdState(prev => prev ? { ...prev, resultData: data } : prev);
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
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 80px' }}>

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

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t.key ? GOLD_L : MUTED, fontSize: 13.5, fontWeight: tab === t.key ? 600 : 400, fontFamily: "'Space Grotesk',sans-serif", transition: 'all 0.15s', marginBottom: -1 }}>
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

      {/* Tab content — each tab passes onSubmit up to handleCommand */}
      {tab === 'chat'      && <AIChatTab      onSubmit={handleCommand} />}
      {tab === 'assistant' && <AIAssistantTab onSubmit={handleCommand} />}
      {tab === 'agent'     && <AIAgentTab />}
      {tab === 'daily'     && <AIDailyTab />}
      {tab === 'workflow'  && <AIWorkflowTab />}
      {tab === 'inbox'     && <AIInboxTab     onSubmit={handleCommand} />}
    </div>
  );
}
