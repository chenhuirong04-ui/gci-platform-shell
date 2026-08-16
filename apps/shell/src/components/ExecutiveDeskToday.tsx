// GCI Executive Desk — Task 4 first-screen CRM blocks.
// Reads directly from crm_customers / crm_contacts / crm_followups via the
// authenticated Supabase client. Never reads Notion or localStorage CRM data.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getTodaysFollowups,
  getOverdueFollowups,
  getRecentNewCustomers,
  getBossDecisions,
  type CrmCustomer,
  type CrmOverdueCustomer,
  type CrmNewCustomerRow,
  type BossDecisionItem,
} from '../lib/crmSupabase';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const BLUE = '#5BA3C9';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

function Header({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '16px 18px', fontSize: 12.5, color: MUTED, background: CARD, border: `1px solid ${BORD}`, borderRadius: 10 }}>
      {text}
    </div>
  );
}

function CustomerRow({
  onClick,
  name,
  chips,
  right,
}: {
  onClick: () => void;
  name: string;
  chips: { label: string; color: string }[];
  right?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 6,
        background: CARD, border: `1px solid ${BORD}`, borderRadius: 10, cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{name}</span>
          {chips.map((c, i) => (
            <span
              key={i}
              style={{ fontSize: 9.5, fontWeight: 700, color: c.color, background: `${c.color}18`, border: `1px solid ${c.color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace' }}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
      {right && <span style={{ fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>{right}</span>}
    </div>
  );
}

export function ExecutiveDeskToday() {
  const navigate = useNavigate();
  const [today, setToday] = useState<{ rows: CrmCustomer[] } | null>(null);
  const [overdue, setOverdue] = useState<{ rows: CrmOverdueCustomer[] } | null>(null);
  const [newCustomers, setNewCustomers] = useState<{ rows: CrmNewCustomerRow[] } | null>(null);
  const [decisions, setDecisions] = useState<{ items: BossDecisionItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getTodaysFollowups(), getOverdueFollowups(), getRecentNewCustomers(7), getBossDecisions()])
      .then(([t, o, n, d]) => {
        if (t.ok) setToday({ rows: t.rows }); else setError(t.error);
        if (o.ok) setOverdue({ rows: o.rows }); else setError(o.error);
        if (n.ok) setNewCustomers({ rows: n.rows }); else setError(n.error);
        if (d.ok) setDecisions({ items: d.items }); else setError(d.error);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const loaded = today && overdue && newCustomers && decisions;
  const goCustomer = (name: string) => navigate(`/ai?q=${encodeURIComponent(`查一下 ${name}`)}`);

  return (
    <div style={{ marginBottom: 52 }}>
      {/* Top-line summary — the "conclusion" before the data */}
      <div
        style={{
          padding: '13px 18px', borderRadius: 12, marginBottom: 22,
          background: 'rgba(203,168,92,0.06)', border: '1px solid rgba(203,168,92,0.2)',
          fontSize: 13.5, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif",
        }}
      >
        {!loaded ? (
          <span style={{ color: MUTED }}>正在读取 CRM 数据…</span>
        ) : error ? (
          <span style={{ color: RED }}>Executive Desk 数据读取失败:{error}</span>
        ) : (
          <span>
            今日 <strong style={{ color: GOLD }}>{today!.rows.length}</strong> 个客户需跟进｜
            <strong style={{ color: RED }}> {overdue!.rows.length}</strong> 个已逾期｜
            <strong style={{ color: BLUE }}> {newCustomers!.rows.length}</strong> 个新客户｜
            <strong style={{ color: GREEN }}> {decisions!.items.length}</strong> 件需要你处理
          </span>
        )}
      </div>

      {/* 1. 今日必须跟进 */}
      <Header label={`今日必须跟进 · ${today?.rows.length ?? '—'}`} />
      <div style={{ marginBottom: 24 }}>
        {!today ? (
          <EmptyRow text="加载中…" />
        ) : today.rows.length === 0 ? (
          <EmptyRow text="今天没有安排跟进的客户" />
        ) : (
          today.rows.map((c) => (
            <CustomerRow
              key={c.id}
              onClick={() => goCustomer(c.customer_name)}
              name={c.customer_name}
              chips={[
                ...(c.priority ? [{ label: c.priority, color: GOLD }] : []),
                ...(c.owner ? [{ label: c.owner, color: BLUE }] : []),
              ]}
              right={c.next_action || c.follow_up_notes || undefined}
            />
          ))
        )}
      </div>

      {/* 2. 逾期未跟进 */}
      <Header label={`逾期未跟进 · ${overdue?.rows.length ?? '—'}`} />
      <div style={{ marginBottom: 24 }}>
        {!overdue ? (
          <EmptyRow text="加载中…" />
        ) : overdue.rows.length === 0 ? (
          <EmptyRow text="没有逾期未跟进的客户" />
        ) : (
          overdue.rows.map((c) => (
            <CustomerRow
              key={c.id}
              onClick={() => goCustomer(c.customer_name)}
              name={c.customer_name}
              chips={[
                { label: `逾期${c.overdueDays}天`, color: RED },
                ...(c.owner ? [{ label: c.owner, color: BLUE }] : []),
              ]}
              right={c.next_action || c.follow_up_notes || undefined}
            />
          ))
        )}
      </div>

      {/* 3. 最近 7 天新客户 */}
      <Header label={`最近 7 天新客户 · ${newCustomers?.rows.length ?? '—'}`} />
      <div style={{ marginBottom: 24 }}>
        {!newCustomers ? (
          <EmptyRow text="加载中…" />
        ) : newCustomers.rows.length === 0 ? (
          <EmptyRow text="最近 7 天没有新增客户" />
        ) : (
          newCustomers.rows.map((c) => (
            <CustomerRow
              key={c.id}
              onClick={() => goCustomer(c.customer_name)}
              name={c.customer_name}
              chips={[
                ...(c.business_type ? [{ label: c.business_type, color: BLUE }] : []),
                ...(c.status ? [{ label: c.status, color: GOLD }] : []),
              ]}
              right={[c.source, c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ')}
            />
          ))
        )}
      </div>

      {/* 4. 需要老板决定 */}
      <Header label={`需要老板决定 · ${decisions?.items.length ?? '—'}`} />
      <div>
        {!decisions ? (
          <EmptyRow text="加载中…" />
        ) : decisions.items.length === 0 ? (
          <EmptyRow text="暂无需要你处理的事项" />
        ) : (
          decisions.items.map((it, i) => (
            <CustomerRow
              key={`${it.id}_${i}`}
              onClick={() => goCustomer(it.customerName)}
              name={it.customerName}
              chips={[{ label: it.reason, color: RED }]}
              right={it.detail}
            />
          ))
        )}
      </div>
    </div>
  );
}
