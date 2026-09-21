// 客户与项目 CRM 工作台 — the formal Supabase CRM page (crm_customers / crm_contacts / crm_followups / crm_projects).
// Everyday CRM work happens here: new customer, record follow-up, customer detail, stage and next-follow-up edits.
// GIA (Business Assistant) stays as the natural-language assistant entry, not the only one.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getCustomerDirectory, getTodaysFollowups, getOverdueFollowups, setCustomerActive,
  setCustomerPrimaryType, updateCustomerStage, updateCustomerNextFollowUp, crmDate, CRM_STAGES,
  type CrmCustomer, type CrmCustomerWithContact, type CrmOverdueCustomer, type CustomerPrimaryType,
} from '../lib/crmSupabase';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { CrmFollowupModal, type FollowupTarget } from '../components/crm/CrmFollowupModal';
import { CrmCustomerDrawer } from '../components/crm/CrmCustomerDrawer';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

// Nav final collapse (2026-09-16) — this page is now the "客户档案" first
// tab of the sidebar's 客户与项目 entry (a future 项目 tab would be a
// sibling of OUTER_TABS below, not built this round — no other content
// exists yet). VIEWS below is a separate, pre-existing inner tab strip
// (directory/today/overdue/archived) that stays exactly as it was.
type OuterTab = 'customerArchive';
const OUTER_TABS: { key: OuterTab; label: string }[] = [
  { key: 'customerArchive', label: '客户档案' },
];

type ViewKey = 'directory' | 'today' | 'overdue' | 'archived';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'directory', label: '客户名录' },
  { key: 'today', label: '今日跟进' },
  { key: 'overdue', label: '逾期跟进' },
  { key: 'archived', label: '已停用客户' },
];

// Task: CRM customer classification — 主要客户类型（单选，非多标签）。
// Separate from business_type ("业务线") and the legacy free-text
// customer_type column — see setCustomerPrimaryType in crmSupabase.ts.
type TypeFilterKey = 'all' | CustomerPrimaryType;

const TYPE_FILTERS: { key: TypeFilterKey; label: string }[] = [
  { key: 'all', label: '全部客户' },
  { key: 'project', label: '项目客户' },
  { key: 'trade', label: '批发 / 小贸易' },
  { key: 'services', label: '服务类' },
];

const PRIMARY_TYPE_LABEL: Record<CustomerPrimaryType, string> = {
  project: '项目客户 (Project)',
  trade: '批发 / 小贸易 (Wholesale & Small Trade)',
  services: '服务类 (Services)',
};
const UNCLASSIFIED_LABEL = '未分类 (Unclassified)';

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
  const [outerTab, setOuterTab] = useState<OuterTab>('customerArchive');
  const [view, setView] = useState<ViewKey>('directory');
  const [rows, setRows] = useState<CrmCustomerWithContact[] | CrmOverdueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all');
  const [typeBusy, setTypeBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [followupFor, setFollowupFor] = useState<FollowupTarget | null>(null);
  const [drawerRow, setDrawerRow] = useState<CrmCustomer | null>(null);
  const [drawerReload, setDrawerReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function handleTypeChange(id: string, value: string) {
    const next = (value || null) as CustomerPrimaryType | null;
    setTypeBusy(id);
    const res = await setCustomerPrimaryType(id, next);
    setTypeBusy(null);
    if (res.ok) {
      setRows((prev) => prev.map((r: any) => (r.id === id ? { ...r, customer_primary_type: next } : r)));
    }
  }

  const filteredRows = typeFilter === 'all'
    ? rows
    : (rows as any[]).filter((r) => r.customer_primary_type === typeFilter);

  // GIA is the assistant for natural-language work ("记录今天和 ABC 的沟通" …); it is no longer the only way to do CRM work.
  function openGia(name?: string) {
    navigate(name ? `/business-assistant?customer=${encodeURIComponent(name)}` : '/business-assistant');
  }

  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 3500);
  }

  function openFollowup(target: FollowupTarget | null) {
    setFollowupFor(target);
    setFollowupOpen(true);
  }

  /** replace one row in the current list with the saved customer (keeps the joined contacts) */
  function patchRow(saved: CrmCustomer) {
    setRows((prev) => (prev as any[]).map((r) => (r.id === saved.id ? { ...r, ...saved, crm_contacts: r.crm_contacts } : r)));
  }

  async function handleStage(id: string, value: string) {
    if (!value) return;
    setRowBusy(id); setActionError(null);
    const res = await updateCustomerStage(id, value);
    setRowBusy(null);
    if (!res.ok) { setActionError(res.error); return; }
    patchRow(res.customer);
  }

  async function handleNextDate(id: string, value: string) {
    setRowBusy(id); setActionError(null);
    const res = await updateCustomerNextFollowUp(id, value || null);
    setRowBusy(null);
    if (!res.ok) { setActionError(res.error); return; }
    // in the 今日/逾期 views a changed date can move the customer out of the list, so reload those
    if (view === 'today' || view === 'overdue') load(); else patchRow(res.customer);
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            客户与项目 CRM 工作台
          </h1>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>正式客户库 · 客户 / 联系人 / 跟进 / 项目</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E' }}
          >
            + 新增客户
          </button>
          <button
            onClick={() => openFollowup(null)}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: `1px solid ${GOLD}`, color: GOLD }}
          >
            + 记录跟进
          </button>
          <button
            onClick={() => openGia()}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: MUTED }}
          >
            GIA 智能助手
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {OUTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setOuterTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: outerTab === t.key ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${outerTab === t.key ? 'transparent' : BORD}`,
              color: outerTab === t.key ? '#080D1E' : MUTED,
              fontWeight: outerTab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(111,191,142,0.12)', border: '1px solid rgba(111,191,142,0.35)', color: GREEN, fontSize: 12.5 }}>{notice}</div>
      )}
      {actionError && (
        <div role="alert" style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(224,132,106,0.1)', border: '1px solid rgba(224,132,106,0.35)', color: RED, fontSize: 12.5 }}>{actionError}</div>
      )}

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: typeFilter === f.key ? 'rgba(203,168,92,0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${typeFilter === f.key ? GOLD : BORD}`,
              color: typeFilter === f.key ? GOLD : MUTED,
              fontWeight: typeFilter === f.key ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
      {error && <div style={{ fontSize: 13, color: RED }}>读取失败:{error}</div>}

      {!loading && !error && filteredRows.length === 0 && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          {rows.length > 0 ? '没有匹配该客户类型的记录。' : (view === 'archived' ? '没有已停用的客户。' : '暂无记录。')}
        </div>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['客户/公司', '联系人', '国家', '业务线', '客户类型', '阶段', '最近沟通', '下次跟进', 'Next Action', '负责人', '操作'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: GOLD, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.04em', borderBottom: `1px solid ${BORD}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => setDrawerRow(r)}
                  style={{ cursor: 'pointer', borderBottom: `1px solid ${BORD}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{r.customer_name}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{view === 'today' || view === 'overdue' ? (primaryContact(r) ?? '—') : primaryContact(r)}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.country || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.business_type || '—'}</td>
                  <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={r.customer_primary_type || ''}
                      disabled={typeBusy === r.id}
                      onChange={(e) => handleTypeChange(r.id, e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer',
                        background: r.customer_primary_type ? 'rgba(203,168,92,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${r.customer_primary_type ? GOLD : BORD}`,
                        color: r.customer_primary_type ? GOLD : MUTED,
                      }}
                    >
                      <option value="">{UNCLASSIFIED_LABEL}</option>
                      <option value="project">{PRIMARY_TYPE_LABEL.project}</option>
                      <option value="trade">{PRIMARY_TYPE_LABEL.trade}</option>
                      <option value="services">{PRIMARY_TYPE_LABEL.services}</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label="修改客户阶段"
                      value={r.status || ''}
                      disabled={rowBusy === r.id || view === 'archived'}
                      onChange={(e) => handleStage(r.id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: r.status ? TEXT : MUTED }}
                    >
                      {!r.status && <option value="">—</option>}
                      {(r.status && !CRM_STAGES.includes(r.status) ? [r.status, ...CRM_STAGES] : CRM_STAGES).map((s: string) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{fmtDate(r.last_follow_up_at)}</td>
                  <td style={{ padding: '10px 14px', color: view === 'overdue' ? RED : MUTED, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      aria-label="修改下次跟进日期"
                      type="date"
                      value={r.next_follow_up_at || ''}
                      min={crmDate(1)}
                      disabled={rowBusy === r.id || view === 'archived'}
                      onChange={(e) => handleNextDate(r.id, e.target.value)}
                      style={{ padding: '3px 6px', borderRadius: 7, fontSize: 11.5, background: 'rgba(255,255,255,0.04)', border: `1px solid ${view === 'overdue' ? RED : BORD}`, color: view === 'overdue' ? RED : MUTED, colorScheme: 'dark' }}
                    />
                    {view === 'overdue' && r.overdueDays ? <span style={{ marginLeft: 6, fontSize: 11 }}>逾期{r.overdueDays}天</span> : null}
                  </td>
                  <td style={{ padding: '10px 14px', color: MUTED, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.next_action || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.owner || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {view !== 'archived' && (
                      <>
                        <button
                          onClick={() => setDrawerRow(r)}
                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT, marginRight: 6 }}
                        >
                          详情
                        </button>
                        <button
                          onClick={() => openFollowup({ id: r.id, customer_name: r.customer_name })}
                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.12)', border: `1px solid ${GOLD}`, color: GOLD }}
                        >
                          + 跟进
                        </button>
                      </>
                    )}
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

      <CustomerCreateModal
        open={createOpen}
        extended
        onClose={() => setCreateOpen(false)}
        onCreated={(c) => {
          setCreateOpen(false);
          flash(`已新增客户「${c.customer_name}」`);
          if (view !== 'directory') setView('directory'); else load();
        }}
        onUseExisting={(existing) => {
          setCreateOpen(false);
          setDrawerRow(existing);
        }}
      />

      <CrmFollowupModal
        open={followupOpen}
        customer={followupFor}
        onClose={() => setFollowupOpen(false)}
        onSaved={(customerId) => {
          setFollowupOpen(false);
          flash('跟进已保存');
          load();
          setDrawerReload((n) => n + 1);
          // keep an open detail panel in sync with the customer's new last/next follow-up
          if (drawerRow && drawerRow.id === customerId) {
            const fresh = (rows as any[]).find((r) => r.id === customerId);
            if (fresh) setDrawerRow(fresh);
          }
        }}
      />

      <CrmCustomerDrawer
        customer={drawerRow}
        reloadKey={drawerReload}
        onClose={() => setDrawerRow(null)}
        onChanged={(saved) => { patchRow(saved); if (view === 'today' || view === 'overdue') load(); }}
        onAddFollowup={(c) => openFollowup({ id: c.id, customer_name: c.customer_name })}
        onOpenGia={(c) => openGia(c.customer_name)}
      />
    </div>
  );
}
