// GCI Executive Desk — Task 12: Business Assistant entry point.
// Deliberately small — a link + a few example prompts, not a new stats
// block. The actual Customer 360 aggregation lives on /business-assistant.
import { useNavigate } from 'react-router-dom';

const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const SHORTCUTS = ['查客户进展', '查最近报价', '找客户文件', '记录沟通', '设置下次跟进', '写邮件/WhatsApp'];

export function BusinessAssistantEntry() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          商务助理 · BUSINESS ASSISTANT
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>
      <div
        onClick={() => navigate('/business-assistant')}
        style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, cursor: 'pointer' }}
      >
        <div style={{ fontSize: 13, color: '#EDEFF3', marginBottom: 10 }}>
          输入客户/公司名,查看进展、邮件、文件、报价、承诺与决定 — 一个入口搞定
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SHORTCUTS.map((s) => (
            <span key={s} style={{ fontSize: 11, color: MUTED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, borderRadius: 20, padding: '5px 12px' }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
