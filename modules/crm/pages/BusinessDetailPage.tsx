import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { findCustomerByCode } from '../utils/customerCode';
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
  businessKey: string;
  tasks: FollowUpTask[];
  hydrated: boolean;
  dict: WorkspaceDict;
  onBack: () => void;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask: (task: FollowUpTask) => void;
  onCreateBusiness: (formData: Partial<FollowUpTask>) => void;
}

export default function BusinessDetailPage({
  customerCode, businessKey, tasks, hydrated, dict, onBack, onSave, onUpdateTask, onCreateBusiness,
}: Props) {
  const [tab, setTab] = useState<WorkspaceTab>('info');
  const [editing, setEditing] = useState(false);
  const [showAddBusinessForm, setShowAddBusinessForm] = useState(false);

  const lookup = useMemo(() => findCustomerByCode(tasks, customerCode), [tasks, customerCode]);
  const group = lookup ? [lookup.task, ...lookup.relatedTasks] : [];
  const businessTask = group.find(t => t.id === businessKey) || null;

  if (!hydrated) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center" style={{ color: T2 }}>
        <div className="text-sm font-bold">{dict.loading}</div>
      </div>
    );
  }

  if (!lookup || !businessTask) {
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

  const projectCode = (businessTask as any).projectCode as string | undefined;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
        <ArrowLeft className="w-3.5 h-3.5" /> {dict.backToList}
      </button>

      {/* Top summary — 项目编码/客户编码/客户名称/项目业务名称/当前阶段 */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>{projectCode || dict.noProjectCode}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: T2 }}>{customerCode}</span>
          <h1 className="text-2xl font-black" style={{ color: T1 }}>{businessTask.inquirySummary || businessTask.goal || dict.unnamedBusiness}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${GOLD}18`, color: GOLD }}>{businessTask.tradeStatus || dict.na}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.customerName}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{businessTask.clientName || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.customerType}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{TYPE_LABEL[businessTask.businessType] || businessTask.businessType}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.currentStage}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{businessTask.tradeStatus || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.owner}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: businessTask.owner ? T1 : T3 }}>{businessTask.owner || dict.na}</div>
          </div>
          <div className="col-span-2 md:col-span-4">
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.mainRequirement}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{businessTask.inquirySummary || businessTask.goal || dict.na}</div>
          </div>
        </div>
      </div>

      {/* Body — same 6-tab implementation as the customer workspace, scoped
          to just this business (no sibling businesses passed in). */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <CustomerWorkspaceBody
          task={businessTask}
          relatedTasks={[]}
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
          onCreateBusiness={onCreateBusiness}
        />
      </div>
    </div>
  );
}
