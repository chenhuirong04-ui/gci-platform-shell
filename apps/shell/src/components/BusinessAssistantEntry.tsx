// GCI Executive Desk — Task 12 / Home Layout Cleanup: Business Assistant
// entry point. A real input (not just a decorative card) so Chris can type
// a customer/company name and land directly on /business-assistant?customer=.
// The actual Customer 360 aggregation logic lives entirely on that page —
// nothing here talks to CRM/Gmail/Drive/etc.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(203,168,92,0.18)';

const SHORTCUTS = ['查客户', '查报价', '找文件', '记录沟通', '写邮件'];

export function BusinessAssistantEntry() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  function go() {
    const v = value.trim();
    navigate(v ? `/business-assistant?customer=${encodeURIComponent(v)}` : '/business-assistant');
  }

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          GIA · GCI INTELLIGENT ASSISTANT
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>
      <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 14, boxShadow: '0 0 40px rgba(203,168,92,0.04)' }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
            placeholder="问我：MAG现在什么情况？上次报价多少？今天先跟谁？"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14.5, color: colors.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(203,168,92,0.45)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <button
            onClick={go}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 9, background: value.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontSize: 16 }}
          >↵</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SHORTCUTS.map((s) => (
            <span
              key={s}
              onClick={() => navigate('/business-assistant')}
              style={{ fontSize: 11.5, color: MUTED, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
