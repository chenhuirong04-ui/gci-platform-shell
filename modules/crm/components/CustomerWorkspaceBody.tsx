/**
 * CustomerWorkspaceBody — reusable customer detail body.
 *
 * Extracted from the former QuickFollowUpPanel drawer (see git history) so
 * the standalone /crm/customer/:customerCode page and any future embed can
 * share one implementation instead of maintaining two parallel detail UIs.
 * All upload / quote-history / follow-up-save / business-create logic below
 * is the SAME logic the top-level workspace action buttons call into —
 * there is no second form or upload surface anywhere in this component.
 *
 * Notion write-back scope (unchanged):
 *   ✅ 关闭本次跟进 → Notion 行动状态=暂缓 (via /api/crm/notion-update, handled by caller)
 *   ⚠️ Other edits → localStorage + Supabase snapshot only
 */

import React, { useState, useRef } from 'react';
import type { FollowUpTask, Proposal } from '../types';
import { uploadFileToDrive } from '../services/driveService';
import { isRealCommLog } from '../utils/commLog';
import {
  MessageSquare, Calendar, Phone, Mail, MapPin,
  User, Clock, Building2, Save, XCircle, Plus,
  Paperclip, FileText, ChevronDown, ChevronUp, UploadCloud, ExternalLink,
} from 'lucide-react';
import { isLikelyNotionPageId } from '../utils/notionId';

const BG    = '#0A1628';
const CARD2 = '#162A45';
const BORD  = 'rgba(255,255,255,0.09)';
const GOLD  = '#B8960C';
const T1    = '#E8F0FF';
const T2    = '#7A9CC5';
const T3    = '#4A6080';

const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];
const OWNERS  = ['Chris', 'Lili', 'Jeffrey', 'Yang', '待分配'];
const BIZ_TYPES = [
  { value: 'TRADE',    label: '贸易询盘' },
  { value: 'PROJECT',  label: '项目推进' },
  { value: 'LOG_ONLY', label: '内部记录' },
];
const TYPE_LABEL: Record<string, string> = {
  TRADE: '贸易询盘', PROJECT: '项目推进', LOG_ONLY: '内部记录',
};

export type WorkspaceTab = 'info' | 'business' | 'action' | 'files' | 'quotes';

// Full workspace i18n surface — shared with CustomerWorkspacePage.tsx (the
// page passes the same dict.crm.workspace object down to both itself and
// this component so every static label in the workspace goes through
// useI18n(), not hardcoded Chinese).
export interface WorkspaceDict {
  na: string;
  tabInfo: string; tabBusiness: string; tabComms: string; tabFiles: string; tabQuotes: string; tabFinance: string;
  backToList: string;
  actionAddComm: string; actionAddBusiness: string; actionUploadFiles: string; actionEditProfile: string;
  loading: string; notFoundTitle: string; notFoundDesc: string;
  customerCode: string; customerName: string; customerType: string; countryCity: string;
  contactPerson: string; position: string; phone: string; whatsapp: string; email: string;
  customerSource: string; currentStage: string; owner: string; lastComm: string; lastUpdated: string;
  mainRequirement: string; notes: string;
  editModeBanner: string; editSyncNotice: string; fieldClientName: string; fieldOwner: string;
  selectOwnerPlaceholder: string; fieldBusinessType: string; fieldGoal: string; goalPlaceholder: string;
  fieldLastContext: string; lastContextPlaceholder: string; fieldNextFollowUp: string;
  contactSectionTitle: string; fieldWhatsapp: string; fieldPhone: string; fieldEmail: string; fieldCity: string;
  contactPlaceholder: string; emailPlaceholder: string; cityPlaceholder: string;
  saveChanges: string; cancel: string;
  notionSyncedOk: string; notionSyncing: string; notionNoId: string; notionWarn: string;
  goalNextStep: string; recentFollowUp: string; noNotes: string; whatsappPhone: string;
  contactMissing: string; emailMissing: string; cityMissing: string; ownerMissing: string;
  createdAt: string; updatedAt: string; filesRowLabel: string; filesCount: string; filesEmpty: string;
  historyTitle: string; notionConnectedNote: string;
  relatedBusinessesLabel: string; currentBadge: string; unnamedBusiness: string; noOtherBusiness: string;
  addBusinessBtn: string; newBusinessTitle: string; createBusinessBtn: string;
  newCommTitle: string; contentPlaceholder: string; saveComm: string; savedBadge: string; recentRecords: string;
  quotesOf: string; refresh: string; loadingQuotes: string; quotesLoadFailed: string; noQuotesFound: string;
  quoteSummary: string; clickToLoadQuotes: string; quoteType: string; currency: string;
  relatedBusiness: string; viewQuoteFile: string;
  scopeLabel: string; scopeCustomer: string; scopeBusiness: string; scopeBoth: string; selectBusinessLabel: string;
  categoryLabel: string; catCompanyDocs: string; catContactIdentity: string; catProductRequirements: string;
  catBusinessDocs: string; catCommsEvidence: string; catOtherDocs: string;
  catLegacyProposal: string; catLegacyContract: string; catLegacyProject: string; catLegacyOther: string;
  notesOptionalLabel: string; notesPlaceholderExample: string; dropzoneUploading: string; dropzoneCta: string;
  dropzoneTypes: string; selectFileBtn: string; uploadingToDrive: string; uploadedOk: string; uploadFailed: string;
  filesListTitle: string; uploadedByLabel: string; associatedCustomer: string; associatedBusiness: string;
  customerLevelTag: string; sourceLabel: string; notesRowLabel: string; viewDownload: string; uploadFailedTag: string;
  financeTitle: string; financeLoading: string; financeEmpty: string; financeError: string; financeNote: string;
  sectionInvoices: string; sectionOrders: string; sectionConsignment: string; sectionDeposit: string; depositEmpty: string;
  invoiceNo: string; invoiceAmount: string; invoiceStatus: string; invoiceDate: string; dueDate: string;
  orderGrandTotal: string; orderPaid: string; orderOutstanding: string; orderOverdue: string;
  consignmentProduct: string; consignmentValue: string;
}

interface Props {
  task: FollowUpTask;
  relatedTasks?: FollowUpTask[];
  tab: WorkspaceTab;
  onTabChange: (t: WorkspaceTab) => void;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  showAddBusinessForm: boolean;
  onShowAddBusinessFormChange: (v: boolean) => void;
  dict: WorkspaceDict;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask?: (task: FollowUpTask) => void;
  onUpdateAnyTask?: (task: FollowUpTask) => void;
  onSwitchTask?: (task: FollowUpTask) => void;
  onCreateBusiness?: (formData: Partial<FollowUpTask>) => void;
}

const inputStyle: React.CSSProperties = {
  background: CARD2, border: `1px solid ${BORD}`, color: T1,
  borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 600,
  width: '100%', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: T3, marginBottom: '4px', display: 'block',
};

function tpl(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);
}

function InfoRow({ icon, label, value, empty, onClick }: {
  icon: React.ReactNode; label: string; value?: string | null; empty?: string; onClick?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${BORD}`, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="shrink-0 mt-0.5" style={{ color: T3 }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div style={labelStyle}>{label}</div>
        <div className="text-sm font-medium break-words" style={{ color: value ? T1 : T3 }}>{value || empty || '—'}</div>
      </div>
    </div>
  );
}

export default function CustomerWorkspaceBody({
  task, relatedTasks = [], tab, onTabChange, editing, onEditingChange,
  showAddBusinessForm, onShowAddBusinessFormChange, dict,
  onSave, onUpdateTask, onUpdateAnyTask, onSwitchTask, onCreateBusiness,
}: Props) {
  const typeLabel = TYPE_LABEL[task.businessType || 'TRADE'] ?? '贸易询盘';

  const [proposalUploadStatus, setProposalUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'fail'>('idle');
  const [isDraggingProposal, setIsDraggingProposal] = useState(false);
  const proposalInputRef = useRef<HTMLInputElement>(null);
  const [fileCategory, setFileCategory] = useState<NonNullable<Proposal['category']>>('company_docs');
  const [fileScope, setFileScope] = useState<'customer' | 'business' | 'both'>('customer');
  const [targetTaskId, setTargetTaskId] = useState<string>(task.id);
  const [fileNotes, setFileNotes] = useState('');
  const allCustomerTasks = [task, ...relatedTasks];

  const FILE_CATEGORY_LABELS: Record<string, string> = {
    company_docs: dict.catCompanyDocs, contact_identity: dict.catContactIdentity,
    product_requirements: dict.catProductRequirements, business_docs: dict.catBusinessDocs,
    comms_evidence: dict.catCommsEvidence, other_docs: dict.catOtherDocs,
    proposal: dict.catLegacyProposal, contract: dict.catLegacyContract,
    project_doc: dict.catLegacyProject, other: dict.catLegacyOther,
  };

  const handleProposalFiles = async (files: File[]) => {
    const file = files[0];
    const targetTask = allCustomerTasks.find(t => t.id === targetTaskId) || task;
    const updateTarget = targetTask.id === task.id ? onUpdateTask : (onUpdateAnyTask || onUpdateTask);
    if (!file || !updateTarget) return;
    setProposalUploadStatus('uploading');

    const reader = new FileReader();
    reader.onerror = () => setProposalUploadStatus('fail');
    reader.onload = async (ev) => {
      const dataURL = ev.target?.result as string;
      const propId = `PROP_${Date.now()}`;
      const uploadedAt = new Date().toISOString();
      const newProposal: Proposal = {
        id: propId, name: file.name, mimeType: file.type,
        size: file.size, uploadedAt, uploadStatus: 'uploading',
        category: fileCategory, scope: fileScope, source: '手动上传',
        notes: fileNotes.trim() || undefined,
      };
      const currentProposals = targetTask.proposals || [];
      const withNew = [...currentProposals, newProposal];
      updateTarget({ ...targetTask, proposals: withNew });

      try {
        const result = await uploadFileToDrive(
          { id: propId, name: file.name, type: file.type, data: dataURL, size: file.size, uploadedAt, isAnalyzed: false },
          { businessType: targetTask.businessType, clientName: targetTask.clientName }
        );
        if (result.ok && result.driveUrl) {
          const finalProposals = withNew.map(p => p.id === propId ? { ...p, driveUrl: result.driveUrl, uploadStatus: 'uploaded' as const } : p);
          updateTarget({ ...targetTask, proposals: finalProposals });
          setProposalUploadStatus('ok');
          setFileNotes('');
        } else {
          const finalProposals = withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p);
          updateTarget({ ...targetTask, proposals: finalProposals });
          setProposalUploadStatus('fail');
        }
      } catch {
        const finalProposals = withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p);
        updateTarget({ ...targetTask, proposals: finalProposals });
        setProposalUploadStatus('fail');
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Quote history state — same endpoint/shape as before, unmodified ──────
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  const loadQuoteHistory = async () => {
    if (!task.clientName || quoteData !== null) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/ai/quotation-history?customer=${encodeURIComponent(task.clientName)}`);
      const data = await res.json();
      setQuoteData(data);
    } catch { setQuoteData({ ok: false, error: 'failed' }); }
    finally { setQuoteLoading(false); }
  };

  const [draft, setDraft] = useState<Partial<FollowUpTask>>({});
  type NotionSync = 'idle' | 'syncing' | 'ok' | 'warn' | 'no_id';
  const [notionSync, setNotionSync] = useState<NotionSync>('idle');

  const openEdit = () => {
    setNotionSync('idle');
    setDraft({
      clientName: task.clientName, countryCity: task.countryCity, owner: task.owner,
      businessType: task.businessType, goal: task.goal, lastContext: task.lastContext,
      nextFollowUpAt: task.nextFollowUpAt, phoneE164: task.phoneE164,
      whatsapp: task.whatsapp, email: task.email,
    });
    onEditingChange(true);
  };

  const cancelEdit = () => { onEditingChange(false); setDraft({}); setNotionSync('idle'); };

  const saveEdit = async () => {
    if (!onUpdateTask) { onEditingChange(false); return; }
    const rawNfa = draft.nextFollowUpAt ?? task.nextFollowUpAt;
    const normalizedNfa = rawNfa && /^\d{4}-\d{2}-\d{2}$/.test(rawNfa) ? rawNfa + 'T00:00:00.000Z' : rawNfa;
    const updated: FollowUpTask = { ...task, ...draft, nextFollowUpAt: normalizedNfa ?? task.nextFollowUpAt, updatedAt: new Date().toISOString() };

    onUpdateTask(updated);
    onEditingChange(false);
    setDraft({});

    const notionPageId = (task as any).notionFollowupPageId || task.leadId;
    if (!isLikelyNotionPageId(notionPageId)) { setNotionSync('no_id'); return; }

    setNotionSync('syncing');
    try {
      const res = await fetch('/api/crm/notion-update-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: notionPageId, nextFollowUpAt: updated.nextFollowUpAt, lastNote: updated.lastContext,
          inquirySummary: updated.goal, owner: updated.owner, businessType: updated.businessType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setNotionSync(data.ok ? 'ok' : 'warn');
    } catch {
      setNotionSync('warn');
    }
  };

  const set = (k: keyof FollowUpTask, v: string) => setDraft(prev => ({ ...prev, [k]: v }));

  const [method, setMethod] = useState(METHODS[0]);
  const [content, setContent] = useState('');
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saved, setSaved] = useState(false);

  const handleSaveNote = () => {
    if (!content.trim()) return;
    onSave(task.id, { method, content: content.trim(), nextDate });
    setSaved(true);
    setTimeout(() => { setSaved(false); setContent(''); }, 1400);
  };

  // Real human/customer communications only — same allow-list used by
  // Business Overview's "最近沟通" so system audit entries (record created,
  // AI analysis finished, status changes) never show up as if they were a
  // conversation with the customer.
  const recentHistory = (task.history || []).filter(isRealCommLog).slice(0, 3);

  // ── New business (inline form) ────────────────────────────────────────
  const [newBizType, setNewBizType] = useState<'TRADE' | 'PROJECT'>('TRADE');
  const [newBizGoal, setNewBizGoal] = useState('');
  const [newBizContext, setNewBizContext] = useState('');
  const [newBizNextDate, setNewBizNextDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [newBizSaving, setNewBizSaving] = useState(false);

  const handleCreateBusiness = async () => {
    if (!newBizGoal.trim() || !onCreateBusiness) return;
    setNewBizSaving(true);
    try {
      await onCreateBusiness({
        clientName: task.clientName,
        phoneE164: task.phoneE164,
        whatsapp: task.whatsapp,
        email: task.email,
        countryCity: task.countryCity,
        businessType: newBizType,
        goal: newBizGoal.trim(),
        lastContext: newBizContext.trim(),
        nextFollowUpAt: newBizNextDate,
      } as any);
      setNewBizGoal(''); setNewBizContext('');
      onShowAddBusinessFormChange(false);
    } finally {
      setNewBizSaving(false);
    }
  };

  return (
    <div>
      {/* Tabs */}
      {!editing && (
        <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl max-w-3xl" style={{ background: CARD2 }}>
          {([
            ['info', dict.tabInfo],
            ['business', dict.tabBusiness],
            ['action', dict.tabComms],
            ['files', dict.tabFiles],
            ['quotes', dict.tabQuotes],
          ] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => { onTabChange(key); if (key === 'quotes') loadQuoteHistory(); if (key === 'files') setProposalUploadStatus('idle'); }}
              className="flex-1 py-2 rounded-lg text-[12px] font-black transition-all whitespace-nowrap px-2"
              style={tab === key ? { background: GOLD, color: '#fff' } : { color: T3 }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="mb-4 text-xs font-black px-3 py-1.5 rounded-xl inline-block" style={{ background: `${GOLD}15`, color: GOLD }}>
          {dict.editModeBanner}
        </div>
      )}

      {/* ── EDIT MODE ───── */}
      {editing && (
        <div className="space-y-4 max-w-xl">
          <div className="p-3 rounded-xl text-xs font-medium" style={{ background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
            {dict.editSyncNotice}
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldClientName}</label>
            <input value={draft.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder={dict.fieldClientName} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldOwner}</label>
            <select value={draft.owner || ''} onChange={e => set('owner', e.target.value)} style={inputStyle}>
              <option value="">{dict.selectOwnerPlaceholder}</option>
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldBusinessType}</label>
            <select value={draft.businessType || 'TRADE'} onChange={e => set('businessType' as any, e.target.value)} style={inputStyle}>
              {BIZ_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldGoal}</label>
            <input value={draft.goal || ''} onChange={e => set('goal', e.target.value)} placeholder={dict.goalPlaceholder} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldLastContext}</label>
            <textarea value={draft.lastContext || ''} onChange={e => set('lastContext', e.target.value)} placeholder={dict.lastContextPlaceholder} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>{dict.fieldNextFollowUp}</label>
            <input type="date" value={(draft.nextFollowUpAt || '').slice(0, 10)} onChange={e => set('nextFollowUpAt', e.target.value)} style={inputStyle} />
          </div>
          <div className="p-3 rounded-xl space-y-3" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.contactSectionTitle}</div>
            <div><label style={labelStyle}>{dict.fieldWhatsapp}</label><input value={draft.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder={dict.contactPlaceholder} style={inputStyle} /></div>
            <div><label style={labelStyle}>{dict.fieldPhone}</label><input value={draft.phoneE164 || ''} onChange={e => set('phoneE164', e.target.value)} placeholder={dict.contactPlaceholder} style={inputStyle} /></div>
            <div><label style={labelStyle}>{dict.fieldEmail}</label><input type="email" value={draft.email || ''} onChange={e => set('email', e.target.value)} placeholder={dict.emailPlaceholder} style={inputStyle} /></div>
            <div><label style={labelStyle}>{dict.fieldCity}</label><input value={draft.countryCity || ''} onChange={e => set('countryCity', e.target.value)} placeholder={dict.cityPlaceholder} style={inputStyle} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveEdit} className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:opacity-90" style={{ background: GOLD, color: '#fff' }}>
              <Save className="w-4 h-4" /> {dict.saveChanges}
            </button>
            <button onClick={cancelEdit} className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all hover:bg-white/5" style={{ border: `1px solid ${BORD}`, color: T2 }}>
              <XCircle className="w-4 h-4" /> {dict.cancel}
            </button>
          </div>
        </div>
      )}

      {!editing && notionSync !== 'idle' && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 max-w-2xl"
          style={
            notionSync === 'ok' ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
            : notionSync === 'syncing' ? { background: 'rgba(184,150,12,0.1)', color: '#B8960C', border: '1px solid rgba(184,150,12,0.2)' }
            : notionSync === 'no_id' ? { background: 'rgba(100,116,139,0.1)', color: '#7A9CC5', border: '1px solid rgba(100,116,139,0.2)' }
            : { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
          }>
          {notionSync === 'ok' && dict.notionSyncedOk}
          {notionSync === 'syncing' && dict.notionSyncing}
          {notionSync === 'no_id' && dict.notionNoId}
          {notionSync === 'warn' && dict.notionWarn}
        </div>
      )}

      {/* ── INFO TAB (客户概况) ─── */}
      {!editing && tab === 'info' && (
        <div className="max-w-2xl space-y-0">
          {(task.goal || task.suggestedAction) && (
            <div className="p-3 rounded-xl mb-4" style={{ background: `${GOLD}0D`, border: `1px solid ${GOLD}25` }}>
              <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: GOLD }}>{dict.goalNextStep}</div>
              <div className="text-sm font-medium" style={{ color: T1 }}>{task.goal || task.suggestedAction}</div>
            </div>
          )}
          <InfoRow icon={<MessageSquare className="w-3.5 h-3.5" />} label={dict.recentFollowUp} value={task.lastContext || (task as any).lastNote} empty={dict.noNotes} onClick={openEdit} />
          <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label={dict.whatsappPhone} value={[task.whatsapp, task.phoneE164].filter(Boolean).join('  /  ') || null} empty={dict.contactMissing} onClick={openEdit} />
          <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={dict.email} value={task.email || null} empty={dict.emailMissing} onClick={openEdit} />
          <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label={dict.countryCity} value={task.countryCity || null} empty={dict.cityMissing} onClick={openEdit} />
          <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.owner} value={task.owner || null} empty={dict.ownerMissing} onClick={openEdit} />
          <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label={dict.customerType} value={typeLabel} />
          <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.createdAt} value={task.createdAt ? new Date(task.createdAt).toLocaleDateString('zh-CN') : null} empty={dict.na} />
          <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label={dict.updatedAt} value={task.updatedAt ? new Date(task.updatedAt).toLocaleDateString('zh-CN') : null} empty={dict.na} />

          <div className="flex items-start gap-3 py-2.5 cursor-pointer" style={{ borderBottom: `1px solid ${BORD}` }} onClick={() => onTabChange('files')}>
            <div className="shrink-0 mt-0.5" style={{ color: T3 }}><Paperclip className="w-3.5 h-3.5" /></div>
            <div className="flex-1">
              <div style={labelStyle}>{dict.filesRowLabel}</div>
              {(() => {
                const count = allCustomerTasks.reduce((n, t) => n + (t.proposals?.length || 0), 0);
                return count > 0
                  ? <div className="text-sm font-medium" style={{ color: T1 }}>{tpl(dict.filesCount, { n: count })}</div>
                  : <div className="text-sm font-medium" style={{ color: T3 }}>{dict.filesEmpty}</div>;
              })()}
            </div>
          </div>

          {recentHistory.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.historyTitle}</div>
              {recentHistory.map((h, i) => (
                <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                  <span className="font-black" style={{ color: T3 }}>{new Date(h.timestamp).toLocaleDateString('zh-CN')}</span>
                  <span className="ml-2">{h.message}</span>
                </div>
              ))}
            </div>
          )}

          {isLikelyNotionPageId((task as any).notionFollowupPageId || task.leadId) && (
            <div className="mt-3 text-[9px] font-bold" style={{ color: T3 }}>{dict.notionConnectedNote}</div>
          )}
        </div>
      )}

      {/* ── BUSINESS TAB (关联业务) ─── */}
      {!editing && tab === 'business' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>
              {tpl(dict.relatedBusinessesLabel, { name: task.clientName || '', n: allCustomerTasks.length })}
            </p>
            {!showAddBusinessForm && onCreateBusiness && (
              <button onClick={() => onShowAddBusinessFormChange(true)} className="text-[10px] font-black px-2 py-1 rounded-lg transition-colors flex items-center gap-1" style={{ color: GOLD, background: `${GOLD}18` }}>
                <Plus className="w-3 h-3" /> {dict.addBusinessBtn}
              </button>
            )}
          </div>

          {showAddBusinessForm && (
            <div className="p-3 rounded-xl space-y-2.5" style={{ background: CARD2, border: `1px solid ${GOLD}40` }}>
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: GOLD }}>{dict.newBusinessTitle}</div>
              <div className="flex gap-1.5">
                {BIZ_TYPES.filter(b => b.value !== 'LOG_ONLY').map(b => (
                  <button key={b.value} onClick={() => setNewBizType(b.value as any)} className="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
                    style={newBizType === b.value ? { background: GOLD, color: '#fff' } : { background: BG, color: T2, border: `1px solid ${BORD}` }}>
                    {b.label}
                  </button>
                ))}
              </div>
              <input value={newBizGoal} onChange={e => setNewBizGoal(e.target.value)} placeholder={dict.fieldGoal} style={inputStyle} />
              <textarea value={newBizContext} onChange={e => setNewBizContext(e.target.value)} placeholder={dict.lastContextPlaceholder} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              <input type="date" value={newBizNextDate} onChange={e => setNewBizNextDate(e.target.value)} style={inputStyle} />
              <div className="flex gap-2">
                <button onClick={handleCreateBusiness} disabled={!newBizGoal.trim() || newBizSaving}
                  className="flex-1 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                  style={{ background: GOLD, color: '#fff' }}>
                  {newBizSaving ? '…' : dict.createBusinessBtn}
                </button>
                <button onClick={() => onShowAddBusinessFormChange(false)} className="flex-1 py-2 rounded-lg text-xs font-black transition-all" style={{ border: `1px solid ${BORD}`, color: T2 }}>
                  {dict.cancel}
                </button>
              </div>
            </div>
          )}

          <div className="px-3 py-2.5 rounded-xl" style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}40` }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: `${GOLD}30`, color: GOLD }}>{dict.currentBadge}</span>
              <span className="text-xs font-black" style={{ color: T1 }}>{task.inquirySummary || task.goal || dict.unnamedBusiness}</span>
            </div>
            <div className="text-[10px] mt-1" style={{ color: T2 }}>{task.tradeStatus || '—'} · {TYPE_LABEL[task.businessType || 'TRADE']}</div>
          </div>
          {relatedTasks.length === 0 ? (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>{dict.noOtherBusiness}</div>
          ) : (
            relatedTasks.map(t => (
              <button key={t.id} onClick={() => onSwitchTask?.(t)} className="w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-white/5" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                <div className="text-xs font-black truncate" style={{ color: T1 }}>{t.inquirySummary || t.goal || dict.unnamedBusiness}</div>
                <div className="text-[10px] mt-1 flex items-center justify-between" style={{ color: T2 }}>
                  <span>{t.tradeStatus || '—'} · {TYPE_LABEL[t.businessType || 'TRADE']}</span>
                  <span>{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('zh-CN') : dict.na}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── COMMS TAB (沟通时间线) ─── */}
      {!editing && tab === 'action' && (
        <div className="max-w-2xl space-y-5">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.newCommTitle}</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m => (
              <button key={m} onClick={() => setMethod(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={method === m ? { background: GOLD, color: '#fff' } : { background: CARD2, color: T2, border: `1px solid ${BORD}` }}>
                {m}
              </button>
            ))}
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={dict.contentPlaceholder} rows={5}
            className="w-full p-4 rounded-2xl text-sm font-medium outline-none resize-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }}
            onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORD)} />
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" style={{ color: T3 }} />
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.fieldNextFollowUp}</p>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }} />
            </div>
          </div>
          <button onClick={handleSaveNote} disabled={!content.trim()} className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
            style={saved ? { background: '#10B981', color: '#fff' } : content.trim() ? { background: GOLD, color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: T3, cursor: 'not-allowed' }}>
            {saved ? dict.savedBadge : dict.saveComm}
          </button>
          {recentHistory.length > 0 && (
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.recentRecords}</div>
              {recentHistory.map((h, i) => (
                <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: CARD2, color: T2 }}>
                  <span className="font-black block" style={{ color: T3 }}>{new Date(h.timestamp).toLocaleDateString('zh-CN')}</span>
                  <span className="mt-0.5 block">{h.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── QUOTES TAB (报价记录) ─── */}
      {!editing && tab === 'quotes' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{tpl(dict.quotesOf, { name: task.clientName || '' })}</p>
            <button onClick={() => { setQuoteData(null); loadQuoteHistory(); }} className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors" style={{ color: T3, background: CARD2 }}>{dict.refresh}</button>
          </div>
          {quoteLoading && (
            <div className="flex items-center gap-2 text-xs font-bold py-4" style={{ color: T3 }}>
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> {dict.loadingQuotes}
            </div>
          )}
          {!quoteLoading && quoteData && !quoteData.ok && (
            <div className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              {dict.quotesLoadFailed}
            </div>
          )}
          {!quoteLoading && quoteData?.ok && quoteData.total === 0 && (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>{tpl(dict.noQuotesFound, { name: task.clientName || '' })}</div>
          )}
          {!quoteLoading && quoteData?.ok && quoteData.total > 0 && (
            <>
              <div className="text-xs font-bold" style={{ color: GOLD }}>{tpl(dict.quoteSummary, { n: quoteData.total, amt: Number(quoteData.totalAmount).toLocaleString() })}</div>
              <div className="space-y-2">
                {quoteData.quotes.map((q: any) => (
                  <div key={q.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORD}` }}>
                    <button className="w-full px-4 py-3 flex items-center gap-2 text-left transition-colors hover:bg-white/5" style={{ background: CARD2 }}
                      onClick={() => setExpandedQuote(expandedQuote === q.id ? null : q.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black" style={{ color: T1 }}>{q.quoteNo}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(203,168,92,0.12)', color: GOLD }}>{q.statusZh}</span>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: T3 }}>
                          {q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}
                          {q.projectName && ` · ${q.projectName}`}
                        </div>
                      </div>
                      <span className="text-sm font-black shrink-0" style={{ color: GOLD }}>AED {Number(q.grandTotal).toLocaleString()}</span>
                      {expandedQuote === q.id ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />}
                    </button>
                    {expandedQuote === q.id && (
                      <div className="px-4 py-3 space-y-1.5" style={{ background: BG }}>
                        {q.items && q.items.length > 0 ? (() => {
                          const validItems = q.items.filter((it: any) => {
                            const n = (it.item_name || '').trim();
                            if (/^=DISPIMG/i.test(n) || /^=IMAGE/i.test(n)) return false;
                            if (!n && !(it.description || '').trim()) return false;
                            return true;
                          });
                          const hiddenCnt = q.items.length - validItems.length;
                          return (
                            <>
                              {validItems.map((it: any, j: number) => (
                                <div key={j} className="text-xs font-medium" style={{ color: T2 }}>
                                  <span className="font-black" style={{ color: T1 }}>{j + 1}. {it.item_name}</span>
                                  {it.description && <span style={{ color: T3 }}> · {it.description}</span>}
                                  <span style={{ color: T3 }}> · ×{it.qty} {it.unit}</span>
                                  <span style={{ color: GOLD }}> @ AED {Number(it.selling_price).toLocaleString()}</span>
                                  <span className="float-right font-black" style={{ color: T1 }}>AED {Number(it.line_total).toLocaleString()}</span>
                                </div>
                              ))}
                              {hiddenCnt > 0 && <div className="text-[10px] font-medium mt-1" style={{ color: T3 }}>+{hiddenCnt}</div>}
                            </>
                          );
                        })() : null}

                        {/* Extended fields — only fields the API actually returns
                            (报价类型/币种/关联项目业务). 版本/客户反馈/下一步 have
                            no real data source and are intentionally omitted
                            rather than shown as fabricated placeholders. */}
                        <div className="mt-2 pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ borderTop: `1px solid ${BORD}` }}>
                          <div><span style={{ color: T3 }}>{dict.quoteType}：</span><span style={{ color: T2 }}>{q.quoteType || dict.na}</span></div>
                          <div><span style={{ color: T3 }}>{dict.currency}：</span><span style={{ color: T2 }}>{q.currency || dict.na}</span></div>
                          <div className="col-span-2"><span style={{ color: T3 }}>{dict.relatedBusiness}：</span><span style={{ color: T2 }}>{q.projectName || dict.na}</span></div>
                        </div>
                        {q.attachments && q.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {q.attachments.map((a: any, ai: number) => a.url ? (
                              <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors" style={{ background: `${GOLD}18`, color: GOLD }}>
                                <ExternalLink className="w-3 h-3" /> {a.name || dict.viewQuoteFile}
                              </a>
                            ) : null)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {!quoteLoading && !quoteData && (
            <div className="text-xs font-medium py-4" style={{ color: T3 }}>{dict.clickToLoadQuotes}</div>
          )}
        </div>
      )}

      {/* ── FILES TAB (文件资料) — upload + association on top, list below ─── */}
      {!editing && tab === 'files' && (
        <div className="max-w-2xl space-y-3">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.scopeLabel}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([['customer', dict.scopeCustomer], ['business', dict.scopeBusiness], ['both', dict.scopeBoth]] as const).map(([sc, label]) => (
                <button key={sc} onClick={() => setFileScope(sc)} className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold transition-all"
                  style={fileScope === sc ? { background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}60` } : { background: CARD2, color: T3, border: `1px solid ${BORD}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(fileScope === 'business' || fileScope === 'both') && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.selectBusinessLabel}</p>
              <select value={targetTaskId} onChange={e => setTargetTaskId(e.target.value)} style={inputStyle}>
                {allCustomerTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.id === task.id ? `(${dict.currentBadge}) ` : ''}{t.inquirySummary || t.goal || dict.unnamedBusiness}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.categoryLabel}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['company_docs', 'contact_identity', 'product_requirements', 'business_docs', 'comms_evidence', 'other_docs'] as const).map(cat => (
                <button key={cat} onClick={() => setFileCategory(cat)} className="py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-left"
                  style={fileCategory === cat ? { background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}60` } : { background: CARD2, color: T3, border: `1px solid ${BORD}` }}>
                  {FILE_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.notesOptionalLabel}</p>
            <input value={fileNotes} onChange={e => setFileNotes(e.target.value)} placeholder={dict.notesPlaceholderExample} style={inputStyle} />
          </div>

          <div
            onClick={() => { if (proposalUploadStatus !== 'uploading') proposalInputRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingProposal(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDraggingProposal(false); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingProposal(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) handleProposalFiles(files);
            }}
            className="flex flex-col items-center gap-2 py-6 rounded-xl cursor-pointer transition-all"
            style={{ border: `2px dashed ${isDraggingProposal ? GOLD : BORD}`, background: isDraggingProposal ? `${GOLD}0A` : CARD2 }}
          >
            <UploadCloud className="w-7 h-7" style={{ color: isDraggingProposal ? GOLD : T3 }} />
            <p className="text-xs font-black" style={{ color: isDraggingProposal ? GOLD : T2 }}>
              {proposalUploadStatus === 'uploading' ? dict.dropzoneUploading : dict.dropzoneCta}
            </p>
            <p className="text-[10px]" style={{ color: T3 }}>{dict.dropzoneTypes}</p>
          </div>

          <input ref={proposalInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" className="hidden"
            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length > 0) handleProposalFiles(files); }} />
          <button onClick={() => proposalInputRef.current?.click()} disabled={proposalUploadStatus === 'uploading'}
            className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: GOLD, color: '#fff' }}>
            <UploadCloud className="w-4 h-4" /> {proposalUploadStatus === 'uploading' ? dict.dropzoneUploading : dict.selectFileBtn}
          </button>

          {proposalUploadStatus !== 'idle' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
              style={
                proposalUploadStatus === 'uploading' ? { background: 'rgba(99,102,241,0.1)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' } :
                proposalUploadStatus === 'ok' ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' } :
                { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }
              }>
              {proposalUploadStatus === 'uploading' && <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" /> {dict.uploadingToDrive}</>}
              {proposalUploadStatus === 'ok' && <>✓ {FILE_CATEGORY_LABELS[fileCategory]} {dict.uploadedOk}</>}
              {proposalUploadStatus === 'fail' && <>{dict.uploadFailed}</>}
            </div>
          )}

          {(() => {
            const allFiles = allCustomerTasks.flatMap(t => (t.proposals || []).map(p => ({ p, sourceTask: t })));
            if (allFiles.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{tpl(dict.filesListTitle, { n: allFiles.length })}</div>
                {allFiles.map(({ p, sourceTask }) => (
                  <div key={p.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                    <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: T3 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: T1 }}>{p.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: T3 }}>
                        {p.category ? FILE_CATEGORY_LABELS[p.category] + ' · ' : ''}
                        {new Date(p.uploadedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {p.uploadedBy ? ` · ${dict.uploadedByLabel}：${p.uploadedBy}` : ''}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: T2 }}>
                        {dict.associatedCustomer}：{task.clientName || dict.na} · {dict.associatedBusiness}：{sourceTask.inquirySummary || sourceTask.goal || dict.unnamedBusiness}
                        {p.scope === 'customer' && ` ${dict.customerLevelTag}`}
                      </p>
                      {p.source && <p className="text-[10px] mt-0.5" style={{ color: T3 }}>{dict.sourceLabel}：{p.source}</p>}
                      {p.notes && <p className="text-[10px] mt-0.5" style={{ color: T3 }}>{dict.notesRowLabel}：{p.notes}</p>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {p.uploadStatus === 'uploading' && <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
                      {p.uploadStatus === 'uploaded' && p.driveUrl && (
                        <a href={p.driveUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors" style={{ background: `${GOLD}18`, color: GOLD }}>
                          <ExternalLink className="w-3 h-3" /> {dict.viewDownload}
                        </a>
                      )}
                      {p.uploadStatus === 'failed' && <span className="text-[10px] font-bold text-red-400">{dict.uploadFailedTag}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
