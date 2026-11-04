// 客户与项目 CRM 工作台 — the formal Supabase CRM page (crm_customers / crm_contacts / crm_followups / crm_projects).
// Everyday CRM work happens here: new customer, record follow-up, customer detail, stage and next-follow-up edits.
// GIA (Business Assistant) stays as the natural-language assistant entry, not the only one.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCustomerDirectory, getTodaysFollowups, getOverdueFollowups, setCustomerActive,
  setCustomerPrimaryType, updateCustomerStage, updateCustomerNextFollowUp, crmDate, CRM_STAGES,
  type CrmCustomer, type CrmCustomerWithContact, type CrmOverdueCustomer, type CustomerPrimaryType,
} from '../lib/crmSupabase';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { CrmFollowupModal, type FollowupTarget } from '../components/crm/CrmFollowupModal';
import { CrmCustomerDrawer } from '../components/crm/CrmCustomerDrawer';
import { nextFollowUpDateForSave } from '../lib/crmDateInput';
import { useI18n } from '@gci/i18n';
import { workspaceFontFamily } from '@gci/design-system';

// i18n: English for this page's fixed UI text (database values are never translated).
// LANG is set from the language context by the page component on every render.
let LANG: 'zh' | 'en' = 'zh';
const EN: Record<string, string> = {
  "客户名录": "Customer Directory",
  "今日跟进": "Today's Follow-ups",
  "逾期跟进": "Overdue Follow-ups",
  "已停用客户": "Inactive Customers",
  "全部客户": "All Customers",
  "项目客户": "Project Customers",
  "批发 / 小贸易": "Wholesale / Small Trade",
  "服务类": "Services",
  "项目客户 (Project)": "Project",
  "批发 / 小贸易 (Wholesale & Small Trade)": "Wholesale & Small Trade",
  "服务类 (Services)": "Services",
  "未分类 (Unclassified)": "Unclassified",
  "查看客户档案：": "View customer profile: ",
  "已新增客户「": "Customer added: ",
  "没有匹配该客户类型的记录。": "No records match this customer type.",
  "没有已停用的客户。": "No inactive customers.",
  "暂无记录。": "No records yet.",
  "客户/公司": "Customer / Company",
  "联系人": "Contact",
  "国家": "Country",
  "业务线": "Business Line",
  "客户类型": "Customer Type",
  "阶段": "Stage",
  "最近沟通": "Last Contact",
  "下次跟进": "Next Follow-up",
  "负责人": "Owner",
  "操作": "Actions",
  "恢复中…": "Restoring…",
  "恢复客户": "Restore",
  "跟进已保存": "Follow-up saved",
  "查看客户档案": "View customer profile",
  "修改客户阶段": "Change customer stage",
  "修改下次跟进日期": "Change next follow-up date",
  "← 返回": "← Back",
  "客户与项目 CRM 工作台": "Customers & Projects · CRM Workspace",
  "正式客户库 · 客户 / 联系人 / 跟进 / 项目": "Customer database · Customers / Contacts / Follow-ups / Projects",
  "+ 新增客户": "+ New Customer",
  "+ 记录跟进": "+ Log Follow-up",
  "GIA 智能助手": "GIA Assistant",
  "加载中…": "Loading…",
  "读取失败:": "Load failed: ",
  "查看档案 ›": "View profile ›",
  "逾期": "Overdue ",
  "天": "d",
  "详情": "Details",
  "+ 跟进": "+ Follow-up"
};
const tx = (zh: string): string => (LANG === 'en' ? EN[zh] ?? zh : zh);


const GOLD = '#7A5F2A';
const RED = '#C53030';
const GREEN = '#15803D';
const MUTED = '#475569';
const TEXT = '#0C1B3A';
const CARD = '#FFFFFF';
const BORD = 'rgba(12,27,58,0.07)';

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
  LANG = useI18n().lang; // keep tx() in sync with the language toggle
  const navigate = useNavigate();
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
  const deepLinkHandled = useRef(false);

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

  useEffect(() => {
    if (deepLinkHandled.current || rows.length === 0) return;
    const customerId = new URLSearchParams(window.location.search).get('customer_id');
    if (!customerId) return;
    const matched = (rows as CrmCustomer[]).find((row) => row.id === customerId);
    if (matched) {
      deepLinkHandled.current = true;
      setDrawerRow(matched);
    }
  }, [rows]);

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

  function handleNextDateBlur(id: string, persistedValue: string | null, inputValue: string) {
    const value = nextFollowUpDateForSave(inputValue, persistedValue);
    if (value === undefined) return;
    void handleNextDate(id, value || '');
  }

  return (
    <div style={{ background: '#F5F6FA', minHeight: 'calc(100vh - var(--header-h))', color: '#0C1B3A', fontFamily: workspaceFontFamily }}>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(12,27,58,0.05)', border: '1px solid rgba(12,27,58,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          {tx('← 返回')}
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {tx('客户与项目 CRM 工作台')}
          </h1>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>{tx('正式客户库 · 客户 / 联系人 / 跟进 / 项目')}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#080D1E', border: 'none', color: '#FFFFFF' }}
          >
            {tx('+ 新增客户')}
          </button>
          <button
            onClick={() => openFollowup(null)}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: `1px solid ${GOLD}`, color: GOLD }}
          >
            {tx('+ 记录跟进')}
          </button>
          <button
            onClick={() => openGia()}
            style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: 'rgba(12,27,58,0.05)', border: `1px solid ${BORD}`, color: MUTED }}
          >
            {tx('GIA 智能助手')}
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(111,191,142,0.12)', border: '1px solid rgba(111,191,142,0.35)', color: GREEN, fontSize: 12.5 }}>{notice}</div>
      )}
      {actionError && (
        <div role="alert" style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(224,132,106,0.1)', border: '1px solid rgba(224,132,106,0.35)', color: RED, fontSize: 12.5 }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: view === v.key ? '#080D1E' : 'rgba(12,27,58,0.04)',
              border: `1px solid ${view === v.key ? 'transparent' : BORD}`,
              color: view === v.key ? '#FFFFFF' : MUTED,
              fontWeight: view === v.key ? 700 : 400,
            }}
          >
            {tx(v.label)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: typeFilter === f.key ? 'rgba(203,168,92,0.18)' : 'rgba(12,27,58,0.03)',
              border: `1px solid ${typeFilter === f.key ? GOLD : BORD}`,
              color: typeFilter === f.key ? GOLD : MUTED,
              fontWeight: typeFilter === f.key ? 700 : 400,
            }}
          >
            {tx(f.label)}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: MUTED }}>{tx('加载中…')}</div>}
      {error && <div style={{ fontSize: 13, color: RED }}>{tx('读取失败:')}{error}</div>}

      {!loading && !error && filteredRows.length === 0 && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          {rows.length > 0 ? tx('没有匹配该客户类型的记录。') : (view === 'archived' ? tx('没有已停用的客户。') : tx('暂无记录。'))}
        </div>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(12,27,58,0.03)' }}>
                {[tx('客户/公司'), tx('联系人'), tx('国家'), tx('业务线'), tx('客户类型'), tx('阶段'), tx('最近沟通'), tx('下次跟进'), (LANG === 'en' ? 'Next Action' : '下一步行动'), tx('负责人'), tx('操作')].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: GOLD, fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: `1px solid ${BORD}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => setDrawerRow(r)}
                  style={{ cursor: 'pointer', borderBottom: `1px solid ${BORD}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(12,27,58,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* The name is the visible "open profile" entry — the 详情 button sits in the last column, off-screen on a laptop-width table. */}
                  <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setDrawerRow(r)}
                      title={tx('查看客户档案')}
                      aria-label={`${tx('查看客户档案：')}${r.customer_name}`}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: TEXT, fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit' }}
                    >
                      <span style={{ textDecoration: 'underline', textDecorationColor: 'rgba(203,168,92,0.5)', textUnderlineOffset: 3 }}>{r.customer_name}</span>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: GOLD, marginTop: 2 }}>{tx('查看档案 ›')}</span>
                    </button>
                  </td>
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
                        background: r.customer_primary_type ? 'rgba(203,168,92,0.1)' : 'rgba(12,27,58,0.04)',
                        border: `1px solid ${r.customer_primary_type ? GOLD : BORD}`,
                        color: r.customer_primary_type ? GOLD : MUTED,
                      }}
                    >
                      <option value="">{tx(UNCLASSIFIED_LABEL)}</option>
                      <option value="project">{tx(PRIMARY_TYPE_LABEL.project)}</option>
                      <option value="trade">{tx(PRIMARY_TYPE_LABEL.trade)}</option>
                      <option value="services">{tx(PRIMARY_TYPE_LABEL.services)}</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label={tx('修改客户阶段')}
                      value={r.status || ''}
                      disabled={rowBusy === r.id || view === 'archived'}
                      onChange={(e) => handleStage(r.id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: r.status ? TEXT : MUTED }}
                    >
                      {!r.status && <option value="">—</option>}
                      {(r.status && !CRM_STAGES.includes(r.status) ? [r.status, ...CRM_STAGES] : CRM_STAGES).map((s: string) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{fmtDate(r.last_follow_up_at)}</td>
                  <td style={{ padding: '10px 14px', color: view === 'overdue' ? RED : MUTED, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      key={`${r.id}:${r.next_follow_up_at || ''}`}
                      aria-label={tx('修改下次跟进日期')}
                      type="date"
                      defaultValue={r.next_follow_up_at || ''}
                      min={crmDate(1)}
                      disabled={rowBusy === r.id || view === 'archived'}
                      onBlur={(e) => handleNextDateBlur(r.id, r.next_follow_up_at || null, e.currentTarget.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ padding: '3px 6px', borderRadius: 7, fontSize: 11.5, background: 'rgba(12,27,58,0.04)', border: `1px solid ${view === 'overdue' ? RED : BORD}`, color: view === 'overdue' ? RED : MUTED, colorScheme: 'dark' }}
                    />
                    {view === 'overdue' && r.overdueDays ? <span style={{ marginLeft: 6, fontSize: 11 }}>{tx('逾期')}{r.overdueDays}{tx('天')}</span> : null}
                  </td>
                  <td style={{ padding: '10px 14px', color: MUTED, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.next_action || '—'}</td>
                  <td style={{ padding: '10px 14px', color: MUTED }}>{r.owner || '—'}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {view !== 'archived' && (
                      <>
                        <button
                          onClick={() => setDrawerRow(r)}
                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(12,27,58,0.05)', border: `1px solid ${BORD}`, color: TEXT, marginRight: 6 }}
                        >
                          {tx('详情')}
                        </button>
                        <button
                          onClick={() => openFollowup({ id: r.id, customer_name: r.customer_name })}
                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.12)', border: `1px solid ${GOLD}`, color: GOLD }}
                        >
                          {tx('+ 跟进')}
                        </button>
                      </>
                    )}
                    {view === 'archived' && (
                      <button
                        disabled={restoreBusy === r.id}
                        onClick={(e) => { e.stopPropagation(); handleRestore(r.id); }}
                        style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}
                      >
                        {restoreBusy === r.id ? tx('恢复中…') : tx('恢复客户')}
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
        onCreated={(c, _contact, notice) => {
          setCreateOpen(false);
          flash(notice || (LANG === 'en' ? `Customer added: ${c.customer_name}` : `已新增客户「${c.customer_name}」`));
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
          flash(tx('跟进已保存'));
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
    </div>
  );
}
