// GCI Executive Desk — Home Layout Cleanup: 老板管理闭环 (compact).
// Presentation-only: reuses the exact same data functions as DecisionInbox /
// DecisionFollowThrough / CommitmentTracker (Tasks 8/9/10) — no new writes,
// no changed logic, no changed priority/status rules. This is a 3-across,
// count + top-2 + "查看全部" summary so Home doesn't stack three full-height
// sections vertically. Full interactive versions still live on /decisions
// and /commitments, unchanged.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { refreshPendingDecisions, type ExecutiveDecision } from '../lib/decisionInbox';
import { getFollowThroughData, type FollowThroughCounts, type FollowThroughItem } from '../lib/decisionInbox';
import { getCommitmentHomeData, commitmentDisplayStatus, type CommitmentHomeSummary, type ExecutiveCommitment } from '../lib/commitments';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function CardShell({
  title, count, countColor, onOpen, children,
}: { title: string; count: number | null; countColor: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 128 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: countColor, fontFamily: "'Space Grotesk',sans-serif" }}>
          {count === null ? '—' : count}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
      <div onClick={onOpen} style={{ fontSize: 11, color: GOLD, cursor: 'pointer', textAlign: 'right' }}>
        查看全部 →
      </div>
    </div>
  );
}

function MiniRow({ label, sub, color }: { label: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, overflow: 'hidden' }}>
      {color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      <span style={{ color: colors.textPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {sub && <span style={{ color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div style={{ fontSize: 11.5, color: MUTED }}>{text}</div>;
}

export function BossManagementCards() {
  const navigate = useNavigate();

  const [decisions, setDecisions] = useState<ExecutiveDecision[] | null>(null);
  const [ftCounts, setFtCounts] = useState<FollowThroughCounts | null>(null);
  const [ftItems, setFtItems] = useState<FollowThroughItem[] | null>(null);
  const [commSummary, setCommSummary] = useState<CommitmentHomeSummary | null>(null);
  const [commItems, setCommItems] = useState<ExecutiveCommitment[] | null>(null);

  useEffect(() => {
    refreshPendingDecisions().then((res) => { if (res.ok) setDecisions(res.rows); });
    getFollowThroughData().then((res) => { if (res.ok) { setFtCounts(res.counts); setFtItems(res.items); } });
    getCommitmentHomeData().then((res) => { if (res.ok) { setCommSummary(res.summary); setCommItems(res.items); } });
  }, []);

  const nowMs = Date.now();
  const ftTotal = ftCounts ? ftCounts.pending + ftCounts.inProgress + ftCounts.blocked : null;

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          老板管理闭环 · DECIDE / EXECUTE / DELIVER
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {/* 1. 等你决定 */}
        <CardShell title="等你决定" count={decisions ? decisions.length : null} countColor={RED} onOpen={() => navigate('/decisions')}>
          {decisions === null ? (
            <EmptyMini text="加载中…" />
          ) : decisions.length === 0 ? (
            <EmptyMini text="暂无需要决定的事项" />
          ) : (
            decisions.slice(0, 2).map((d) => (
              <MiniRow key={d.id} label={d.title} sub={d.reason} color={d.priority === 'P1' ? RED : d.priority === 'P2' ? AMBER : MUTED} />
            ))
          )}
        </CardShell>

        {/* 2. 决策执行 */}
        <CardShell title="决策执行" count={ftTotal} countColor={AMBER} onOpen={() => navigate('/decisions')}>
          {ftItems === null ? (
            <EmptyMini text="加载中…" />
          ) : ftItems.length === 0 ? (
            <EmptyMini text="暂无跟踪中的执行事项" />
          ) : (
            ftItems.slice(0, 2).map((it) => (
              <MiniRow key={it.id} label={it.title} sub={it.reason} color={it.priority === 'P1' ? RED : it.priority === 'P2' ? AMBER : MUTED} />
            ))
          )}
        </CardShell>

        {/* 3. 承诺事项 */}
        <CardShell title="承诺事项" count={commSummary ? commSummary.open : null} countColor={commSummary && commSummary.overdue > 0 ? RED : GOLD} onOpen={() => navigate('/commitments')}>
          {commItems === null ? (
            <EmptyMini text="加载中…" />
          ) : commItems.length === 0 ? (
            <EmptyMini text="暂无待兑现承诺" />
          ) : (
            commItems.slice(0, 2).map((c) => {
              const overdue = commitmentDisplayStatus(c, nowMs) === 'overdue';
              return <MiniRow key={c.id} label={c.title} sub={c.counterparty ?? undefined} color={overdue ? RED : AMBER} />;
            })
          )}
        </CardShell>
      </div>
    </div>
  );
}
