import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, MessageSquarePlus, UploadCloud, Edit2 } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { findCustomerByCode, getCustomerCode } from '../utils/customerCode';
import { isRealCommLog } from '../utils/commLog';
import CustomerWorkspaceBody from '../components/CustomerWorkspaceBody';
import type { WorkspaceTab } from '../components/CustomerWorkspaceBody';

const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';
const PLACEHOLDER = '待补充';
const TYPE_LABEL: Record<string, string> = { TRADE: '贸易型', PROJECT: '项目型', LOG_ONLY: '内部', INTERNAL: '内部' };

interface WorkspaceDict {
  tabInfo: string; tabBusiness: string; tabComms: string; tabFiles: string; tabQuotes: string;
  backToList: string;
  actionAddComm: string; actionAddBusiness: string; actionUploadFiles: string; actionEditProfile: string;
  loading: string; notFoundTitle: string; notFoundDesc: string;
  customerCode: string; customerName: string; customerType: string; countryCity: string;
  contactPerson: string; phone: string; whatsapp: string; email: string;
  currentStage: string; owner: string; lastComm: string; lastUpdated: string; mainRequirement: string;
}

interface Props {
  customerCode: string;
  tasks: FollowUpTask[];
  hydrated: boolean;
  dict: WorkspaceDict;
  onBack: () => void;
  onAddBusiness: () => void;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask: (task: FollowUpTask) => void;
  onUpdateAnyTask: (task: FollowUpTask) => void;
}

function fmtDate(iso?: string): string {
  if (!iso) return PLACEHOLDER;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? PLACEHOLDER : d.toLocaleDateString('zh-CN');
}

function SummaryField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{label}</div>
      <div className="text-sm font-bold mt-0.5 truncate" style={{ color: value ? T1 : T3 }}>{value || PLACEHOLDER}</div>
    </div>
  );
}

export default function CustomerWorkspacePage({
  customerCode, tasks, hydrated, dict, onBack, onAddBusiness, onSave, onUpdateTask, onUpdateAnyTask,
}: Props) {
  const [tab, setTab] = useState<WorkspaceTab>('info');
  const [editing, setEditing] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const lookup = useMemo(() => findCustomerByCode(tasks, customerCode), [tasks, customerCode]);
  const group = lookup ? [lookup.task, ...lookup.relatedTasks] : [];
  const focusedTask = (focusedId && group.find(t => t.id === focusedId)) || lookup?.task || null;
  const relatedTasks = focusedTask ? group.filter(t => t.id !== focusedTask.id) : [];

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

  const displayCode = getCustomerCode(focusedTask);
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

      {/* Top summary */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>{displayCode}</span>
          <h1 className="text-2xl font-black" style={{ color: T1 }}>{focusedTask.clientName || PLACEHOLDER}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${GOLD}18`, color: GOLD }}>{focusedTask.tradeStatus || PLACEHOLDER}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <SummaryField label={dict.customerType} value={TYPE_LABEL[focusedTask.businessType] || focusedTask.businessType} />
          <SummaryField label={dict.countryCity} value={focusedTask.countryCity} />
          <SummaryField label={dict.contactPerson} value={(focusedTask as any).contactPerson} />
          <SummaryField label={dict.phone} value={focusedTask.phoneE164} />
          <SummaryField label={dict.whatsapp} value={focusedTask.whatsapp} />
          <SummaryField label={dict.email} value={focusedTask.email} />
          <SummaryField label={dict.currentStage} value={focusedTask.tradeStatus} />
          <SummaryField label={dict.owner} value={focusedTask.owner} />
          <SummaryField label={dict.lastComm} value={lastCommMessage} />
          <SummaryField label={dict.lastUpdated} value={fmtDate(lastUpdatedAt)} />
          <div className="col-span-2 md:col-span-2">
            <SummaryField label={dict.mainRequirement} value={focusedTask.inquirySummary || focusedTask.goal} />
          </div>
        </div>
      </div>

      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setEditing(false); setTab('action'); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <MessageSquarePlus className="w-3.5 h-3.5" /> {dict.actionAddComm}
        </button>
        <button onClick={onAddBusiness} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <Plus className="w-3.5 h-3.5" /> {dict.actionAddBusiness}
        </button>
        <button onClick={() => { setEditing(false); setTab('files'); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          <UploadCloud className="w-3.5 h-3.5" /> {dict.actionUploadFiles}
        </button>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}40` }}>
          <Edit2 className="w-3.5 h-3.5" /> {dict.actionEditProfile}
        </button>
      </div>

      {/* Body */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <CustomerWorkspaceBody
          task={focusedTask}
          relatedTasks={relatedTasks}
          tab={tab}
          onTabChange={setTab}
          editing={editing}
          onEditingChange={setEditing}
          tabLabels={{ info: dict.tabInfo, business: dict.tabBusiness, action: dict.tabComms, files: dict.tabFiles, quotes: dict.tabQuotes }}
          onSave={onSave}
          onUpdateTask={(updated) => { onUpdateTask(updated); if (updated.id === focusedTask.id) setFocusedId(updated.id); }}
          onUpdateAnyTask={onUpdateAnyTask}
          onSwitchTask={(t) => setFocusedId(t.id)}
        />
      </div>
    </div>
  );
}
