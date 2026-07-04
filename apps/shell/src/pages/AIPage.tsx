import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { InvoiceAssistantPanel } from '../components/invoice/InvoiceAssistantPanel';
import { BillingProfileDraftPanel } from '../components/invoice/BillingProfileDraftPanel';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const NAVY = '#080D1E';
const TEXT = colors.textPrimary;
const MUTED = '#505A70';
const SUBTLE = '#3A4255';

type TabKey = 'chat' | 'assistant' | 'agent' | 'daily' | 'workflow' | 'inbox';

const TABS: { key: TabKey; label: string; icon: string; status: 'mock' | 'soon' | 'live' }[] = [
  { key: 'chat',      label: 'AI Chat',      icon: '💬', status: 'mock' },
  { key: 'assistant', label: 'AI Assistant', icon: '⚡', status: 'mock' },
  { key: 'agent',     label: 'AI Agent',     icon: '🤖', status: 'soon' },
  { key: 'daily',     label: 'AI Daily',     icon: '📋', status: 'mock' },
  { key: 'workflow',  label: 'AI Workflow',  icon: '🔄', status: 'soon' },
  { key: 'inbox',     label: 'AI Inbox',     icon: '📥', status: 'mock' },
];

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  mock: { label: 'MOCK',        color: '#D4A843', bg: 'rgba(212,168,67,0.12)' },
  soon: { label: 'COMING SOON', color: MUTED,     bg: 'rgba(255,255,255,0.05)' },
  live: { label: 'LIVE',        color: '#6FBF8E', bg: 'rgba(111,191,142,0.12)' },
};

// ── Intent detection ──────────────────────────────────────────────────────────
interface IntentResult {
  tab: TabKey;
  task: string;
  taskZh: string;
  steps: string[];
  showApproval: boolean;
  resultLabel: string;
  module: string;
}

function detectIntent(raw: string): IntentResult {
  const t = raw.toLowerCase();

  // Invoice
  if (t.includes('发票') || t.includes('invoice')) {
    return {
      tab: 'assistant', task: 'Create Invoice Draft', taskZh: '生成发票草稿', module: 'Trade',
      steps: ['Understanding request…', 'Detected task: Create Invoice', 'Checking customer records…', 'Checking quotation / PI / order data…', 'Preparing invoice draft…', 'Waiting for approval.'],
      showApproval: true, resultLabel: '发票草稿已准备，等待确认后生成',
    };
  }

  // Quotation
  if (t.includes('报价') || t.includes('quotation') || t.includes('quote') || t.includes('报价单') || t.includes('boq')) {
    return {
      tab: 'assistant', task: 'Create Quotation Draft', taskZh: '生成报价草稿', module: 'Quotation',
      steps: ['Understanding request…', 'Detected task: Create Quotation', 'Checking customer…', 'Checking product / BOQ / supplier data…', 'Preparing quotation draft…', 'Waiting for approval.'],
      showApproval: true, resultLabel: '报价草稿已准备，等待确认后生成',
    };
  }

  // PI / Proforma
  if (t.includes('pi') || t.includes('proforma') || t.includes('pro forma') || t.includes('订单')) {
    return {
      tab: 'assistant', task: 'Create PI / Order', taskZh: '生成 PI / 订单', module: 'Trade',
      steps: ['Understanding request…', 'Detected task: Create PI', 'Checking customer & quotation…', 'Checking payment terms…', 'Preparing PI draft…', 'Waiting for approval.'],
      showApproval: true, resultLabel: 'PI 草稿已准备，等待确认后生成',
    };
  }

  // Customer / Lead
  if (t.includes('客户') || t.includes('customer') || t.includes('lead') || t.includes('新客户') || t.includes('名片')) {
    return {
      tab: 'assistant', task: 'Create Customer / Lead', taskZh: '创建客户档案', module: 'CRM',
      steps: ['Understanding request…', 'Detected task: Create Customer', 'Checking duplicate customer records…', 'Preparing customer profile…', 'Waiting for approval.'],
      showApproval: true, resultLabel: '客户档案已准备，等待确认后录入',
    };
  }

  // Inventory — query vs action
  if (t.includes('库存') || t.includes('inventory') || t.includes('stock') || t.includes('sku')) {
    const isAction = t.includes('更新') || t.includes('创建') || t.includes('导入') || t.includes('扣') || t.includes('补') || t.includes('盘点');
    return {
      tab: isAction ? 'assistant' : 'chat',
      task: isAction ? 'Update Inventory' : 'Query Inventory',
      taskZh: isAction ? '更新库存' : '查询库存',
      module: 'Warehouse',
      steps: isAction
        ? ['Understanding request…', 'Detected task: Update Inventory', 'Checking current stock levels…', 'Preparing inventory update…', 'Waiting for approval.']
        : ['Checking inventory database…', 'Finding matching SKUs…', 'Calculating stock levels…', 'Preparing answer…', 'Done.'],
      showApproval: isAction,
      resultLabel: isAction ? '库存更新已准备，等待确认' : '库存查询结果已准备',
    };
  }

  // WhatsApp / Email / File content → Inbox
  if (
    t.includes('whatsapp') || t.includes('email') || t.includes('邮件') ||
    t.includes('pdf') || t.includes('excel') || t.includes('图片') ||
    t.includes('合同') || t.includes('语音') || t.includes('微信') || t.includes('整理')
  ) {
    return {
      tab: 'inbox', task: 'Classify & Route Content', taskZh: '内容识别与分类', module: 'AI Inbox',
      steps: ['Reading input…', 'Identifying content type…', 'Detecting business context…', 'Suggesting target module…', 'Waiting for approval.'],
      showApproval: true, resultLabel: '内容已分类，请确认下一步操作',
    };
  }

  // Daily brief
  if (
    t.includes('今日简报') || t.includes('daily brief') || t.includes('morning brief') ||
    t.includes('今天重点') || t.includes('今日重点') || t.includes('简报') || t.includes('日报')
  ) {
    return {
      tab: 'daily', task: 'Generate Daily Brief', taskZh: '生成今日简报', module: 'AI Daily',
      steps: ['Checking CRM follow-ups…', 'Checking quotations…', 'Checking overdue payments…', 'Checking inventory alerts…', 'Preparing daily brief…', 'Done.'],
      showApproval: false, resultLabel: '今日简报已生成',
    };
  }

  // Workflow / Automation
  if (t.includes('流程') || t.includes('workflow') || t.includes('自动化') || t.includes('approval') || t.includes('审批')) {
    return {
      tab: 'workflow', task: 'Configure Workflow', taskZh: '配置自动化流程', module: 'AI Workflow',
      steps: ['Understanding workflow request…', 'Mapping business process…', 'Identifying trigger conditions…', 'Setting up automation steps…', 'Ready for review.'],
      showApproval: true, resultLabel: '流程已准备，等待配置确认',
    };
  }

  // Finance / Payment / 应收应付
  if (t.includes('收款') || t.includes('付款') || t.includes('财务') || t.includes('应收') || t.includes('应付') || t.includes('cash flow')) {
    return {
      tab: 'assistant', task: 'Finance Entry', taskZh: '财务记录', module: 'Finance',
      steps: ['Understanding request…', 'Detected task: Finance Entry', 'Checking relevant records…', 'Preparing entry draft…', 'Waiting for approval.'],
      showApproval: true, resultLabel: '财务记录已准备，等待确认',
    };
  }

  // Default: question → chat, command → assistant
  const isQuestion =
    t.endsWith('?') || t.endsWith('？') ||
    t.includes('哪些') || t.includes('谁') || t.includes('多少') ||
    t.includes('什么') || t.includes('几') || t.includes('查') || t.includes('看');

  return {
    tab: isQuestion ? 'chat' : 'assistant',
    task: isQuestion ? 'Query Answer' : 'Execute Command',
    taskZh: isQuestion ? '数据查询' : '执行操作',
    module: isQuestion ? 'AI Chat' : 'AI Assistant',
    steps: isQuestion
      ? ['Understanding question…', 'Searching relevant data…', 'Cross-referencing records…', 'Preparing answer…', 'Done.']
      : ['Understanding request…', 'Detecting task type…', 'Checking relevant data…', 'Preparing action…', 'Waiting for approval.'],
    showApproval: !isQuestion,
    resultLabel: isQuestion ? '查询结果已准备' : '操作已准备，等待确认',
  };
}

// ── Command processing panel ──────────────────────────────────────────────────
interface CmdState {
  raw: string;
  intent: IntentResult;
  phase: 'processing' | 'done';
  step: number;
}

function CommandPanel({ state, onApprove, onEdit, onCancel }: {
  state: CmdState;
  onApprove: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { raw, intent, phase, step } = state;

  const TAB_LABELS: Record<TabKey, string> = {
    chat: 'AI Chat', assistant: 'AI Assistant', agent: 'AI Agent',
    daily: 'AI Daily', workflow: 'AI Workflow', inbox: 'AI Inbox',
  };
  const MODULE_COLORS: Record<string, string> = {
    CRM: '#5BA3C9', Quotation: GOLD, Trade: '#8FA6D4',
    Warehouse: '#D4A843', Finance: '#6FBF8E', 'AI Inbox': '#94A3B8',
    'AI Daily': '#8FA6D4', 'AI Workflow': '#B084C9', 'AI Assistant': GOLD, 'AI Chat': '#5BA3C9',
  };
  const modColor = MODULE_COLORS[intent.module] || GOLD;

  return (
    <div style={{ margin: '16px 0 28px', padding: '20px 22px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16 }}>

      {/* Routing badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: modColor }} />
        <span className="font-mono-label" style={{ fontSize: 9.5, color: modColor, letterSpacing: '0.15em' }}>
          ROUTED TO {TAB_LABELS[intent.tab].toUpperCase()} · {intent.module.toUpperCase()}
        </span>
        <div style={{ flex: 1, height: 1, background: `rgba(255,255,255,0.06)` }} />
        <span style={{ fontSize: 12, color: '#3A4255', fontStyle: 'italic' }}>"{raw}"</span>
      </div>

      {/* Task label */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{intent.taskZh}</span>
        <span className="font-mono-label" style={{ marginLeft: 10, fontSize: 10, color: MUTED }}>/ {intent.task}</span>
      </div>

      {/* Steps */}
      <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 16 }}>
        {intent.steps.map((s, i) => {
          const isLast = i === intent.steps.length - 1;
          const stepState = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <div style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                {stepState === 'done' && <span style={{ color: '#6FBF8E', fontSize: 12 }}>✓</span>}
                {stepState === 'active' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: modColor, animation: 'pulse 1s ease infinite' }} />}
                {stepState === 'pending' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />}
              </div>
              <span className="font-mono-label" style={{
                fontSize: 12,
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

      {/* Result + actions (done state) */}
      {phase === 'done' && (
        <div style={{ padding: '14px 16px', background: intent.showApproval ? 'rgba(111,191,142,0.07)' : 'rgba(203,168,92,0.07)', border: `1px solid ${intent.showApproval ? 'rgba(111,191,142,0.22)' : 'rgba(203,168,92,0.22)'}`, borderRadius: 10 }}>
          <div className="font-mono-label" style={{ fontSize: 9.5, color: intent.showApproval ? '#6FBF8E' : GOLD, letterSpacing: '0.15em', marginBottom: 8 }}>
            {intent.showApproval ? 'WAITING FOR APPROVAL' : 'DONE'}
          </div>
          <div style={{ fontSize: 13.5, color: TEXT, marginBottom: intent.showApproval ? 14 : 0 }}>
            {intent.resultLabel}
          </div>
          {intent.showApproval && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onApprove} style={{ flex: 1, padding: '10px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
                Approve →
              </button>
              <button onClick={onEdit} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                Edit
              </button>
              <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
          {!intent.showApproval && (
            <button onClick={onCancel} style={{ marginTop: 10, padding: '9px 18px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
              Close
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
      <span className="font-mono-label" style={{ fontSize: 10, letterSpacing: '0.22em', color: GOLD }}>{text}</span>
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
      style={{ padding: '7px 14px', borderRadius: 20, background: hover ? 'rgba(203,168,92,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${hover ? 'rgba(203,168,92,0.35)' : 'rgba(255,255,255,0.08)'}`, color: hover ? GOLD_L : '#7A8494', fontSize: 12.5, cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap' }}
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
const CHAT_SUGGESTIONS = [
  '今天有什么重要事情？', '哪些报价还没有回复？', '哪些库存不足？',
  '谁欠款最多？', '今天有哪些订单？', '今天谁没有跟进？', '今年利润最高客户是谁？',
];

function AIChatTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [query, setQuery] = useState('');

  function submit(v?: string) {
    const val = v ?? query;
    if (!val.trim()) return;
    onSubmit(val);
    setQuery('');
  }

  return (
    <div>
      <SectionLabel text="AI CHAT — QUERY ONLY · NO DATA MODIFICATION" />
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>
          直接问 GCI 任何问题，AI 从现有数据中查询并回答。<strong style={{ color: TEXT }}>只读，不修改任何数据。</strong>
        </p>
        <div style={{ position: 'relative' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="问 GCI 任何问题...  e.g. 今天有哪些逾期跟进？"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
          <button onClick={() => submit()} disabled={!query.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: query.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: query.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
      </Card>
      <SectionLabel text="SUGGESTED QUERIES" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CHAT_SUGGESTIONS.map(s => <ActionChip key={s} label={s} onClick={() => submit(s)} />)}
      </div>
    </div>
  );
}

// ── TAB 2: AI Assistant ────────────────────────────────────────────────────────
const ASSISTANT_MODULES = [
  { name: 'CRM', color: '#5BA3C9', actions: ['创建客户', '修改客户', '创建跟进', '生成日报', '整理 WhatsApp', '识别名片', '导入 Excel 客户'] },
  { name: 'Quotation', color: GOLD, actions: ['创建报价', '修改报价', '导入 BOQ', '自动拆单', '推荐利润率', '推荐供应商', '生成 PDF', '发送报价'] },
  { name: 'Trade', color: '#8FA6D4', actions: ['生成 PI', '创建订单', '创建 Invoice', '生成 Packing List', '生成 Delivery Note', '自动计算 VAT', '自动生成付款条款'] },
  { name: 'Inventory', color: '#D4A843', actions: ['查库存', '扣库存', '补库存', '库存预警', '盘点', '查询 SKU'] },
  { name: 'Finance', color: '#6FBF8E', actions: ['创建应收', '创建应付', '记录收款', '记录付款', '生成 Cash Flow', '提醒催款', '生成财务日报'] },
  { name: 'Documents', color: '#94A3B8', actions: ['上传合同', '识别合同', '生成摘要', '提取付款条件', '提取交货日期', '提取违约条款'] },
];

function AIAssistantTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [cmd, setCmd] = useState('');

  return (
    <div>
      <SectionLabel text="AI ASSISTANT — EXECUTION ENGINE" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>告诉 AI 你要完成的操作，AI 自动识别模块并执行。</p>
        <div style={{ position: 'relative' }}>
          <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSubmit(cmd); setCmd(''); } }}
            placeholder="帮我...  e.g. 帮我给迪拜客户生成一份 PI"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
          <button onClick={() => { onSubmit(cmd); setCmd(''); }} disabled={!cmd.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: cmd.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: cmd.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {ASSISTANT_MODULES.map(mod => (
          <Card key={mod.name}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: mod.color }}>{mod.name}</span>
              <StatusBadge status="mock" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mod.actions.map(a => (
                <button key={a} onClick={() => onSubmit(`帮我${a}`)}
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
const AGENTS = [
  { name: '今日重点生成', schedule: '每天 09:00', desc: '自动汇总今日跟进、报价、订单重点，推送到 AI Daily', active: false },
  { name: '报价超时检查', schedule: '每小时', desc: '检查是否有报价发出超过 3 天未回复，自动提醒', active: false },
  { name: '客户未跟进预警', schedule: '每天 18:00', desc: '检查超过 7 天未跟进的客户，生成提醒清单', active: false },
  { name: '库存低位预警', schedule: '每天 10:00', desc: '扫描库存低于安全线的 SKU，推送预警', active: false },
  { name: '供应商回复监控', schedule: '每 2 小时', desc: '检查待回复询价单，催促未响应供应商', active: false },
  { name: '自动日报生成', schedule: '每天 20:00', desc: '生成业务日报：客户、报价、订单、收款、库存概览', active: false },
  { name: '风险客户识别', schedule: '每天 09:30', desc: '识别逾期付款、长期未跟进、低利润高风险客户', active: false },
  { name: '周报自动生成', schedule: '每周日 21:00', desc: '生成一周业务复盘，发送老板简报', active: false },
];

function AIAgentTab() {
  const [agents, setAgents] = useState(AGENTS.map(a => ({ ...a })));
  return (
    <div>
      <SectionLabel text="AI AGENT — AUTONOMOUS OPERATIONS" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, margin: 0 }}>
          AI Agent 在后台自动运行，不需要你每次手动触发。设定规则后，AI 自动监控、提醒、生成报告。
          <span style={{ color: '#D4A843', marginLeft: 8 }}>Phase 2 接入真实调度系统。</span>
        </p>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {agents.map((agent, i) => (
          <Card key={agent.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{agent.name}</span>
                <StatusBadge status="soon" />
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>{agent.desc}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div className="font-mono-label" style={{ fontSize: 10, color: SUBTLE, marginBottom: 8 }}>{agent.schedule}</div>
              <div onClick={() => setAgents(prev => prev.map((a, j) => j === i ? { ...a, active: !a.active } : a))}
                style={{ width: 42, height: 22, borderRadius: 11, background: agent.active ? 'rgba(203,168,92,0.3)' : 'rgba(255,255,255,0.08)', border: `1px solid ${agent.active ? GOLD : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: agent.active ? GOLD : '#3A4255', position: 'absolute', top: 2, left: agent.active ? 22 : 2, transition: 'all 0.2s' }} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── TAB 4: AI Daily ────────────────────────────────────────────────────────────
const DAILY_STATS = [
  { label: '今日跟进', value: '—', unit: '件', color: '#5BA3C9' },
  { label: '进行中报价', value: '—', unit: '份', color: GOLD },
  { label: '活跃订单', value: '—', unit: '个', color: '#8FA6D4' },
  { label: '今日应收', value: '—', unit: 'AED', color: '#6FBF8E' },
  { label: '库存预警', value: '—', unit: '项', color: '#E0846A' },
];

const INSIGHTS = [
  { icon: '🏆', label: '今天利润最高客户', value: '暂无数据', sub: '接入 Trade 数据后自动计算' },
  { icon: '⚠️', label: '今天风险最高客户', value: '暂无数据', sub: '基于逾期、跟进、付款综合评分' },
  { icon: '📞', label: '今天最值得联系客户', value: '暂无数据', sub: '基于跟进周期 + 报价状态推荐' },
];

function AIDailyTab() {
  return (
    <div>
      <SectionLabel text="AI DAILY — BOSS DASHBOARD" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
        {DAILY_STATS.map(s => (
          <Card key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk',sans-serif", marginBottom: 4 }}>{s.value}</div>
            <div className="font-mono-label" style={{ fontSize: 9, color: SUBTLE, letterSpacing: '0.12em' }}>{s.unit}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <SectionLabel text="AI INSIGHTS" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {INSIGHTS.map(ins => (
          <Card key={ins.label}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>{ins.icon}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{ins.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{ins.value}</div>
            <div style={{ fontSize: 11, color: SUBTLE }}>{ins.sub}</div>
          </Card>
        ))}
      </div>
      <SectionLabel text="TODAY'S BRIEFING" />
      <Card>
        {['今日暂无高优先级事项。', '所有跟进均在正常节奏内。', '建议今天重点跟进报价超过 3 天未回复的客户。', '库存整体正常，无紧急补货需求。'].map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ color: GOLD, fontSize: 14 }}>·</span>
            <span style={{ fontSize: 13.5, color: '#8A9AB0', lineHeight: 1.6 }}>{line}</span>
          </div>
        ))}
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(203,168,92,0.06)', borderRadius: 9, border: '1px solid rgba(203,168,92,0.15)' }}>
          <span className="font-mono-label" style={{ fontSize: 9.5, color: MUTED }}>AI SUGGESTION</span>
          <p style={{ fontSize: 13, color: MUTED, margin: '6px 0 0', lineHeight: 1.6 }}>接入真实 CRM / Trade 数据后，这里将显示个性化业务建议和风险预警。</p>
        </div>
      </Card>
    </div>
  );
}

// ── TAB 5: AI Workflow ─────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { icon: '📄', label: 'Upload PDF',     desc: '上传客户 BOQ / 合同 / 邮件' },
  { icon: '🤖', label: 'AI 识别',        desc: '提取关键信息、分类、结构化' },
  { icon: '📊', label: '创建报价',       desc: '自动生成报价草稿，等待确认' },
  { icon: '✅', label: '发送审批',       desc: '推送审批请求，老板一键确认' },
  { icon: '📑', label: '生成 PI',        desc: '批准后自动生成 Pro Forma Invoice' },
  { icon: '🧾', label: '生成 Invoice',  desc: '出货后生成正式发票' },
  { icon: '📦', label: '更新库存',       desc: '自动扣减对应 SKU 库存' },
  { icon: '🚚', label: '提醒发货',       desc: 'AI 通知仓库备货并安排物流' },
  { icon: '👤', label: '更新 CRM',       desc: '自动更新客户状态和跟进记录' },
  { icon: '🎯', label: '完成',          desc: '全流程归档，触发下一周期跟进' },
];

function AIWorkflowTab() {
  return (
    <div>
      <SectionLabel text="AI WORKFLOW — ENTERPRISE AUTOMATION" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, margin: 0 }}>
          设定触发条件，AI 自动串联多个模块，完成完整业务流程。无需手动切换系统。
          <span style={{ color: '#D4A843', marginLeft: 8 }}>Phase 2 启用。</span>
        </p>
      </Card>
      <SectionLabel text="SAMPLE WORKFLOW — CUSTOMER BOQ → PAYMENT" />
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, background: 'linear-gradient(180deg,rgba(203,168,92,0.4),rgba(203,168,92,0.05))' }} />
        {WORKFLOW_STEPS.map((s, i) => (
          <div key={s.label} style={{ position: 'relative', display: 'flex', gap: 14, marginBottom: 10 }}>
            <div style={{ position: 'absolute', left: -24, top: 12, width: 22, height: 22, borderRadius: '50%', background: i === 0 ? GOLD : i === WORKFLOW_STEPS.length - 1 ? '#6FBF8E' : 'rgba(255,255,255,0.08)', border: `1px solid ${i === 0 ? GOLD : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>
              {i === WORKFLOW_STEPS.length - 1 ? '✓' : i + 1}
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
const INBOX_SOURCES = [
  { icon: '💬', label: 'WhatsApp', desc: '粘贴聊天记录或截图' },
  { icon: '📧', label: '邮件', desc: '粘贴邮件正文或转发' },
  { icon: '💼', label: '微信', desc: '粘贴微信对话截图' },
  { icon: '👤', label: '名片', desc: '上传名片图片' },
  { icon: '📄', label: 'PDF', desc: '合同 / 报价单 / 发票' },
  { icon: '📊', label: 'Excel', desc: '客户名单 / BOQ / 库存表' },
  { icon: '🖼️', label: '图片', desc: '产品图 / 现场照 / 截图' },
  { icon: '🔊', label: '语音', desc: '微信语音 / 会议录音' },
];

const INBOX_EXAMPLES = [
  { input: '一张名片',          output: '→ 建议创建客户',                    color: '#5BA3C9' },
  { input: '一段 WhatsApp 对话', output: '→ 提取需求 + 更新 CRM + 生成待办',  color: GOLD },
  { input: '一份 BOQ',         output: '→ 建议创建报价',                    color: '#8FA6D4' },
  { input: '一封采购邮件',      output: '→ 建议生成 PI 或询价',               color: '#D4A843' },
  { input: '供应商发票',        output: '→ 建议登记应付',                    color: '#6FBF8E' },
  { input: '一份合同',         output: '→ 提取付款节点 + 交期 + 违约条款',   color: '#E0846A' },
];

function AIInboxTab({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState('');

  return (
    <div>
      <SectionLabel text="AI INBOX — ANYTHING IN, INTELLIGENCE OUT" />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onSubmit('分析上传的文件'); }}
        style={{ border: `2px dashed ${dragging ? GOLD : 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', background: dragging ? 'rgba(203,168,92,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', marginBottom: 16, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>📥</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>拖放任何文件到这里</div>
        <div style={{ fontSize: 13, color: MUTED }}>WhatsApp · 邮件 · 微信 · 名片 · PDF · Excel · 合同 · 图片 · 语音</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="或粘贴任何文字内容... WhatsApp 消息、邮件正文、客户需求描述"
          rows={3}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: TEXT, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.6 }}
          onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.4)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')} />
        {text.trim() && (
          <button onClick={() => { onSubmit(text); setText(''); }} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
            分析内容 →
          </button>
        )}
      </div>
      <SectionLabel text="SUPPORTED SOURCES" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
        {INBOX_SOURCES.map(s => (
          <Card key={s.label} style={{ textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{s.desc}</div>
          </Card>
        ))}
      </div>
      <SectionLabel text="EXAMPLES" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {INBOX_EXAMPLES.map(ex => (
          <div key={ex.input} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ex.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>丢进一{ex.input}</span>
            <span style={{ fontSize: 13, color: ex.color, fontWeight: 500 }}>{ex.output}</span>
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

  // Capture URL params once at mount — useState initializer runs synchronously.
  // Supports both ?q= (generated by AIWorkspace) and ?command= (direct URL / legacy).
  const [autoCmd] = useState(() => searchParams.get('q') ?? searchParams.get('command') ?? '');
  const [autoTab] = useState(() => (searchParams.get('tab') ?? '') as TabKey | '');
  const didAutoRun = useRef(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  function handleCommand(raw: string) {
    if (!raw.trim()) return;
    const intent = detectIntent(raw.trim());

    const t = raw.toLowerCase();

    // Billing profile intent — must be checked BEFORE invoice intent
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

    // Invoice intent → open InvoiceAssistantPanel instead of generic mock steps
    if (t.includes('发票') || t.includes('invoice')) {
      setTab('assistant');
      setCmdState(null);
      setInvoiceMode(true);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return;
    }

    setTab(intent.tab);
    const state: CmdState = { raw: raw.trim(), intent, phase: 'processing', step: 0 };
    setCmdState(state);

    runner.run(
      intent.steps,
      (i) => setCmdState(prev => prev ? { ...prev, step: i } : prev),
      ()  => setCmdState(prev => prev ? { ...prev, phase: 'done' } : prev),
    );

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
            placeholder="Ask GCI...  帮我做一张发票 / 帮我创建报价 / 生成今日简报"
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
