// GCI Executive Desk — Task 10: Commitments / 承诺事项.
// Read-only summary of confirmed, open commitments. Candidates (unconfirmed
// free-text detections) live on /commitments, never here — Home stays light.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getCommitmentHomeData,
  commitmentDisplayStatus,
  COMMITMENT_SOURCE_LABEL,
  type CommitmentHomeSummary,
  type ExecutiveCommitment,
} from '../lib/commitments';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  return `${mo}/${da}`;
}

export function CommitmentTracker() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<CommitmentHomeSummary | null>(null);
  const [items, setItems] = useState<ExecutiveCommitment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCommitmentHomeData().then((res) => {
      if (res.ok) {
        setSummary(res.summary);
        setItems(res.items);
      } else {
        setError(res.error);
      }
    });
  }, []);

  const nowMs = Date.now();

  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          承诺事项 · COMMITMENTS
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
        {summary && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: 'IBM Plex Mono,monospace' }}>
            <span style={{ color: MUTED }}>待兑现 {summary.open}</span>
            <span style={{ color: RED }}>已逾期 {summary.overdue}</span>
            <span style={{ color: GOLD }}>今日到期 {summary.dueToday}</span>
          </div>
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: '18px 18px', fontSize: 12.5, color: RED }}>读取失败:{error}</div>
        ) : !items ? (
          <div style={{ padding: '18px 18px', fontSize: 12.5, color: MUTED }}>加载中…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12.5, color: MUTED }}>暂无待兑现承诺</div>
        ) : (
          items.map((c) => {
            const status = commitmentDisplayStatus(c, nowMs);
            const color = status === 'overdue' ? RED : AMBER;
            return (
              <div
                key={c.id}
                onClick={() => navigate('/commitments')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${BORD}`, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace', flexShrink: 0 }}>
                  {status === 'overdue' ? '逾期' : '待兑现'}
                </span>
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
                  {COMMITMENT_SOURCE_LABEL[c.source]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.commitment_text}</div>
                </div>
                {c.due_at && <span style={{ fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace', flexShrink: 0 }}>{formatDate(c.due_at)}</span>}
              </div>
            );
          })
        )}
      </div>

      {summary && summary.open > 0 && (
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <span onClick={() => navigate('/commitments')} style={{ fontSize: 11.5, color: GOLD, cursor: 'pointer' }}>
            查看全部 ({summary.open}) →
          </span>
        </div>
      )}
    </div>
  );
}
