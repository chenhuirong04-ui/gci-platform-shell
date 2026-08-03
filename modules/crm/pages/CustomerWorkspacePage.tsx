import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, MessageSquarePlus, UploadCloud, Edit2 } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { findCustomerByCode } from '../utils/customerCode';
import { isRealCommLog } from '../utils/commLog';
import CustomerWorkspaceBody from '../components/CustomerWorkspaceBody';
import type { WorkspaceTab, WorkspaceDict } from '../components/CustomerWorkspaceBody';

const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';
const TYPE_LABEL: Record<string, string> = { TRADE: '贸易型', PROJECT: '项目型', LOG_ONLY: '内部', INTERNAL: '内部' };

interface Props {
  customerCode: string;
  tasks: FollowUpTask[];
  hydrated: boolean;
  dict: WorkspaceDict;
  onBack: () => void;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask: (task: FollowUpTask) => void;
  onUpdateAnyTask: (task: FollowUpTask) => void;
  onCreateBusiness: (formData: Partial<FollowUpTask>) => void;
  onGoToBusiness: (task: FollowUpTask) => void;
}

function fmtDate(iso: string | undefined, na: string): string {
  if (!iso) return na;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? na : d.toLocaleDateString('zh-CN');
}

function SummaryField({ label, value, na }: { label: string; value?: string | null; na: string }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{label}</div>
      <div className="text-sm font-bold mt-0.5 truncate" style={{ color: value ? T1 : T3 }}>{value || na}</div>
    </div>
  );
}

export default function CustomerWorkspacePage({
  customerCode, tasks, hydrated, dict, onBack, onSave, onUpdateTask, onUpdateAnyTask, onCreateBusiness, onGoToBusiness,
}: Props) {
  const [tab, setTab] = useState<WorkspaceTab>('info');
  const [editing, setEditing] = useState(false);
  const [showAddBusinessForm, setShowAddBusinessForm] = useState(false);

  const lookup = useMemo(() => findCustomerByCode(tasks, customerCode), [tasks, customerCode]);
  // The workspace always shows the task resolved directly from the URL —
  // it never switches focus in-place; 关联业务 rows navigate to the
  // dedicated business detail page instead (see onGoToBusiness).
  const focusedTask = lookup?.task || null;
  const group = lookup ? [lookup.task, ...lookup.relatedTasks] : [];
  const relatedTasks = lookup?.relatedTasks || [];

  if (!hydrated) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center" style={{ color: T2 }}>
        <div className="text-sm font-bold">{dict.loading}</div>
      </div>
    );
  }

  if (!lookup || !focusedTask) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 mb-8 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <ArrowLeft className="w-3.5 h-3.5" /> {dict.backToList}
        </button>
        <div className="text-xl font-black" style={{ color: T1 }}>{dict.notFoundTitle}</div>
        <div className="text-sm font-medium mt-2 max-w-md mx-auto" style={{ color: T2 }}>{dict.notFoundDesc}</div>
      </div>
    );
  }

  // Always the URL-level code — a customer has exactly one customerCode,
  // regardless of which of their businesses this task represents.
  const displayCode = customerCode;
  const lastCommMessage = (() => {
    const flat: { timestamp: string; message: string }[] = [];
    for (const t of group) {
      for (const h of (t.history || [])) {
        if (isRealCommLog(h) && h.message) flat.push({ timestamp: h.timestamp, message: h.message });
      }
    }
    flat.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return flat[0]?.message || null;
  })();
  const lastUpdatedAt = group.reduce((latest, t) => {
    const c = t.updatedAt || t.createdAt || '';
    return c > latest ? c : latest;
  }, '');

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
        <ArrowLeft className="w-3.5 h-3.5" /> {dict.backToList}
      </button>

      {/* Top summary — 客户概况 */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>{displayCode}</span>
          <h1 className="text-2xl font-black" style={{ color: T1 }}>{focusedTask.clientName || dict.na}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${GOLD}18`, color: GOLD }}>{focusedTask.tradeStatus || dict.na}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <SummaryField na={dict.na} label={dict.customerType} value={TYPE_LABEL[focusedTask.businessType] || focusedTask.businessType} />
          <SummaryField na={dict.na} label={dict.countryCity} value={focusedTask.countryCity} />
          <SummaryField na={dict.na} label={dict.contactPerson} value={(focusedTask as any).contactPerson} />
          <SummaryField na={dict.na} label={dict.position} value={(focusedTask as any).contactPosition} />
          <SummaryField na={dict.na} label={dict.phone} value={focusedTask.phoneE164} />
          <SummaryField na={dict.na} label={dict.whatsapp} value={focusedTask.whatsapp} />
          <SummaryField na={dict.na} label={dict.email} value={focusedTask.email} />
          <SummaryField na={dict.na} label={dict.customerSource} value={(focusedTask as any).leadSource} />
          <SummaryField na={dict.na} label={dict.currentStage} value={focusedTask.tradeStatus} />
          <SummaryField na={dict.na} label={dict.owner} value={focusedTask.owner} />
          <SummaryField na={dict.na} label={dict.lastComm} value={lastCommMessage} />
          <SummaryField na={dict.na} label={dict.lastUpdated} value={fmtDate(lastUpdatedAt, dict.na)} />
          <div className="col-span-2">
            <SummaryField na={dict.na} label={dict.mainRequirement} value={focusedTask.inquirySummary || focusedTask.goal} />
          </div>
          <div className="col-span-2">
            <SummaryField na={dict.na} label={dict.notes} value={focusedTask.notes} />
          </div>
        </div>
      </div>

      {/* Top actions — pure shortcuts into the Tabs below, no second form/upload UI */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setEditing(false); setShowAddBusinessForm(false); setTab('action'); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <MessageSquarePlus className="w-3.5 h-3.5" /> {dict.actionAddComm}
        </button>
        <button onClick={() => { setEditing(false); setTab('business'); setShowAddBusinessForm(true); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <Plus className="w-3.5 h-3.5" /> {dict.actionAddBusiness}
        </button>
        <button onClick={() => { setEditing(false); setShowAddBusinessForm(false); setTab('files'); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <UploadCloud className="w-3.5 h-3.5" /> {dict.actionUploadFiles}
        </button>
        <button onClick={() => { setShowAddBusinessForm(false); setTab('info'); setEditing(true); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}40` }}>
          <Edit2 className="w-3.5 h-3.5" /> {dict.actionEditProfile}
        </button>
      </div>

      {/* Body — 6 formal tabs, same state/logic the top actions above trigger */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <CustomerWorkspaceBody
          task={focusedTask}
          relatedTasks={relatedTasks}
          customerCode={customerCode}
          tab={tab}
          onTabChange={setTab}
          editing={editing}
          onEditingChange={setEditing}
          showAddBusinessForm={showAddBusinessForm}
          onShowAddBusinessFormChange={setShowAddBusinessForm}
          dict={dict}
          onSave={onSave}
          onUpdateTask={onUpdateTask}
          onUpdateAnyTask={onUpdateAnyTask}
          onGoToBusiness={onGoToBusiness}
          onCreateBusiness={onCreateBusiness}
        />
      </div>
    </div>
  );
}
