import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { findCustomerByCode } from '../utils/customerCode';
import ProjectDetailBody from '../components/ProjectDetailBody';
import type { ProjectDetailTab } from '../components/ProjectDetailBody';
import type { WorkspaceDict } from '../components/CustomerWorkspaceBody';

const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';

interface Props {
  customerCode: string;
  businessKey: string;
  tasks: FollowUpTask[];
  hydrated: boolean;
  dict: WorkspaceDict;
  onBack: () => void;
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  onUpdateTask: (task: FollowUpTask) => void;
}

export default function BusinessDetailPage({
  customerCode, businessKey, tasks, hydrated, dict, onBack, onSave, onUpdateTask,
}: Props) {
  const [tab, setTab] = useState<ProjectDetailTab>('overview');
  const [editing, setEditing] = useState(false);

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

  const master = (businessTask as any).projectMaster as import('../types').ProjectMaster | undefined;
  // Real Business Master 项目ID takes priority; never surfaces the raw
  // Notion page id as if it were a formal project code.
  const displayProjectId = master?.projectId || (businessTask as any).projectCode || dict.noProjectMaster;
  const projectName = master?.projectName || businessTask.inquirySummary || businessTask.goal || dict.na;
  const projectLocation = master ? [master.city, master.country].filter(Boolean).join(' · ') : (businessTask.countryCity || '');
  const lastUpdatedAt = businessTask.updatedAt || businessTask.createdAt || '';

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
        <ArrowLeft className="w-3.5 h-3.5" /> {dict.backToList}
      </button>

      {/* Top summary — 项目级，不是客户级 */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>{dict.projectCodeBadgeLabel}：{displayProjectId}</span>
          {/* projectId and customerCode are frequently the same value for
              PROJECT-type businesses — showing both as identical badges was
              a duplicate, not two distinct identifiers. */}
          {customerCode && customerCode !== displayProjectId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: T2 }}>{dict.customerCodeLabel}：{customerCode}</span>
          )}
          <h1 className="text-2xl font-black" style={{ color: T1 }}>{projectName}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${GOLD}18`, color: GOLD }}>{businessTask.tradeStatus || dict.na}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.belongsToCustomerLabel}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{businessTask.clientName || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.projectLocationLabel}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: projectLocation ? T1 : T3 }}>{projectLocation || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.projectStageLabel}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: master?.projectStage ? T1 : T3 }}>{master?.projectStage || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.owner}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: businessTask.owner ? T1 : T3 }}>{businessTask.owner || dict.na}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: T3 }}>{dict.lastUpdated}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: T1 }}>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleDateString('zh-CN') : dict.na}</div>
          </div>
        </div>
      </div>

      {/* Body — genuine project-level tabs, not the customer workspace */}
      <div className="rounded-[18px] border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <ProjectDetailBody
          task={businessTask}
          tab={tab}
          onTabChange={setTab}
          editing={editing}
          onEditingChange={setEditing}
          dict={dict}
          onSave={onSave}
          onUpdateTask={onUpdateTask}
        />
      </div>
    </div>
  );
}
