/**
 * Customer detail panel of the CRM workbench (opens from a row): profile, contacts, projects and the recent follow-up log, plus the two
 * everyday edits — stage and next follow-up date — and "记录跟进". Reads/writes crm_customers, crm_contacts, crm_followups, crm_projects only.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  listFollowupsForCustomer, updateCustomerStage, updateCustomerNextFollowUp, crmDate, CRM_STAGES,
  type CrmCustomer, type CrmContact, type CrmFollowup,
} from '../../lib/crmSupabase';
import { listContactsForCustomer, listProjectsForCustomer, type CrmProject } from '../../lib/crmProjects';

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

const GOLD = '#CBA85C';
const MUTED = '#8A97B0';
const BORD = 'rgba(255,255,255,0.09)';
const SEL = { padding: '6px 10px', borderRadius: 8, fontSize: 12.5, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: '#E8F0FF', colorScheme: 'dark' as const };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: GOLD, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export function CrmCustomerDrawer({ customer, onClose, onChanged, onAddFollowup, onOpenGia, reloadKey }: Props) {
  const [c, setC] = useState<CrmCustomer | null>(customer);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [followups, setFollowups] = useState<CrmFollowup[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setC(customer); setMsg(''); }, [customer]);

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
      <span style={{ color: '#E8F0FF', minWidth: 0, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} role="dialog" aria-modal="true" aria-label="客户详情">
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.55)' }} />
      <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(460px, 100vw)', background: '#0E1628', borderLeft: `1px solid ${BORD}`, overflowY: 'auto', padding: '20px 22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#E8F0FF', wordBreak: 'break-word' }}>{c.customer_name}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{[c.country, c.owner].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button onClick={onClose} aria-label="关闭" style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <button onClick={() => onAddFollowup(c)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E' }}>+ 记录跟进</button>
          <button onClick={() => onOpenGia(c)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: MUTED }}>GIA 智能助手</button>
        </div>

        <Section title="阶段 与 下次跟进">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: MUTED }}>阶段
              <select aria-label="客户阶段" value={c.status || ''} disabled={busy} onChange={(e) => changeStage(e.target.value)} style={{ ...SEL, marginLeft: 8 }}>
                {!c.status && <option value="">未设置</option>}
                {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: MUTED }}>下次跟进
              <input aria-label="下次跟进日期" type="date" value={c.next_follow_up_at || ''} min={crmDate(1)} disabled={busy} onChange={(e) => changeNext(e.target.value)} style={{ ...SEL, marginLeft: 8 }} />
            </label>
          </div>
          {msg && <div style={{ fontSize: 12, color: '#E0846A', marginTop: 8 }}>{msg}</div>}
        </Section>

        <Section title="客户资料">
          {row('客户类型', c.customer_primary_type === 'project' ? '项目客户' : c.customer_primary_type === 'trade' ? '批发 / 小贸易' : c.customer_primary_type === 'services' ? '服务类' : '未分类')}
          {row('业务线', c.business_type)}
          {row('来源', c.source)}
          {row('优先级', c.priority)}
          {row('最近沟通', c.last_follow_up_at)}
          {row('下一步', c.next_action)}
        </Section>

        <Section title={`联系人 (${contacts.length})`}>
          {contacts.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>暂无联系人</div>}
          {contacts.map((k) => (
            <div key={k.id} style={{ fontSize: 12.5, color: '#E8F0FF', padding: '4px 0', borderBottom: `1px solid ${BORD}` }}>
              <b>{k.contact_name || '—'}</b>{k.is_primary ? <span style={{ color: GOLD, marginLeft: 6, fontSize: 10.5 }}>主要</span> : null}
              <div style={{ color: MUTED }}>{[k.phone, k.whatsapp && `WA ${k.whatsapp}`, k.email].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
        </Section>

        <Section title={`项目 (${projects.length})`}>
          {projects.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>暂无项目</div>}
          {projects.map((p) => (
            <div key={p.id} style={{ fontSize: 12.5, color: '#E8F0FF', padding: '4px 0', borderBottom: `1px solid ${BORD}` }}>
              {p.project_name}<span style={{ color: MUTED, marginLeft: 8 }}>{p.status}</span>
            </div>
          ))}
        </Section>

        <Section title={`跟进记录 (${followups.length})`}>
          {followups.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>还没有跟进记录</div>}
          {followups.map((f) => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11.5, color: GOLD }}>{f.follow_up_date}{f.next_follow_up_at ? `  →  下次 ${f.next_follow_up_at}` : ''}</div>
              <div style={{ fontSize: 12.5, color: '#E8F0FF', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.notes || '—'}</div>
              {f.next_action && <div style={{ fontSize: 12, color: MUTED }}>下一步：{f.next_action}</div>}
            </div>
          ))}
        </Section>
      </aside>
    </div>,
    document.body,
  );
}
