/**
 * ProjectDetailBody — genuine project/business-level detail body.
 *
 * Distinct from CustomerWorkspaceBody: this renders ONE business/project's
 * own data (Business Master static fields + this task's own Follow-up Log
 * dynamic fields + this task's own files), never the customer-level
 * 客户概况/关联业务 tabs. Upload / quote-history / follow-up-save logic is
 * adapted from CustomerWorkspaceBody (same underlying APIs, no new upload
 * or query endpoints) but this is a separate component with its own tab
 * set: 项目概况 / 跟进与沟通 / 报价与方案 / 合同与订单 / 文件资料 / 财务与交付.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { FollowUpTask, Proposal, ProjectMasterContent } from '../types';
import { uploadFileToDrive } from '../services/driveService';
import { isRealCommLog } from '../utils/commLog';
import {
  Calendar, Save, XCircle, MapPin, Phone, Mail, User,
  FileText, ChevronDown, ChevronUp, UploadCloud, ExternalLink,
} from 'lucide-react';
import { isLikelyNotionPageId } from '../utils/notionId';
import type { WorkspaceDict } from './CustomerWorkspaceBody';

// Session-level cache for /api/crm/project-content, keyed by projectPageId —
// module-scoped so it survives tab switches and language toggles without a
// second request, and is naturally cleared on a full page reload.
const projectContentCache = new Map<string, ProjectMasterContent>();

const BG    = '#0A1628';
const CARD2 = '#162A45';
const BORD  = 'rgba(255,255,255,0.09)';
const GOLD  = '#B8960C';
const T1    = '#E8F0FF';
const T2    = '#7A9CC5';
const T3    = '#4A6080';

const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];
const OWNERS  = ['Chris', 'Lili', 'Jeffrey', 'Yang', '待分配'];

export type ProjectDetailTab = 'overview' | 'comms' | 'quotes' | 'orders' | 'files' | 'finance';

interface Props {
  task: FollowUpTask;
  tab: ProjectDetailTab;
  onTabChange: (t: ProjectDetailTab) => void;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  dict: WorkspaceDict;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string; nextAction?: string }) => void;
  onUpdateTask?: (task: FollowUpTask) => void;
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

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{title}</div>
      {action}
    </div>
  );
}

export default function ProjectDetailBody({ task, tab, onTabChange, editing, onEditingChange, dict, onSave, onUpdateTask }: Props) {
  const master = (task as any).projectMaster as import('../types').ProjectMaster | undefined;

  // Business Master page-content (product/spec/parties/contract info) —
  // fetched once per projectPageId, read-only, never merged into the main
  // Follow-up Log sync. Failure here must never block the rest of the page.
  const [projectContent, setProjectContent] = useState<ProjectMasterContent | null>(
    () => (master?.projectPageId ? projectContentCache.get(master.projectPageId) ?? null : null)
  );
  useEffect(() => {
    const pageId = master?.projectPageId;
    if (!pageId) { setProjectContent(null); return; }
    const cached = projectContentCache.get(pageId);
    if (cached) { setProjectContent(cached); return; }
    let cancelled = false;
    fetch(`/api/crm/project-content?projectPageId=${encodeURIComponent(pageId)}`)
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          console.warn('[project-content] fetch failed', res.status, data?.error);
          return null;
        }
        return data;
      })
      .then(data => {
        if (cancelled || !data?.content) return;
        setProjectContent(data.content);
        // Only cache a genuinely non-empty result — a transient failure or a
        // page with no matchable fields shouldn't lock this project out of
        // ever retrying for the rest of the browser session.
        const c = data.content as ProjectMasterContent;
        const hasFields = Object.entries(c).some(([k, v]) =>
          k !== 'rawSections' && (Array.isArray(v) ? v.length > 0 : !!v)
        );
        if (hasFields) projectContentCache.set(pageId, c);
      })
      .catch(err => console.warn('[project-content] fetch error', err));
    return () => { cancelled = true; };
  }, [master?.projectPageId]);

  // ── Files (scoped to this business only — no cross-business ambiguity) ──
  const [proposalUploadStatus, setProposalUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'fail'>('idle');
  const [isDraggingProposal, setIsDraggingProposal] = useState(false);
  const proposalInputRef = useRef<HTMLInputElement>(null);
  const [fileCategory, setFileCategory] = useState<NonNullable<Proposal['category']>>('company_docs');
  const [fileNotes, setFileNotes] = useState('');

  const FILE_CATEGORY_LABELS: Record<string, string> = {
    company_docs: '公司证件', contact_identity: '联系与身份资料',
    product_requirements: '产品与需求资料', business_docs: '商务文件',
    comms_evidence: '沟通证据', other_docs: '其他资料',
    proposal: '提案 / 方案（旧分类）', contract: '合同 / 回签文件（旧分类）',
    project_doc: '项目资料（旧分类）', other: '其他附件（旧分类）',
  };

  const handleProposalFiles = async (files: File[]) => {
    const file = files[0];
    if (!file || !onUpdateTask) return;
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
        category: fileCategory, scope: 'business', source: '手动上传',
        notes: fileNotes.trim() || undefined,
      };
      const withNew = [...(task.proposals || []), newProposal];
      onUpdateTask({ ...task, proposals: withNew });
      try {
        const result = await uploadFileToDrive(
          { id: propId, name: file.name, type: file.type, data: dataURL, size: file.size, uploadedAt, isAnalyzed: false },
          { businessType: task.businessType, clientName: task.clientName }
        );
        if (result.ok && result.driveUrl) {
          onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, driveUrl: result.driveUrl, uploadStatus: 'uploaded' as const } : p) });
          setProposalUploadStatus('ok');
          setFileNotes('');
        } else {
          onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p) });
          setProposalUploadStatus('fail');
        }
      } catch {
        onUpdateTask({ ...task, proposals: withNew.map(p => p.id === propId ? { ...p, uploadStatus: 'failed' as const } : p) });
        setProposalUploadStatus('fail');
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Quote history — same endpoint as before, unmodified. Customer-name
  // scoped (no project-level filter exists yet) — labeled accordingly. ────
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const loadQuoteHistory = async () => {
    if (!task.clientName || quoteData !== null) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/ai/quotation-history?customer=${encodeURIComponent(task.clientName)}`);
      setQuoteData(await res.json());
    } catch { setQuoteData({ ok: false, error: 'failed' }); }
    finally { setQuoteLoading(false); }
  };

  // ── Contracts & orders / Finance — customer-360, same as before. ────────
  const [financeData, setFinanceData] = useState<any>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const loadFinanceActivity = async () => {
    if (!task.clientName || financeData !== null) return;
    setFinanceLoading(true);
    try {
      const res = await fetch(`/api/ai/customer-360?customer=${encodeURIComponent(task.clientName)}`);
      setFinanceData(await res.json());
    } catch { setFinanceData({ ok: false, error: 'failed' }); }
    finally { setFinanceLoading(false); }
  };

  // ── Edit mode — Follow-up Log dynamic fields only (goal/lastContext/
  // nextFollowUpAt/owner/contact). Business Master fields are read-only. ──
  const [draft, setDraft] = useState<Partial<FollowUpTask>>({});
  type NotionSync = 'idle' | 'syncing' | 'ok' | 'warn' | 'no_id';
  const [notionSync, setNotionSync] = useState<NotionSync>('idle');

  const openEdit = () => {
    setNotionSync('idle');
    setDraft({
      owner: task.owner, goal: task.goal, lastContext: task.lastContext,
      nextFollowUpAt: task.nextFollowUpAt,
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: notionPageId, nextFollowUpAt: updated.nextFollowUpAt, lastNote: updated.lastContext, inquirySummary: updated.goal, owner: updated.owner }),
      });
      const data = await res.json().catch(() => ({}));
      setNotionSync(data.ok ? 'ok' : 'warn');
    } catch { setNotionSync('warn'); }
  };
  const set = (k: keyof FollowUpTask, v: string) => setDraft(prev => ({ ...prev, [k]: v }));

  const [method, setMethod] = useState(METHODS[0]);
  const [content, setContent] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().split('T')[0]; });
  const [saved, setSaved] = useState(false);
  const handleSaveNote = () => {
    if (!content.trim()) return;
    onSave(task.id, { method, content: content.trim(), nextDate, nextAction: nextAction.trim() || undefined });
    setSaved(true);
  };
  // "返回项目概况" only switches tabs — task state is already updated via
  // onSave, so overview reads the fresh lastContext with no reload needed.
  const handleBackToOverview = () => {
    setSaved(false);
    onTabChange('overview');
  };
  // "继续添加跟进" stays on this tab and clears the form for the next entry;
  // re-enables the save button (blocked while `saved` to avoid duplicates).
  const handleContinueFollowUp = () => {
    setSaved(false);
    setContent('');
    setNextAction('');
  };

  const recentHistory = (task.history || []).filter(isRealCommLog);
  // "最新情况" block: derive comm method/date from the newest real log entry
  // (history is always unshifted, so [0] is latest); Notion-imported tasks
  // with no local history yet fall back to the raw sync snapshot fields.
  const latestComm = recentHistory[0];
  const latestCommMethod = latestComm ? (latestComm.message.match(/^\[(.+?)\]/)?.[1] || '') : ((task as any).followUpMethod || '');
  const latestCommAt = latestComm?.timestamp || task.updatedAt || (task as any).lastFollowUpAt || task.createdAt;

  // 项目核心背景 rows derived from /api/crm/project-content — combined so
  // related fields (e.g. product + category) render as one line when both
  // are present, and each row hides entirely when its fields are empty.
  const productLine = [projectContent?.productName, projectContent?.productCategory].filter(Boolean).join(' · ');
  const quantityAreaLine = [projectContent?.quantity, [projectContent?.area, projectContent?.unit].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const materialColorFinishLine = [projectContent?.material, projectContent?.color, projectContent?.finish].filter(Boolean).join(' · ');
  const projectLocationLine = master ? [master.city, master.country].filter(Boolean).join(' · ') : '';
  const hasCoreBackground = !!(productLine || quantityAreaLine || projectContent?.specification || materialColorFinishLine || projectContent?.scope || projectLocationLine);
  const hasPartiesInfo = !!projectContent && [projectContent.ownerCompany, projectContent.pmc, projectContent.consultant, projectContent.supervisor, projectContent.designer, projectContent.mainContractor].some(Boolean);
  const hasContractInfo = !!projectContent && [projectContent.contractNumber, projectContent.submissionNumber, projectContent.approvalStatus, projectContent.deliveryRequirement, projectContent.technicalReference].some(Boolean);
  const hasFoldedDetails = !!master || hasPartiesInfo || hasContractInfo;

  return (
    <div>
      {!editing && (
        <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl max-w-3xl" style={{ background: CARD2 }}>
          {([
            ['overview', dict.tabProjectOverview],
            ['comms', dict.tabFollowUpComms],
            ['quotes', dict.tabQuotesProposals],
            ['orders', dict.tabContractsOrders],
            ['files', dict.tabFiles],
            ['finance', dict.tabFinance],
          ] as const).map(([key, label]) => (
            <button key={key}
              onClick={() => { onTabChange(key); if (key === 'quotes') loadQuoteHistory(); if (key === 'orders' || key === 'finance') loadFinanceActivity(); if (key === 'files') setProposalUploadStatus('idle'); }}
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

      {/* ── EDIT MODE — Follow-up Log dynamic fields only ───── */}
      {editing && (
        <div className="space-y-4 max-w-xl">
          <div className="p-3 rounded-xl text-xs font-medium" style={{ background: CARD2, color: T2, border: `1px solid ${BORD}` }}>{dict.editSyncNotice}</div>
          <div>
            <label style={labelStyle}>{dict.fieldOwner}</label>
            <select value={draft.owner || ''} onChange={e => set('owner', e.target.value)} style={inputStyle}>
              <option value="">{dict.selectOwnerPlaceholder}</option>
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
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

      {/* ── OVERVIEW TAB (项目概况) — compact first screen: 项目核心背景 / 最新情况 /
           下一步行动 / 商务摘要. Contact/parties/contract detail is collapsed
           below so the first screen reads in a few seconds, not as a full
           resource dump. ─── */}
      {!editing && tab === 'overview' && (
        <div className="max-w-2xl space-y-6">

          {/* A. 项目核心背景 — product/spec/scope/location only; never
               lastContext/tradeStatus/goal (those are Follow-up Log fields
               shown in the other blocks below). */}
          <div>
            <SectionHeader title={dict.sectionCoreBackground} action={
              <button disabled title={dict.editProjectMasterDisabledNote}
                className="text-[10px] font-bold px-2 py-1 rounded-lg opacity-40 cursor-not-allowed"
                style={{ background: CARD2, color: T3 }}>
                {dict.editProjectMasterBtn}
              </button>
            } />
            {productLine && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.productLabel} value={productLine} />}
            {quantityAreaLine && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.quantityAreaLabel} value={quantityAreaLine} />}
            {projectContent?.specification && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.specificationLabel} value={projectContent.specification} />}
            {materialColorFinishLine && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.materialColorFinishLabel} value={materialColorFinishLine} />}
            {projectContent?.scope && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.projectScopeLabel} value={projectContent.scope} />}
            {projectLocationLine && <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label={dict.projectLocationLabel} value={projectLocationLine} />}
            {!hasCoreBackground && (
              <div className="p-3 rounded-xl mt-2 text-xs font-medium" style={{ background: CARD2, color: T3, border: `1px solid ${BORD}` }}>{dict.coreBackgroundPending}</div>
            )}
            {master?.projectSituation && (
              <div className="p-3 rounded-xl mt-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px dashed ${BORD}` }}>
                <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.historicalNoteLabel}</div>
                <div className="text-xs font-medium whitespace-pre-wrap" style={{ color: T2 }}>{master.projectSituation}</div>
              </div>
            )}
          </div>

          {/* B. 最新情况 — Follow-up Log's newest valid entry only, filtered via isRealCommLog */}
          <div>
            <SectionHeader title={dict.sectionLatestUpdate} action={
              <button onClick={() => onTabChange('comms')}
                className="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors" style={{ background: `${GOLD}18`, color: GOLD }}>
                {dict.updateLatestUpdateBtn}
              </button>
            } />
            <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.currentActionStatusLabel} value={task.tradeStatus} empty={dict.na} />
            <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.recentFollowUp} value={task.lastContext} empty={dict.noNotes} onClick={openEdit} />
            <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.lastFollowUpDateLabel} value={latestCommAt ? new Date(latestCommAt).toLocaleDateString('zh-CN') : null} empty={dict.na} />
            <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.commMethodLabel} value={latestCommMethod || null} empty={dict.noMethodRecorded} />
            <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.owner} value={task.owner} empty={dict.ownerMissing} onClick={openEdit} />
            <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.fieldNextFollowUp} value={task.nextFollowUpAt ? new Date(task.nextFollowUpAt).toLocaleDateString('zh-CN') : null} empty={dict.na} onClick={openEdit} />
          </div>

          {/* C. 下一步行动 — independent field (task.goal), never the project stage
               or a whole follow-up entry */}
          <div>
            <SectionHeader title={dict.sectionNextAction} />
            <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.fieldGoal} value={task.goal} empty={dict.goalPlaceholder} onClick={openEdit} />
            <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.owner} value={task.owner} empty={dict.ownerMissing} onClick={openEdit} />
            <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.fieldNextFollowUp} value={task.nextFollowUpAt ? new Date(task.nextFollowUpAt).toLocaleDateString('zh-CN') : null} empty={dict.na} onClick={openEdit} />
            <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.priorityLabel} value={task.priority || null} empty={dict.na} />
          </div>

          {/* D. 商务摘要 — compact tiles. Quote/order/receivable totals aren't
               reliably scoped to a single project (the existing quote/finance
               endpoints are customer-wide), so those tiles state that
               honestly instead of borrowing customer-level numbers. */}
          <div>
            <SectionHeader title={dict.sectionBusinessSummary} />
            <div className="grid grid-cols-2 gap-2">
              {[
                [dict.bizQuoteStatusLabel, dict.noReliableLinkedRecords],
                [dict.bizContractStatusLabel, dict.noReliableLinkedRecords],
                [dict.bizReceivableStatusLabel, dict.noReliableLinkedRecords],
                [dict.bizProjectStageLabel, master?.projectStage || dict.noReliableLinkedRecords],
              ].map(([label, value], i) => (
                <div key={i} className="p-3 rounded-xl" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                  <div style={labelStyle}>{label}</div>
                  <div className="text-xs font-bold mt-0.5" style={{ color: value === dict.noReliableLinkedRecords ? T3 : T1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 折叠区：项目基础与参与方资料 — contact/parties/contract detail,
               collapsed by default. */}
          {hasFoldedDetails && (
            <details className="rounded-xl" style={{ border: `1px solid ${BORD}` }}>
              <summary className="cursor-pointer px-3 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ color: T2 }}>
                {dict.sectionFoldedDetails}
              </summary>
              <div className="px-3 pb-1">
                {master?.contactName && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.contactNameLabel} value={master.contactName} />}
                {master?.contactPhone && <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label={dict.phone} value={master.contactPhone} />}
                {master?.contactEmail && <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={dict.email} value={master.contactEmail} />}
                {master?.currency && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.currencyLabel} value={master.currency} />}
                {master?.expectedSigningAt && <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.expectedSigningLabel} value={new Date(master.expectedSigningAt).toLocaleDateString('zh-CN')} />}
                {master?.expectedCompletionAt && <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={dict.expectedCompletionLabel} value={new Date(master.expectedCompletionAt).toLocaleDateString('zh-CN')} />}
                {projectContent?.ownerCompany && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.ownerCompanyLabel} value={projectContent.ownerCompany} />}
                {projectContent?.pmc && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.pmcLabel} value={projectContent.pmc} />}
                {projectContent?.consultant && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.consultantLabel} value={projectContent.consultant} />}
                {projectContent?.supervisor && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.supervisorLabel} value={projectContent.supervisor} />}
                {projectContent?.designer && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.designerLabel} value={projectContent.designer} />}
                {projectContent?.mainContractor && <InfoRow icon={<User className="w-3.5 h-3.5" />} label={dict.mainContractorLabel} value={projectContent.mainContractor} />}
                {projectContent?.contractNumber && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.contractNumberLabel} value={projectContent.contractNumber} />}
                {projectContent?.submissionNumber && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.submissionNumberLabel} value={projectContent.submissionNumber} />}
                {projectContent?.approvalStatus && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.approvalStatusLabel} value={projectContent.approvalStatus} />}
                {projectContent?.deliveryRequirement && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.deliveryRequirementLabel} value={projectContent.deliveryRequirement} />}
                {projectContent?.technicalReference && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label={dict.technicalReferenceLabel} value={projectContent.technicalReference} />}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── FOLLOW-UP & COMMS TAB (跟进与沟通) ─── */}
      {!editing && tab === 'comms' && (
        <div className="max-w-2xl space-y-5">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.newCommTitle}</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m => (
              <button key={m} onClick={() => setMethod(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={method === m ? { background: GOLD, color: '#fff' } : { background: CARD2, color: T2, border: `1px solid ${BORD}` }}>{m}</button>
            ))}
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={dict.contentPlaceholder} rows={5}
            className="w-full p-4 rounded-2xl text-sm font-medium outline-none resize-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }}
            onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORD)} />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.nextActionInputLabel}</p>
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder={dict.nextActionInputPlaceholder}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium outline-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }} />
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" style={{ color: T3 }} />
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T3 }}>{dict.fieldNextFollowUp}</p>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORD}`, color: T1 }} />
            </div>
          </div>
          <button onClick={handleSaveNote} disabled={!content.trim() || saved} className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
            style={saved ? { background: '#10B981', color: '#fff' } : content.trim() ? { background: GOLD, color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: T3, cursor: 'not-allowed' }}>
            {saved ? dict.savedBadge : dict.saveComm}
          </button>
          {saved && (
            <div className="p-4 rounded-2xl flex flex-col gap-3" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="text-sm font-black" style={{ color: '#6EE7B7' }}>{dict.savedSuccessMessage}</div>
              <div className="flex gap-2">
                <button onClick={handleBackToOverview} className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all hover:opacity-90" style={{ background: GOLD, color: '#fff' }}>
                  {dict.backToOverviewBtn}
                </button>
                <button onClick={handleContinueFollowUp} className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all hover:bg-white/5" style={{ border: `1px solid ${BORD}`, color: T2 }}>
                  {dict.continueFollowUpBtn}
                </button>
              </div>
            </div>
          )}
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

      {/* ── QUOTES & PROPOSALS TAB (报价与方案) ─── */}
      {!editing && tab === 'quotes' && (
        <div className="max-w-2xl space-y-3">
          <div className="text-[10px]" style={{ color: T3 }}>{dict.customerLevelDataNote}</div>
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
            <div className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>{dict.quotesLoadFailed}</div>
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
                        <div className="text-[10px] mt-0.5" style={{ color: T3 }}>{q.quoteDate ? new Date(q.quoteDate).toLocaleDateString('zh-CN') : '—'}{q.projectName && ` · ${q.projectName}`}</div>
                      </div>
                      <span className="text-sm font-black shrink-0" style={{ color: GOLD }}>AED {Number(q.grandTotal).toLocaleString()}</span>
                      {expandedQuote === q.id ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />}
                    </button>
                    {expandedQuote === q.id && (
                      <div className="px-4 py-3 space-y-1.5" style={{ background: BG }}>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                          <div><span style={{ color: T3 }}>{dict.quoteType}：</span><span style={{ color: T2 }}>{q.quoteType || dict.na}</span></div>
                          <div><span style={{ color: T3 }}>{dict.currency}：</span><span style={{ color: T2 }}>{q.currency || dict.na}</span></div>
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
          {!quoteLoading && !quoteData && <div className="text-xs font-medium py-4" style={{ color: T3 }}>{dict.clickToLoadQuotes}</div>}
        </div>
      )}

      {/* ── CONTRACTS & ORDERS TAB (合同与订单) ─── */}
      {!editing && tab === 'orders' && (
        <div className="max-w-2xl space-y-3">
          <div className="text-[10px]" style={{ color: T3 }}>{dict.customerLevelDataNote}</div>
          {financeLoading && (
            <div className="flex items-center gap-2 text-xs font-bold py-4" style={{ color: T3 }}>
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> {dict.financeLoading}
            </div>
          )}
          {!financeLoading && financeData && !financeData.ok && (
            <div className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>{dict.financeError}</div>
          )}
          {!financeLoading && financeData?.ok && (
            financeData.orders?.length > 0 ? (
              <div className="space-y-1.5">
                {financeData.orders.map((o: any, i: number) => (
                  <div key={i} className="px-3 py-2 rounded-lg text-xs" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                    <div className="flex items-center justify-between">
                      <span className="font-black" style={{ color: T1 }}>{o.orderId}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>{o.statusZh || o.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1.5 text-[10px]" style={{ color: T2 }}>
                      <div>{dict.orderGrandTotal}：AED {Number(o.grandTotal).toLocaleString()}</div>
                      <div>{dict.orderPaid}：AED {Number(o.paidAmount).toLocaleString()}</div>
                      <div style={{ color: o.outstandingAmount > 0 ? '#E0846A' : T2 }}>{dict.orderOutstanding}：AED {Number(o.outstandingAmount).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-xs font-medium py-2" style={{ color: T3 }}>{dict.financeEmpty}</div>
          )}
          {!financeLoading && !financeData && <div className="text-xs font-medium py-4" style={{ color: T3 }}>{dict.financeEmpty}</div>}
        </div>
      )}

      {/* ── FILES TAB (文件资料) — scoped to this business only ─── */}
      {!editing && tab === 'files' && (
        <div className="max-w-2xl space-y-3">
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
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsDraggingProposal(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) handleProposalFiles(files); }}
            className="flex flex-col items-center gap-2 py-6 rounded-xl cursor-pointer transition-all"
            style={{ border: `2px dashed ${isDraggingProposal ? GOLD : BORD}`, background: isDraggingProposal ? `${GOLD}0A` : CARD2 }}
          >
            <UploadCloud className="w-7 h-7" style={{ color: isDraggingProposal ? GOLD : T3 }} />
            <p className="text-xs font-black" style={{ color: isDraggingProposal ? GOLD : T2 }}>{proposalUploadStatus === 'uploading' ? dict.dropzoneUploading : dict.dropzoneCta}</p>
            <p className="text-[10px]" style={{ color: T3 }}>{dict.dropzoneTypes}</p>
          </div>
          <input ref={proposalInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" className="hidden"
            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length > 0) handleProposalFiles(files); }} />
          <button onClick={() => proposalInputRef.current?.click()} disabled={proposalUploadStatus === 'uploading'}
            className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40" style={{ background: GOLD, color: '#fff' }}>
            <UploadCloud className="w-4 h-4" /> {proposalUploadStatus === 'uploading' ? dict.dropzoneUploading : dict.selectFileBtn}
          </button>
          {proposalUploadStatus !== 'idle' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
              style={proposalUploadStatus === 'uploading' ? { background: 'rgba(99,102,241,0.1)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' }
                : proposalUploadStatus === 'ok' ? { background: 'rgba(16,185,129,0.1)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }
                : { background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)' }}>
              {proposalUploadStatus === 'uploading' && <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" /> {dict.uploadingToDrive}</>}
              {proposalUploadStatus === 'ok' && <>✓ {FILE_CATEGORY_LABELS[fileCategory]} {dict.uploadedOk}</>}
              {proposalUploadStatus === 'fail' && <>{dict.uploadFailed}</>}
            </div>
          )}
          {(task.proposals && task.proposals.length > 0) && (
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{tpl(dict.filesListTitle, { n: task.proposals.length })}</div>
              {task.proposals.map(p => (
                <div key={p.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                  <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: T3 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: T1 }}>{p.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: T3 }}>
                      {p.category ? FILE_CATEGORY_LABELS[p.category] + ' · ' : ''}{new Date(p.uploadedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </p>
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
          )}
        </div>
      )}

      {/* ── FINANCE & DELIVERY TAB (财务与交付) ─── */}
      {!editing && tab === 'finance' && (
        <div className="max-w-2xl space-y-4">
          <div className="text-[10px]" style={{ color: T3 }}>{dict.customerLevelDataNote}</div>
          {financeLoading && (
            <div className="flex items-center gap-2 text-xs font-bold py-4" style={{ color: T3 }}>
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> {dict.financeLoading}
            </div>
          )}
          {!financeLoading && financeData?.ok && (
            <>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: T3 }}>{dict.sectionInvoices}</div>
                {financeData.invoices?.length > 0 ? (
                  <div className="space-y-1.5">
                    {financeData.invoices.map((inv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                        <div className="min-w-0">
                          <div className="font-black truncate" style={{ color: T1 }}>{inv.invoiceNo}</div>
                          <div className="text-[10px]" style={{ color: T3 }}>{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('zh-CN') : dict.na} · {inv.statusZh || inv.status}</div>
                        </div>
                        <div className="font-black shrink-0" style={{ color: GOLD }}>AED {Number(inv.total).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs font-medium py-2" style={{ color: T3 }}>{dict.financeEmpty}</div>}
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: T3 }}>{dict.sectionConsignment}</div>
                {financeData.consignment?.length > 0 ? (
                  <div className="space-y-1.5">
                    {financeData.consignment.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: CARD2, border: `1px solid ${BORD}` }}>
                        <div className="min-w-0">
                          <div className="font-black truncate" style={{ color: T1 }}>{c.productName}</div>
                          <div className="text-[10px]" style={{ color: T3 }}>{c.soNo} · {c.settlementStatus}</div>
                        </div>
                        <div className="font-black shrink-0" style={{ color: GOLD }}>AED {Number(c.amount).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs font-medium py-2" style={{ color: T3 }}>{dict.financeEmpty}</div>}
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: T3 }}>{dict.sectionDeposit}</div>
                <div className="text-xs font-medium py-2" style={{ color: T3 }}>{dict.depositEmpty}</div>
              </div>
            </>
          )}
          {!financeLoading && !financeData && <div className="text-xs font-medium py-4" style={{ color: T3 }}>{dict.financeEmpty}</div>}
        </div>
      )}
    </div>
  );
}

function tpl(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);
}
