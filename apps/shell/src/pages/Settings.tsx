// GCI Settings — nav final collapse (2026-09-16). First real page behind
// the sidebar's 设置 row (previously path-less, "coming soon" toast only).
// Two tabs: 设置 (still a placeholder — no general settings exist yet, not
// built this round) and 历史工具 (renamed from 历史 AI 工具/Legacy),
// embedding the existing <AIPage/> unchanged — the /ai route itself is
// untouched and still resolves directly for any existing bookmark.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIPage } from './AIPage';
import { workspaceFontFamily } from '@gci/design-system';

const GOLD = '#7A5F2A';
const MUTED = '#475569';
const CARD = '#FFFFFF';
const BORD = 'rgba(12,27,58,0.07)';

type Tab = 'general' | 'legacyTools';

export function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('general');
  // Display-only i18n (same convention as CompanyDocuments.tsx) — switches
  // with the app's EN/中文 toggle via localStorage, no shared i18n dict
  // entries needed for this page's body text.
  const isZh = (localStorage.getItem('gci_platform_language_v1') || 'zh') === 'zh';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'general', label: isZh ? '设置' : 'Settings' },
    { key: 'legacyTools', label: isZh ? '历史工具' : 'Legacy Tools' },
  ];

  return (
    <div style={{ background: '#F5F6FA', minHeight: 'calc(100vh - var(--header-h))', color: '#0C1B3A', fontFamily: workspaceFontFamily }}>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(12,27,58,0.05)', border: '1px solid rgba(12,27,58,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          {isZh ? '← 返回' : '← Back'}
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0C1B3A', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          {isZh ? '设置' : 'Settings'}
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: tab === t.key ? '#080D1E' : 'rgba(12,27,58,0.04)',
              border: `1px solid ${tab === t.key ? 'transparent' : BORD}`,
              color: tab === t.key ? '#FFFFFF' : MUTED,
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          {isZh ? '更多设置即将上线。' : 'More settings coming soon.'}
        </div>
      )}

      {tab === 'legacyTools' && <AIPage />}
    </div>
    </div>
  );
}
