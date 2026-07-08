import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';

const SUGGESTIONS = [
  '帮我创建一个新客户',
  '生成一份报价单',
  '查一下库存情况',
  '今天有哪些跟进？',
  '整理 WhatsApp 消息',
];

// cmd: triggers intent routing on /ai; tab: just switches to that tab
// labelKey maps to dict.workspace.*Label keys
const SHORTCUTS = [
  { icon: '💬', labelKey: 'aiChatLabel' as const,      descZh: '查询数据',     descEn: 'Query data',     tab: 'chat',      cmd: '' },
  { icon: '⚡', labelKey: 'aiAssistantLabel' as const, descZh: '执行操作',     descEn: 'Execute actions', tab: 'assistant', cmd: '' },
  { icon: '🤖', labelKey: 'aiAgentLabel' as const,     descZh: '自动运行',     descEn: 'Auto-run',       tab: 'agent',     cmd: '' },
  { icon: '📋', labelKey: 'aiDailyLabel' as const,     descZh: '今日驾驶舱',   descEn: "Today's hub",    tab: '',          cmd: '生成今日简报' },
  { icon: '🔄', labelKey: 'aiWorkflowLabel' as const,  descZh: '自动流程',     descEn: 'Automation',     tab: 'workflow',  cmd: '' },
  { icon: '📥', labelKey: 'aiInboxLabel' as const,     descZh: '丢进任何内容', descEn: 'Drop anything',  tab: '',          cmd: '整理 WhatsApp 消息' },
];

export function AIWorkspace() {
  const navigate = useNavigate();
  const { dict, lang } = useI18n();
  const [input, setInput] = useState('');
  const w = dict.workspace;

  function goAI(cmd?: string, tab?: string) {
    if (cmd) navigate(`/ai?q=${encodeURIComponent(cmd)}`);
    else if (tab) navigate(`/ai?tab=${tab}`);
    else navigate(input.trim() ? `/ai?q=${encodeURIComponent(input.trim())}` : '/ai');
  }

  return (
    <div style={{ marginBottom: 52 }}>
      {/* Section label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>{w.aiWorkspaceLabel}</span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        <button
          onClick={() => goAI()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#505A70', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', padding: 0 }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = GOLD_L)}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#505A70')}
        >
          {w.openFull}
        </button>
      </div>

      {/* Quick input */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(203,168,92,0.18)', borderRadius: 16, padding: '20px 20px 16px', boxShadow: '0 0 40px rgba(203,168,92,0.04)', marginBottom: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') goAI(); }}
            placeholder={lang === 'zh' ? 'Ask GCI...   告诉我你要做什么' : 'Ask GCI...   What would you like to do?'}
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14.5, color: colors.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'rgba(203,168,92,0.45)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <button
            onClick={() => goAI()}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 9, background: input.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontSize: 16, transition: 'background 0.2s' }}
          >↵</button>
        </div>

        {/* Suggestions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => navigate(`/ai?q=${encodeURIComponent(s)}`)}
              style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#7A8494', fontSize: 12, cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(203,168,92,0.35)'; (e.currentTarget as HTMLButtonElement).style.color = GOLD_L; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8494'; }}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Shortcut tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        {SHORTCUTS.map(s => (
          <button
            key={s.labelKey}
            onClick={() => goAI(s.cmd || undefined, s.tab || undefined)}
            style={{ padding: '11px 8px', borderRadius: 11, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(203,168,92,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(203,168,92,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)'; }}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary, marginBottom: 2 }}>{w[s.labelKey]}</div>
            <div style={{ fontSize: 10, color: '#505A70' }}>{lang === 'zh' ? s.descZh : s.descEn}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
