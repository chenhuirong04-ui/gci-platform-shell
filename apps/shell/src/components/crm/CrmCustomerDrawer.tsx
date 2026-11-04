/**
 * Customer detail panel of the CRM workbench (opens from a row): profile, contacts, projects and the recent follow-up log, plus the two
 * everyday edits — stage and next follow-up date — and "记录跟进". Reads/writes crm_customers, crm_contacts, crm_followups, crm_projects only.
 * Tabs 客户文件 / 合规事项 / 公司人员 open the customer's file archive (CrmCustomerFiles, owned by crm_customers.id); the panel widens for them.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  listFollowupsForCustomer, updateCustomerStage, updateCustomerNextFollowUp, crmDate, CRM_STAGES,
  type CrmCustomer, type CrmContact, type CrmFollowup,
} from '../../lib/crmSupabase';
import { listContactsForCustomer, listProjectsForCustomer, type CrmProject } from '../../lib/crmProjects';
import { CrmCustomerFiles, type CrmFilesTab } from './CrmCustomerFiles';
import { zIndex, workspaceFontFamily } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

// i18n: English for this page's fixed UI text (database values are never translated).
// LANG is set from the language context by the page component on every render.
let LANG: 'zh' | 'en' = 'zh';
const EN: Record<string, string> = {
  "联系人 (": "Contacts (",
  "项目 (": "Projects (",
  "跟进记录 (": "Follow-ups (",
  "→  下次": "→  next",
  "客户概况": "Overview",
  "客户文件": "Documents",
  "合规事项": "Compliance",
  "公司人员": "People",
  "客户类型": "Customer type",
  "项目客户": "Project customer",
  "批发 / 小贸易": "Wholesale / Small trade",
  "服务类": "Services",
  "未分类": "Unclassified",
  "业务线": "Business line",
  "来源": "Source",
  "优先级": "Priority",
  "最近沟通": "Last contact",
  "下一步": "Next step",
  "客户详情": "Customer details",
  "关闭": "Close",
  "客户档案": "Customer profile",
  "阶段 与 下次跟进": "Stage & next follow-up",
  "客户阶段": "Customer stage",
  "下次跟进日期": "Next follow-up date",
  "客户资料": "Customer info",
  "+ 记录跟进": "+ Log follow-up",
  "GIA 智能助手": "GIA Assistant",
  "阶段": "Stage",
  "未设置": "Not set",
  "下次跟进": "Next follow-up",
  "暂无联系人": "No contacts yet",
  "主要": "Primary",
  "暂无项目": "No projects yet",
  "还没有跟进记录": "No follow-ups yet",
  "下一步：": "Next step: "
};
const tx = (zh: string): string => (LANG === 'en' ? EN[zh] ?? zh : zh);


interface Props {
  customer: CrmCustomer | null;
  onClose: () => void;
  /** a stage / next-follow-up change was saved (the list should refresh) */
  onChanged: (customer: CrmCustomer) => void;
  onAddFollowup: (customer: CrmCustomer) => void;
  onOpenGia: (customer: CrmCustomer) => void;
  /** bumped by the page after a follow-up was saved, so the log reloads */
  reloadKey: number;
}

const GOLD = '#7A5F2A';
const MUTED = '#475569';
const BORD = 'rgba(12,27,58,0.09)';
const SEL = { padding: '6px 10px', borderRadius: 8, fontSize: 12.5, background: 'rgba(12,27,58,0.05)', border: `1px solid ${BORD}`, color: '#0C1B3A', colorScheme: 'dark' as const };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: GOLD, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export function CrmCustomerDrawer({ customer, onClose, onChanged, onAddFollowup, onOpenGia, reloadKey }: Props) {
  LANG = useI18n().lang; // keep tx() in sync with the language toggle
  const [c, setC] = useState<CrmCustomer | null>(customer);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [followups, setFollowups] = useState<CrmFollowup[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'overview' | CrmFilesTab>('overview');

  useEffect(() => { setC(customer); setMsg(''); }, [customer]);
  useEffect(() => { setTab('overview'); }, [customer?.id]);

  useEffect(() => {
    if (!customer) return;
    let alive = true;
    listContactsForCustomer(customer.id).then((r) => alive && setContacts(r));
    listProjectsForCustomer(customer.id).then((r) => alive && setProjects(r));
    listFollowupsForCustomer(customer.id, 20).then((r) => alive && setFollowups(r.ok ? r.rows : []));
    return () => { alive = false; };
  }, [customer?.id, reloadKey]);

  if (!c) return null;

  const stageOptions = c.status && !CRM_STAGES.includes(c.status) ? [c.status, ...CRM_STAGES] : CRM_STAGES;

  const changeStage = async (status: string) => {
    if (!status || status === c.status) return;
    setBusy(true); setMsg('');
    const res = await updateCustomerStage(c.id, status);
    setBusy(false);
    if (!res.ok) { setMsg(res.error); return; }
    setC(res.customer); onChanged(res.customer);
  };
  const changeNext = async (date: string) => {
    setBusy(true); setMsg('');
    const res = await updateCustomerNextFollowUp(c.id, date || null);
    setBusy(false);
    if (!res.ok) { setMsg(res.error); return; }
    setC(res.customer); onChanged(res.customer);
  };

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
      <span style={{ width: 84, flexShrink: 0, color: MUTED }}>{label}</span>
      <span style={{ color: '#0C1B3A', minWidth: 0, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: zIndex.drawer, fontFamily: workspaceFontFamily }} role="dialog" aria-modal="true" aria-label={tx('客户详情')}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,13,30,0.5)' }} />
      <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: tab === 'overview' ? 'min(460px, 100vw)' : 'min(960px, 100vw)', background: '#FFFFFF', borderLeft: `1px solid ${BORD}`, overflowY: 'auto', padding: '20px 22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0C1B3A', wordBreak: 'break-word' }}>{c.customer_name}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{[c.country, c.owner].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button onClick={onClose} aria-label={tx('关闭')} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <button onClick={() => onAddFollowup(c)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#080D1E', border: 'none', color: '#FFFFFF' }}>{tx('+ 记录跟进')}</button>
          <button onClick={() => onOpenGia(c)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: 'rgba(12,27,58,0.05)', border: `1px solid ${BORD}`, color: MUTED }}>{tx('GIA 智能助手')}</button>
        </div>

        <div role="tablist" aria-label={tx('客户档案')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: `1px solid ${BORD}`, paddingBottom: 10 }}>
          {([['overview', tx('客户概况')], ['documents', tx('客户文件')], ['compliance', tx('合规事项')], ['persons', tx('公司人员')]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontWeight: tab === k ? 700 : 400,
                background: tab === k ? 'rgba(203,168,92,0.16)' : 'transparent', border: `1px solid ${tab === k ? GOLD : BORD}`, color: tab === k ? GOLD : MUTED }}>
              {label}
            </button>
          ))}
        </div>

        {tab !== 'overview' && (
          <CrmCustomerFiles crmCustomerId={c.id} customerName={c.customer_name} tab={tab} onTabChange={setTab} />
        )}

        {tab === 'overview' && (<>

        <Section title={tx('阶段 与 下次跟进')}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: MUTED }}>{tx('阶段')}
              <select aria-label={tx('客户阶段')} value={c.status || ''} disabled={busy} onChange={(e) => changeStage(e.target.value)} style={{ ...SEL, marginLeft: 8 }}>
                {!c.status && <option value="">{tx('未设置')}</option>}
                {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: MUTED }}>{tx('下次跟进')}
              <input aria-label={tx('下次跟进日期')} type="date" value={c.next_follow_up_at || ''} min={crmDate(1)} disabled={busy} onChange={(e) => changeNext(e.target.value)} style={{ ...SEL, marginLeft: 8 }} />
            </label>
          </div>
          {msg && <div style={{ fontSize: 12, color: '#C53030', marginTop: 8 }}>{msg}</div>}
        </Section>

        <Section title={tx('客户资料')}>
          {row(tx('客户类型'), c.customer_primary_type === 'project' ? tx('项目客户') : c.customer_primary_type === 'trade' ? tx('批发 / 小贸易') : c.customer_primary_type === 'services' ? tx('服务类') : tx('未分类'))}
          {row(tx('业务线'), c.business_type)}
          {row(tx('来源'), c.source)}
          {row(tx('优先级'), c.priority)}
          {row(tx('最近沟通'), c.last_follow_up_at)}
          {row(tx('下一步'), c.next_action)}
        </Section>

        <Section title={`${tx('联系人 (')}${contacts.length})`}>
          {contacts.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>{tx('暂无联系人')}</div>}
          {contacts.map((k) => (
            <div key={k.id} style={{ fontSize: 12.5, color: '#0C1B3A', padding: '4px 0', borderBottom: `1px solid ${BORD}` }}>
              <b>{k.contact_name || '—'}</b>{k.is_primary ? <span style={{ color: GOLD, marginLeft: 6, fontSize: 10.5 }}>{tx('主要')}</span> : null}
              <div style={{ color: MUTED }}>{[k.phone, k.whatsapp && `WA ${k.whatsapp}`, k.email].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
        </Section>

        <Section title={`${tx('项目 (')}${projects.length})`}>
          {projects.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>{tx('暂无项目')}</div>}
          {projects.map((p) => (
            <div key={p.id} style={{ fontSize: 12.5, color: '#0C1B3A', padding: '4px 0', borderBottom: `1px solid ${BORD}` }}>
              {p.project_name}<span style={{ color: MUTED, marginLeft: 8 }}>{p.status}</span>
            </div>
          ))}
        </Section>

        <Section title={`${tx('跟进记录 (')}${followups.length})`}>
          {followups.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>{tx('还没有跟进记录')}</div>}
          {followups.map((f) => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11.5, color: GOLD }}>{f.follow_up_date}{f.next_follow_up_at ? `  ${tx('→  下次')} ${f.next_follow_up_at}` : ''}</div>
              <div style={{ fontSize: 12.5, color: '#0C1B3A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.notes || '—'}</div>
              {f.next_action && <div style={{ fontSize: 12, color: MUTED }}>{tx('下一步：')}{f.next_action}</div>}
            </div>
          ))}
        </Section>
        </>)}
      </aside>
    </div>,
    document.body,
  );
}
