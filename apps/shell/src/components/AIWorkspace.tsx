import { useState, useRef, useEffect } from 'react';
import { colors } from '@gci/design-system';

// ── Mock processing steps ────────────────────────────────────────────────────
const MOCK_STEPS = [
  { id: 'read',    label: 'Reading request...',   ms: 600 },
  { id: 'detect',  label: 'Detecting task...',     ms: 900 },
  { id: 'check',   label: 'Checking CRM...',       ms: 800 },
  { id: 'prepare', label: 'Preparing action...',   ms: 700 },
  { id: 'ready',   label: 'Ready for approval',    ms: 0   },
];

// ── Quick entry shortcuts ────────────────────────────────────────────────────
const SHORTCUTS = [
  { key: 'inbox',    icon: '📥', label: 'AI Inbox',    desc: '上传 / 粘贴任何内容' },
  { key: 'operator', icon: '⚡', label: 'AI Operator', desc: '一句话执行任务' },
  { key: 'daily',    icon: '📋', label: 'AI Daily',    desc: '今日重点' },
  { key: 'monitor',  icon: '🔍', label: 'AI Monitor',  desc: '风险提醒' },
  { key: 'workflow', icon: '🔄', label: 'AI Workflow', desc: '自动流程' },
];

// ── Suggested prompts (shown when input is empty) ────────────────────────────
const SUGGESTIONS = [
  '帮我创建一个新客户',
  '生成一份报价单',
  '查一下库存情况',
  '今天有哪些跟进？',
  '整理一下 WhatsApp 消息',
];

type Phase = 'idle' | 'processing' | 'done';

interface MockResult {
  intent: string;
  module: string;
  action: string;
  input: string;
}

function detectIntent(text: string): MockResult {
  const t = text.toLowerCase();
  if (t.includes('客户') || t.includes('client') || t.includes('crm')) {
    return { intent: '新增客户', module: 'CRM', action: '打开新增客户表单', input: text };
  }
  if (t.includes('报价') || t.includes('quote') || t.includes('quotation')) {
    return { intent: '创建报价', module: 'Quotation', action: '打开报价工作台', input: text };
  }
  if (t.includes('发票') || t.includes('pi') || t.includes('invoice')) {
    return { intent: '生成 PI', module: 'Trade', action: '进入 PI 出单流程', input: text };
  }
  if (t.includes('库存') || t.includes('inventory') || t.includes('stock')) {
    return { intent: '查看库存', module: 'Warehouse', action: '打开库存管理', input: text };
  }
  if (t.includes('跟进') || t.includes('follow') || t.includes('whatsapp')) {
    return { intent: '跟进提醒', module: 'CRM', action: '打开今日跟进清单', input: text };
  }
  return { intent: '通用任务', module: 'AI', action: '分析并建议下一步', input: text };
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StepRow({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' && (
          <span style={{ fontSize: 13, color: '#6FBF8E' }}>✓</span>
        )}
        {state === 'active' && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#CBA85C', animation: 'pulse 1s ease infinite' }} />
        )}
        {state === 'pending' && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        )}
      </div>
      <span style={{
        fontSize: 13,
        color: state === 'done' ? '#6FBF8E' : state === 'active' ? colors.textPrimary : '#3A4255',
        fontFamily: 'IBM Plex Mono, monospace',
        letterSpacing: '0.04em',
        transition: 'color 0.3s',
      }}>
        {label}
      </span>
    </div>
  );
}

function ResultCard({ result, onReset }: { result: MockResult; onReset: () => void }) {
  return (
    <div style={{
      marginTop: 20,
      padding: '20px 22px',
      background: 'rgba(111,191,142,0.07)',
      border: '1px solid rgba(111,191,142,0.25)',
      borderRadius: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#6FBF8E', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em' }}>
          READY FOR APPROVAL
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(111,191,142,0.2)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { k: '识别意图', v: result.intent },
          { k: '目标模块', v: result.module },
          { k: '建议操作', v: result.action },
        ].map(({ k, v }) => (
          <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#505A70', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', marginBottom: 4 }}>{k}</div>
            <div style={{ fontSize: 13, color: colors.textPrimary, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: '#505A70', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', marginBottom: 4 }}>原始输入</div>
          <div style={{ fontSize: 12, color: '#7A8494', fontStyle: 'italic' }}>"{result.input}"</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          style={{
            flex: 1,
            padding: '11px',
            borderRadius: 10,
            background: 'linear-gradient(135deg,#CBA85C,#E2C988)',
            border: 'none',
            color: '#080D1E',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Space Grotesk',sans-serif",
          }}
          onClick={onReset}
        >
          确认执行 →
        </button>
        <button
          style={{
            padding: '11px 18px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#7A8494',
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={onReset}
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function AIWorkspace() {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIdx, setStepIdx] = useState(-1);
  const [result, setResult] = useState<MockResult | null>(null);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }

  function handleSubmit() {
    if (!input.trim() || phase === 'processing') return;
    const detected = detectIntent(input.trim());
    setResult(detected);
    setPhase('processing');
    setStepIdx(0);

    let accumulated = 0;
    MOCK_STEPS.forEach((step, i) => {
      if (i === MOCK_STEPS.length - 1) {
        const t = setTimeout(() => {
          setStepIdx(MOCK_STEPS.length - 1);
          setTimeout(() => setPhase('done'), 300);
        }, accumulated);
        timerRef.current.push(t);
      } else {
        const t = setTimeout(() => setStepIdx(i), accumulated);
        timerRef.current.push(t);
        accumulated += step.ms;
      }
    });
  }

  function handleReset() {
    clearTimers();
    setPhase('idle');
    setStepIdx(-1);
    setResult(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSuggestion(s: string) {
    setInput(s);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => () => clearTimers(), []);

  return (
    <div style={{ marginBottom: 52 }}>
      {/* Section label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: '#CBA85C' }}>
          AI WORKSPACE
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),rgba(203,168,92,0))' }} />
        <span className="font-mono-label" style={{ fontSize: 10, color: '#505A70' }}>BETA</span>
      </div>

      {/* Main card */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(203,168,92,0.18)',
        borderRadius: 18,
        padding: '24px 24px 20px',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 0 60px rgba(203,168,92,0.04)',
      }}>

        {/* Input area */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask GCI...   告诉我你要做什么，我来处理"
            disabled={phase === 'processing'}
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 12,
              padding: '14px 56px 14px 16px',
              fontSize: 15,
              color: colors.textPrimary,
              outline: 'none',
              resize: 'none',
              lineHeight: 1.6,
              fontFamily: "'Space Grotesk',sans-serif",
              transition: 'border-color 0.15s',
              boxSizing: 'border-box',
              opacity: phase === 'processing' ? 0.5 : 1,
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.45)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || phase === 'processing'}
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              width: 36,
              height: 36,
              borderRadius: 9,
              background: input.trim() && phase !== 'processing'
                ? 'linear-gradient(135deg,#CBA85C,#E2C988)'
                : 'rgba(255,255,255,0.06)',
              border: 'none',
              cursor: input.trim() && phase !== 'processing' ? 'pointer' : 'not-allowed',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >
            ↵
          </button>
        </div>

        {/* Suggestions (idle only) */}
        {phase === 'idle' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#7A8494',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.14s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(203,168,92,0.35)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#E2C988';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#7A8494';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Processing steps */}
        {(phase === 'processing' || phase === 'done') && (
          <div style={{ marginTop: 20, padding: '16px 18px', background: 'rgba(255,255,255,0.025)', borderRadius: 12 }}>
            {MOCK_STEPS.map((step, i) => (
              <StepRow
                key={step.id}
                label={step.label}
                state={i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending'}
              />
            ))}
          </div>
        )}

        {/* Result card */}
        {phase === 'done' && result && (
          <ResultCard result={result} onReset={handleReset} />
        )}
      </div>

      {/* Shortcut tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginTop: 12 }}>
        {SHORTCUTS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveShortcut(prev => prev === s.key ? null : s.key)}
            style={{
              padding: '12px 10px',
              borderRadius: 12,
              background: activeShortcut === s.key ? 'rgba(203,168,92,0.1)' : 'rgba(255,255,255,0.025)',
              border: activeShortcut === s.key ? '1px solid rgba(203,168,92,0.3)' : '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (activeShortcut !== s.key)
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(203,168,92,0.2)';
            }}
            onMouseLeave={e => {
              if (activeShortcut !== s.key)
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: activeShortcut === s.key ? '#E2C988' : colors.textPrimary, marginBottom: 3 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 10.5, color: '#505A70', lineHeight: 1.4 }}>{s.desc}</div>
          </button>
        ))}
      </div>

      {/* Shortcut placeholder panel */}
      {activeShortcut && (
        <div style={{
          marginTop: 10,
          padding: '18px 20px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
        }}>
          <span className="font-mono-label" style={{ fontSize: 10, color: '#505A70', letterSpacing: '0.15em' }}>
            {SHORTCUTS.find(s => s.key === activeShortcut)?.label.toUpperCase()} — 即将上线
          </span>
          <p style={{ fontSize: 13, color: '#3A4255', margin: '8px 0 0' }}>
            {activeShortcut === 'inbox' && '上传 WhatsApp 截图、邮件或文件，AI 自动分类处理。'}
            {activeShortcut === 'operator' && '输入一句指令，AI 跨模块完成完整业务流程。'}
            {activeShortcut === 'daily' && '每日早晨自动汇总：逾期跟进、待确认报价、交期预警。'}
            {activeShortcut === 'monitor' && '实时扫描异常：超期未跟进、报价未回复、库存低位。'}
            {activeShortcut === 'workflow' && '设定触发条件，AI 自动执行：如收到报价请求 → 生成草稿 → 发送。'}
          </p>
        </div>
      )}
    </div>
  );
}
