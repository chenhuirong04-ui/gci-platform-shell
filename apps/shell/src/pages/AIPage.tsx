import { useState } from 'react';
import { colors } from '@gci/design-system';

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
  mock: { label: 'MOCK',         color: '#D4A843', bg: 'rgba(212,168,67,0.12)' },
  soon: { label: 'COMING SOON', color: MUTED,     bg: 'rgba(255,255,255,0.05)' },
  live: { label: 'LIVE',        color: '#6FBF8E', bg: 'rgba(111,191,142,0.12)' },
};

// ── Shared primitives ─────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <span className="font-mono-label" style={{ fontSize: 10, letterSpacing: '0.22em', color: GOLD }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,rgba(203,168,92,0.3),transparent)` }} />
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
      style={{
        padding: '7px 14px', borderRadius: 20,
        background: hover ? 'rgba(203,168,92,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hover ? 'rgba(203,168,92,0.35)' : 'rgba(255,255,255,0.08)'}`,
        color: hover ? GOLD_L : '#7A8494', fontSize: 12.5, cursor: 'pointer',
        transition: 'all 0.14s', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

// ── Mock processing animation ─────────────────────────────────────────────────
type Phase = 'idle' | 'processing' | 'done';
const STEPS = [
  'Reading request...', 'Detecting task...', 'Checking CRM...',
  'Checking Inventory...', 'Preparing action...', 'Ready for approval',
];

function useProcessor() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(-1);
  const [input, setInput] = useState('');

  function run(text: string) {
    if (!text.trim() || phase === 'processing') return;
    setInput(text.trim());
    setPhase('processing');
    setStep(0);
    const delays = [500, 800, 700, 600, 700, 400];
    let acc = 0;
    delays.forEach((d, i) => {
      acc += i === 0 ? 0 : delays[i - 1];
      setTimeout(() => {
        setStep(i);
        if (i === delays.length - 1) setTimeout(() => setPhase('done'), 300);
      }, acc);
    });
  }

  function reset() { setPhase('idle'); setStep(-1); setInput(''); }
  return { phase, step, input, run, reset };
}

function ProcessingPanel({ phase, step, input, onReset }: { phase: Phase; step: number; input: string; onReset: () => void }) {
  if (phase === 'idle') return null;
  return (
    <div style={{ marginTop: 16, padding: '16px 18px', background: 'rgba(255,255,255,0.025)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
      {STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'pending';
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <div style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
              {state === 'done' && <span style={{ color: '#6FBF8E', fontSize: 12 }}>✓</span>}
              {state === 'active' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, animation: 'pulse 1s ease infinite' }} />}
              {state === 'pending' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />}
            </div>
            <span className="font-mono-label" style={{ fontSize: 12, color: state === 'done' ? '#6FBF8E' : state === 'active' ? TEXT : SUBTLE, transition: 'color 0.3s' }}>
              {s}
            </span>
          </div>
        );
      })}
      {phase === 'done' && (
        <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(111,191,142,0.07)', border: '1px solid rgba(111,191,142,0.22)', borderRadius: 10 }}>
          <div className="font-mono-label" style={{ fontSize: 9.5, color: '#6FBF8E', letterSpacing: '0.15em', marginBottom: 8 }}>READY FOR APPROVAL</div>
          <div style={{ fontSize: 13, color: TEXT, marginBottom: 12 }}>"{input}"</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onReset} style={{ flex: 1, padding: '9px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
              确认执行 →
            </button>
            <button onClick={onReset} style={{ padding: '9px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAB 1: AI Chat ─────────────────────────────────────────────────────────────
const CHAT_SUGGESTIONS = [
  '今天有什么重要事情？', '哪些报价还没有回复？', '哪些库存不足？',
  '谁欠款最多？', '今天有哪些订单？', '今天谁没有跟进？', '今年利润最高客户是谁？',
];

function AIChatTab() {
  const [query, setQuery] = useState('');
  const proc = useProcessor();

  function submit() { proc.run(query); setQuery(''); }

  return (
    <div>
      <SectionLabel text="AI CHAT — QUERY ONLY · NO DATA MODIFICATION" />
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>
          直接问 GCI 任何问题，AI 从现有数据中查询并回答。<strong style={{ color: TEXT }}>只读，不修改任何数据。</strong>
        </p>
        <div style={{ position: 'relative' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="问 GCI 任何问题...  e.g. 今天有哪些逾期跟进？"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = `rgba(203,168,92,0.5)`)}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
          <button onClick={submit} disabled={!query.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: query.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: query.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
        <ProcessingPanel {...proc} input={query || proc.input} onReset={proc.reset} />
      </Card>

      <SectionLabel text="SUGGESTED QUERIES" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CHAT_SUGGESTIONS.map(s => (
          <ActionChip key={s} label={s} onClick={() => { setQuery(s); }} />
        ))}
      </div>
    </div>
  );
}

// ── TAB 2: AI Assistant ────────────────────────────────────────────────────────
const ASSISTANT_MODULES = [
  {
    name: 'CRM', color: '#5BA3C9',
    actions: ['创建客户', '修改客户', '创建跟进', '生成日报', '整理 WhatsApp', '识别名片', '导入 Excel 客户'],
  },
  {
    name: 'Quotation', color: GOLD,
    actions: ['创建报价', '修改报价', '导入 BOQ', '自动拆单', '推荐利润率', '推荐供应商', '生成 PDF', '发送报价'],
  },
  {
    name: 'Trade', color: '#8FA6D4',
    actions: ['生成 PI', '创建订单', '创建 Invoice', '生成 Packing List', '生成 Delivery Note', '自动计算 VAT', '自动生成付款条款'],
  },
  {
    name: 'Inventory', color: '#D4A843',
    actions: ['查库存', '扣库存', '补库存', '库存预警', '盘点', '查询 SKU'],
  },
  {
    name: 'Finance', color: '#6FBF8E',
    actions: ['创建应收', '创建应付', '记录收款', '记录付款', '生成 Cash Flow', '提醒催款', '生成财务日报'],
  },
  {
    name: 'Documents', color: '#94A3B8',
    actions: ['上传合同', '识别合同', '生成摘要', '提取付款条件', '提取交货日期', '提取违约条款'],
  },
];

function AIAssistantTab() {
  const [cmd, setCmd] = useState('');
  const proc = useProcessor();

  return (
    <div>
      <SectionLabel text="AI ASSISTANT — EXECUTION ENGINE" />
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.7 }}>
          告诉 AI 你要完成的操作，AI 自动识别模块并执行。
        </p>
        <div style={{ position: 'relative' }}>
          <input
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && proc.run(cmd)}
            placeholder="帮我...  e.g. 帮我给迪拜客户生成一份 PI"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = `rgba(203,168,92,0.5)`)}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
          <button onClick={() => proc.run(cmd)} disabled={!cmd.trim()} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: 8, background: cmd.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: cmd.trim() ? 'pointer' : 'not-allowed', fontSize: 15 }}>↵</button>
        </div>
        <ProcessingPanel {...proc} onReset={proc.reset} />
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
                <button
                  key={a}
                  onClick={() => { setCmd(`帮我${a}`); proc.run(`帮我${a}`); }}
                  style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#8A9AB0', fontSize: 12.5, cursor: 'pointer', textAlign: 'left', transition: 'all 0.13s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = TEXT; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLButtonElement).style.color = '#8A9AB0'; }}
                >
                  {a}
                </button>
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
              <div
                onClick={() => setAgents(prev => prev.map((a, j) => j === i ? { ...a, active: !a.active } : a))}
                style={{ width: 42, height: 22, borderRadius: 11, background: agent.active ? `rgba(203,168,92,0.3)` : 'rgba(255,255,255,0.08)', border: `1px solid ${agent.active ? GOLD : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s' }}
              >
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
        <div style={{ padding: '4px 0' }}>
          {[
            '今日暂无高优先级事项。',
            '所有跟进均在正常节奏内。',
            '建议今天重点跟进报价超过 3 天未回复的客户。',
            '库存整体正常，无紧急补货需求。',
          ].map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ color: GOLD, fontSize: 14 }}>·</span>
              <span style={{ fontSize: 13.5, color: '#8A9AB0', lineHeight: 1.6 }}>{line}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(203,168,92,0.06)', borderRadius: 9, border: '1px solid rgba(203,168,92,0.15)' }}>
          <span className="font-mono-label" style={{ fontSize: 9.5, color: MUTED }}>AI SUGGESTION</span>
          <p style={{ fontSize: 13, color: MUTED, margin: '6px 0 0', lineHeight: 1.6 }}>
            接入真实 CRM / Trade 数据后，这里将显示个性化业务建议和风险预警。
          </p>
        </div>
      </Card>
    </div>
  );
}

// ── TAB 5: AI Workflow ─────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { icon: '📄', label: 'Upload PDF',      desc: '上传客户 BOQ / 合同 / 邮件' },
  { icon: '🤖', label: 'AI 识别',         desc: '提取关键信息、分类、结构化' },
  { icon: '📊', label: '创建报价',        desc: '自动生成报价草稿，等待确认' },
  { icon: '✅', label: '发送审批',        desc: '推送审批请求，老板一键确认' },
  { icon: '📑', label: '生成 PI',         desc: '批准后自动生成 Pro Forma Invoice' },
  { icon: '🧾', label: '生成 Invoice',   desc: '出货后生成正式发票' },
  { icon: '📦', label: '更新库存',        desc: '自动扣减对应 SKU 库存' },
  { icon: '🚚', label: '提醒发货',        desc: 'AI 通知仓库备货并安排物流' },
  { icon: '👤', label: '更新 CRM',        desc: '自动更新客户状态和跟进记录' },
  { icon: '🎯', label: '完成',           desc: '全流程归档，触发下一周期跟进' },
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
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{s.label}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{s.desc}</div>
              </div>
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
  { input: '一张名片',        output: '→ 建议创建客户',           color: '#5BA3C9' },
  { input: '一段 WhatsApp 对话', output: '→ 提取需求 + 更新 CRM + 生成待办', color: GOLD },
  { input: '一份 BOQ',       output: '→ 建议创建报价',           color: '#8FA6D4' },
  { input: '一封采购邮件',    output: '→ 建议生成 PI 或询价',      color: '#D4A843' },
  { input: '供应商发票',      output: '→ 建议登记应付',           color: '#6FBF8E' },
  { input: '一份合同',       output: '→ 提取付款节点 + 交期 + 违约条款', color: '#E0846A' },
];

function AIInboxTab() {
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState('');
  const proc = useProcessor();

  return (
    <div>
      <SectionLabel text="AI INBOX — ANYTHING IN, INTELLIGENCE OUT" />

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); proc.run('分析上传的文件'); }}
        style={{ border: `2px dashed ${dragging ? GOLD : 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', background: dragging ? 'rgba(203,168,92,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', marginBottom: 16, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>📥</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>拖放任何文件到这里</div>
        <div style={{ fontSize: 13, color: MUTED }}>WhatsApp · 邮件 · 微信 · 名片 · PDF · Excel · 合同 · 图片 · 语音</div>
      </div>

      {/* Or paste text */}
      <div style={{ marginBottom: 20 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="或粘贴任何文字内容... WhatsApp 消息、邮件正文、客户需求描述"
          rows={3}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: TEXT, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.6 }}
          onFocus={e => (e.target.style.borderColor = `rgba(203,168,92,0.4)`)}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
        />
        {text.trim() && (
          <button onClick={() => proc.run(text)} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 9, background: `linear-gradient(135deg,${GOLD},${GOLD_L})`, border: 'none', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>
            分析内容 →
          </button>
        )}
        <ProcessingPanel {...proc} onReset={proc.reset} />
      </div>

      {/* Source types */}
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

      {/* Examples */}
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
  const [input, setInput] = useState('');
  const proc = useProcessor();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 80px' }}>

      {/* Hero header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 600, color: TEXT, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          {greeting}, Chris
        </h1>
        <p style={{ fontSize: 16, color: MUTED, margin: '0 0 24px' }}>
          What would you like GCI to do today?
        </p>

        {/* Main input */}
        <div style={{ position: 'relative', maxWidth: 720 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { proc.run(input); setInput(''); } }}
            placeholder="Ask GCI...  e.g. 帮我创建客户、生成报价、查库存、整理 WhatsApp"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(203,168,92,0.25)`, borderRadius: 14, padding: '16px 56px 16px 20px', fontSize: 15, color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif", boxShadow: '0 0 40px rgba(203,168,92,0.06)' }}
            onFocus={e => (e.target.style.borderColor = `rgba(203,168,92,0.55)`)}
            onBlur={e => (e.target.style.borderColor = `rgba(203,168,92,0.25)`)}
          />
          <button
            onClick={() => { if (input.trim()) { proc.run(input); setInput(''); } }}
            disabled={!input.trim()}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: 10, background: input.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: 17, transition: 'background 0.2s' }}
          >↵</button>
        </div>
        <ProcessingPanel {...proc} onReset={proc.reset} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
              color: tab === t.key ? GOLD_L : MUTED,
              fontSize: 13.5, fontWeight: tab === t.key ? 600 : 400,
              fontFamily: "'Space Grotesk',sans-serif",
              transition: 'all 0.15s', marginBottom: -1,
            }}
          >
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

      {/* Tab content */}
      {tab === 'chat'      && <AIChatTab />}
      {tab === 'assistant' && <AIAssistantTab />}
      {tab === 'agent'     && <AIAgentTab />}
      {tab === 'daily'     && <AIDailyTab />}
      {tab === 'workflow'  && <AIWorkflowTab />}
      {tab === 'inbox'     && <AIInboxTab />}
    </div>
  );
}
