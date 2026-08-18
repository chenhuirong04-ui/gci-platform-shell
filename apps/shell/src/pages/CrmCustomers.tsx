// GCI Executive Desk — Task 17.2: the new正式 Supabase CRM page.
// Read-only list over crm_customers/crm_contacts/crm_followups — no create/
// edit forms here (GIA / Business Assistant remains the one write entry
// point). Clicking a row reuses the existing Customer 360 view instead of
// building a second detail page.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getCustomerDirectory, getTodaysFollowups, getOverdueFollowups, setCustomerActive,
  type CrmCustomerWithContact, type CrmOverdueCustomer,
} from '../lib/crmSupabase';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type ViewKey = 'directory' | 'today' | 'overdue' | 'archived';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'directory', label: '客户名录' },
  { key: 'today', label: '今日跟进' },
  { key: 'overdue', label: '逾期跟进' },
  { key: 'archived', label: '已停用客户' },
];

function primaryContact(row: CrmCustomerWithContact): string {
  const contacts = row.crm_contacts || [];
  const primary = contacts.find((c) => c.is_primary) || contacts[0];
  return primary?.contact_name || '—';
}

function fmtDate(d: string | null): string {
  return d || '—';
}

export function CrmCustomers() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>('directory');
  const [rows, setRows] = useState<CrmCustomerWithContact[] | CrmOverdueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    let res;
    if (view === 'directory') res = await getCustomerDirectory(true);
    else if (view === 'archived') res = await getCustomerDirectory(false);
    else if (view === 'today') res = await getTodaysFollowups();
    else res = await getOverdueFollowups();

    if (!res.ok) {
      setError(res.error);
      setRows([]);
    } else {
      setRows((res as any).rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function handleRestore(id: string) {
    setRestoreBusy(id);
    const res = await setCustomerActive(id, true);
    setRestoreBusy(null);
    if (res.ok) load();
  }

  function goToCustomer(name: string) {
    navigate(`/business-assistant?customer=${encodeURIComponent(name)}`);
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          客户与项目 · Supabase CRM
        </h1>
      </div>

      <div style={{ fontSize: 12, color: MUTED, marginBottom: 18 }}>
        新建客户或记录跟进请使用 GIA（Business Assistant）——这里是查看/轻量管理入口。
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: view === v.key ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${view === v.key ? 'transparent' : BORD}`,
              color: view === v.key ? '#080D1E' : MUTED,
              fontWeight: view === v.key ? 700 : 400,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
      {error && <div style={{ fontSize: 13, color: RED }}>读取失败:{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          {view === 'archived' ? '没有已停用的客户。' : '暂无记录。'}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['客户/公司', '联系人', '国家', '业务线', '状态', '最近沟通', '下次跟进', 'Next Action', '负责人', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: GOLD, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.04em', borderBottom: `1px solid ${BORD}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => goToCustomer(r.customer_name)}
                  style={{ cursor: 'pointer', borderBottom: `1px solid ${BORD}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{r.customer_name}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{view === 'today' || view === 'overdue' ? (primaryContact(r) ?? '—') : primaryContact(r)}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.country || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.business_type || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.status || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{fmtDate(r.last_follow_up_at)}</td>
                  <td style={{ padding: '10px 14px', color: view === 'overdue' ? RED : MUTED }}>
                    {fmtDate(r.next_follow_up_at)}{view === 'overdue' && r.overdueDays ? ` (逾期${r.overdueDays}天)` : ''}
                  </td>
                  <td style={{ padding: '10px 14px', color: MUTED, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.next_action || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.owner || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {view === 'archived' && (
                      <button
                        disabled={restoreBusy === r.id}
                        onClick={(e) => { e.stopPropagation(); handleRestore(r.id); }}
                        style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}
                      >
                        {restoreBusy === r.id ? '恢复中…' : '恢复客户'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
