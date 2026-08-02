import React, { useMemo, useState } from 'react';
import { X, Sparkles, PenLine, Users, Search, ChevronRight } from 'lucide-react';
import type { FollowUpTask, Project } from '../types';
import AIIntakePanel from './AIIntakePanel';

const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';

type Mode = 'ai' | 'manual' | 'existing';

interface ManualFields {
  clientName: string;
  businessType: 'TRADE' | 'PROJECT';
  contactPerson: string;
  phoneE164: string;
  whatsapp: string;
  email: string;
  countryCity: string;
  goal: string;
  tradeStatus: string;
  owner: string;
}

const EMPTY_MANUAL: ManualFields = {
  clientName: '', businessType: 'TRADE', contactPerson: '', phoneE164: '', whatsapp: '',
  email: '', countryCity: '', goal: '', tradeStatus: '新询盘', owner: '本人',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: T3 }}>{children}</label>;
}
const inputCls = "w-full px-3 py-2 rounded-xl text-xs font-medium outline-none";
const inputStyle = { background: CARD2, border: `1px solid ${BORDER}`, color: T1 } as const;

export default function UnifiedIntakeModal({
  open, onClose, tasks, projects, isLoading, onAdd, onAppendFollowUp,
}: {
  open: boolean;
  onClose: () => void;
  tasks: FollowUpTask[];
  projects: Project[];
  isLoading: boolean;
  onAdd: (data: Partial<FollowUpTask>) => Promise<void>;
  onAppendFollowUp: (taskId: string, log: { content: string; nextDate: string; method: string }) => void;
}) {
  const [mode, setMode] = useState<Mode>('ai');
  const [manual, setManual] = useState<ManualFields>(EMPTY_MANUAL);
  const [saving, setSaving] = useState(false);

  // "existing" tab state
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FollowUpTask | null>(null);
  const [existingAction, setExistingAction] = useState<'followup' | 'newBusiness' | null>(null);
  const [followUpContent, setFollowUpContent] = useState('');
  const [followUpNext, setFollowUpNext] = useState('');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return tasks.filter(t =>
      (t.clientName || '').toLowerCase().includes(q) ||
      (t.phoneE164 || '').includes(q) ||
      (t.whatsapp || '').includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [tasks, search]);

  if (!open) return null;

  const resetAndClose = () => {
    setMode('ai'); setManual(EMPTY_MANUAL); setSearch(''); setSelected(null);
    setExistingAction(null); setFollowUpContent(''); setFollowUpNext('');
    onClose();
  };

  const saveManual = async () => {
    if (!manual.clientName.trim()) return;
    setSaving(true);
    try {
      // Same shape handleAddTask already expects from AIIntakePanel — this is
      // the one save path both flows share, so a manual record becomes a real
      // FollowUpTask (+ Notion SB Pool / Business Master + Follow-up Log
      // write) instead of the old orphaned `projects` array that never
      // rendered anywhere.
      await onAdd({
        clientName: manual.clientName.trim(),
        businessType: manual.businessType,
        countryCity: manual.countryCity.trim(),
        phoneE164: manual.phoneE164.trim(),
        whatsapp: manual.whatsapp.trim(),
        email: manual.email.trim(),
        goal: manual.goal.trim(),
        lastContext: manual.goal.trim(),
        owner: manual.owner.trim() || '本人',
        ...({ tradeStatus: manual.tradeStatus, contactPerson: manual.contactPerson.trim() } as any),
      });
      resetAndClose();
    } finally {
      setSaving(false);
    }
  };

  const saveFollowUp = () => {
    if (!selected || !followUpContent.trim()) return;
    onAppendFollowUp(selected.id, {
      content: followUpContent.trim(),
      nextDate: followUpNext || new Date().toISOString().slice(0, 10),
      method: 'WhatsApp',
    });
    resetAndClose();
  };

  const startNewBusinessForSelected = () => {
    if (!selected) return;
    setManual({
      ...EMPTY_MANUAL,
      clientName: selected.clientName || '',
      businessType: (selected.businessType === 'PROJECT' ? 'PROJECT' : 'TRADE'),
      phoneE164: selected.phoneE164 || '',
      whatsapp: selected.whatsapp || '',
      email: selected.email || '',
      countryCity: selected.countryCity || '',
      owner: selected.owner || '本人',
    });
    setMode('manual');
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-2xl max-h-[88vh] rounded-3xl overflow-hidden flex flex-col" style={{ background: '#0A1628', border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <h3 className="text-sm font-black" style={{ color: T1 }}>新增客户 / 业务</h3>
          <button onClick={resetAndClose} className="p-1.5 rounded-lg hover:bg-white/5"><X className="w-4 h-4" style={{ color: T3 }} /></button>
        </div>

        <div className="flex gap-1.5 px-5 pt-4">
          {([
            ['ai', <Sparkles key="i" className="w-3.5 h-3.5" />, '智能识别建档'],
            ['manual', <PenLine key="i" className="w-3.5 h-3.5" />, '手工快速建档'],
            ['existing', <Users key="i" className="w-3.5 h-3.5" />, '给已有客户添加跟进'],
          ] as const).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={mode === id ? { background: GOLD, color: '#fff' } : { background: CARD2, color: T2, border: `1px solid ${BORDER}` }}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'ai' && (
            <AIIntakePanel
              onAdd={async (data) => { await onAdd(data); resetAndClose(); }}
              isLoading={isLoading}
              projects={projects}
            />
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>客户或公司名称 *</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.clientName}
                    onChange={e => setManual(m => ({ ...m, clientName: e.target.value }))} placeholder="必填" /></div>
                <div><FieldLabel>客户类型</FieldLabel>
                  <select className={inputCls} style={inputStyle} value={manual.businessType}
                    onChange={e => setManual(m => ({ ...m, businessType: e.target.value as any }))}>
                    <option value="TRADE">贸易型</option>
                    <option value="PROJECT">项目型</option>
                  </select></div>
                <div><FieldLabel>联系人</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.contactPerson}
                    onChange={e => setManual(m => ({ ...m, contactPerson: e.target.value }))} /></div>
                <div><FieldLabel>国家</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.countryCity}
                    onChange={e => setManual(m => ({ ...m, countryCity: e.target.value }))} /></div>
                <div><FieldLabel>电话</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.phoneE164}
                    onChange={e => setManual(m => ({ ...m, phoneE164: e.target.value }))} /></div>
                <div><FieldLabel>WhatsApp</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.whatsapp}
                    onChange={e => setManual(m => ({ ...m, whatsapp: e.target.value }))} /></div>
                <div><FieldLabel>邮箱</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.email}
                    onChange={e => setManual(m => ({ ...m, email: e.target.value }))} /></div>
                <div><FieldLabel>当前阶段</FieldLabel>
                  <select className={inputCls} style={inputStyle} value={manual.tradeStatus}
                    onChange={e => setManual(m => ({ ...m, tradeStatus: e.target.value }))}>
                    {['新询盘', '需求整理中', '待报价', '已报价待确认', '合同待签', '执行中'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div className="col-span-2"><FieldLabel>需求摘要</FieldLabel>
                  <textarea className={inputCls} style={{ ...inputStyle, minHeight: 64 }} value={manual.goal}
                    onChange={e => setManual(m => ({ ...m, goal: e.target.value }))} /></div>
                <div><FieldLabel>负责人</FieldLabel>
                  <input className={inputCls} style={inputStyle} value={manual.owner}
                    onChange={e => setManual(m => ({ ...m, owner: e.target.value }))} /></div>
              </div>
              <button
                onClick={saveManual}
                disabled={!manual.clientName.trim() || saving}
                className="w-full py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                style={{ background: GOLD, color: '#fff' }}
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <p className="text-[10px]" style={{ color: T3 }}>
                项目型客户写入/复用项目客户库，贸易型客户写入/复用小B/C客户池，并同时创建 Follow-up Log 记录——保存后会立即出现在"客户档案"与"项目与业务"列表中。
              </p>
            </div>
          )}

          {mode === 'existing' && !selected && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T3 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="按客户姓名、电话、WhatsApp、邮箱搜索…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-medium outline-none"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                {matches.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}
                  >
                    <div>
                      <div className="text-xs font-black" style={{ color: T1 }}>{t.clientName || '未命名客户'}</div>
                      <div className="text-[10px]" style={{ color: T3 }}>{[t.phoneE164, t.whatsapp, t.email].filter(Boolean).join(' · ') || '联系方式待补充'}</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: T3 }} />
                  </button>
                ))}
                {search.trim() && matches.length === 0 && (
                  <div className="text-xs text-center py-6" style={{ color: T3 }}>未找到匹配客户，可切换到"手工快速建档"新建。</div>
                )}
              </div>
            </div>
          )}

          {mode === 'existing' && selected && !existingAction && (
            <div className="space-y-3">
              <button onClick={() => setSelected(null)} className="text-[11px] font-bold" style={{ color: T2 }}>← 重新搜索</button>
              <div className="p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="text-sm font-black" style={{ color: T1 }}>{selected.clientName}</div>
                <div className="text-[11px] mt-0.5" style={{ color: T3 }}>{[selected.phoneE164, selected.whatsapp, selected.email].filter(Boolean).join(' · ') || '联系方式待补充'}</div>
              </div>
              <button onClick={() => setExistingAction('followup')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all"
                style={{ background: CARD2, color: T1, border: `1px solid ${BORDER}` }}>
                新增一条沟通记录 <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={startNewBusinessForSelected}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all"
                style={{ background: CARD2, color: T1, border: `1px solid ${BORDER}` }}>
                为该客户新增第二个项目/业务 <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <p className="text-[10px]" style={{ color: T3 }}>新增第二个项目/业务会创建一条独立的新记录，不会覆盖或修改现有记录的阶段。</p>
            </div>
          )}

          {mode === 'existing' && selected && existingAction === 'followup' && (
            <div className="space-y-3">
              <button onClick={() => setExistingAction(null)} className="text-[11px] font-bold" style={{ color: T2 }}>← 返回</button>
              <div><FieldLabel>沟通摘要 *</FieldLabel>
                <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80 }} value={followUpContent}
                  onChange={e => setFollowUpContent(e.target.value)} placeholder="客户说了什么？下一步是什么？" /></div>
              <div><FieldLabel>下次跟进日期</FieldLabel>
                <input type="date" className={inputCls} style={inputStyle} value={followUpNext}
                  onChange={e => setFollowUpNext(e.target.value)} /></div>
              <button
                onClick={saveFollowUp}
                disabled={!followUpContent.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                style={{ background: GOLD, color: '#fff' }}
              >
                保存跟进记录
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
