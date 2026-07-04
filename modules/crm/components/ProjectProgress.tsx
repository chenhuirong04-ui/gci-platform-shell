
import React, { useState, useMemo, useEffect } from 'react';
import { Project, TradeStatus, ProjectLogEntry } from '../types';
import { Language, translations } from '../services/i18n';
import {
  Briefcase, List, LayoutGrid, Plus, Search, Calendar, MessageSquare, ChevronRight, ShoppingBag, ClipboardList, Clock, User, Phone, Mail, Globe, Tag, Filter, Archive, Trash2,
} from 'lucide-react';
import { colors, statusMap, type StatusKey, Badge } from '@gci/design-system';
import ProjectCopilot from './ProjectCopilot';

const GOLD = colors.goldBase;
const NAVY = colors.bgBase;
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';

// Canonical Notion 行动状态 -> centralized StatusKey, reusing the same 5
// allowed colors instead of the old per-status Tailwind rainbow classes.
const TRADE_STATUS_KEY: Record<string, StatusKey> = {
  '新询盘': 'newInquiry',
  '需求整理中': 'inProgress',
  '待报价': 'inProgress',
  '已报价待确认': 'quoted',
  '执行中': 'confirmed',
  '已成交': 'paid',
  '暂缓': 'paused',
  '已归档': 'otherInquiry',
};

interface ProjectProgressProps {
  projects: Project[];
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onArchiveProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  lang: Language;
  tradeItems: any[];
  onAddTrade: (t: any) => void;
  onUpdateTrade: (t: any) => void;
}

// Canonical Notion status values — must match Notion 行动状态 field exactly
const PROJECT_STAGES: TradeStatus[] = ['新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '已成交', '暂缓', '已归档'];
const TRADE_STAGES: TradeStatus[]   = ['新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '已成交', '暂缓', '已归档'];

// ── 统一项目判断函数（三视图共用同一套逻辑）────────────────────────
const PROJECT_KW = [
  'project', '项目', 'the grove', '工程', '施工', 'ff&e', 'villa',
  'apartment', 'fitout', 'fit-out', 'fit out', 'interior', 'renovation',
  'hotel', 'office', 'resort', 'building', 'construction', 'design',
  '设计', '装修', '室内', '家具', 'furniture', '酒店', '公寓', '办公',
];

const isProjectRecord = (p: Project): boolean => {
  // 1. 显式 type 字段（最优先，贸易型直接短路，不再走关键词）
  if (p.type === '项目型') return true;
  if (p.type === '贸易型') return false;  // ← FIX: 防止贸易型被关键词误判为项目
  // 2. businessType / recordType
  const bt = ((p as any).businessType || '').toLowerCase().trim();
  const rt = ((p as any).recordType  || '').toLowerCase().trim();
  if (['project', '项目', '项目推进'].includes(bt)) return true;
  if (['project', '项目推进', '项目'].includes(rt)) return true;
  // 3. 关键词匹配（多字段兜底）
  const text = [
    p.name, p.clientName, p.initialContext,
    (p as any).goal, (p as any).inquirySummary,
    (p as any).lastNote, (p as any).summary,
    (p as any).categories, (p as any).tags,
  ].filter(Boolean).join(' ').toLowerCase();
  return PROJECT_KW.some(kw => text.includes(kw));
};

// Use Notion tradeStatus directly — no legacy mapping
const normalizeProjectStatus = (tradeStatus: string | undefined): TradeStatus => {
  return (tradeStatus || '新询盘') as TradeStatus;
};

const ProjectProgress: React.FC<ProjectProgressProps> = ({
  projects, onAddProject, onUpdateProject, onArchiveProject, onDeleteProject, lang,
}) => {
  // 视图类型：列表、看板、贸易跟进
  const [viewType, setViewType] = useState<'list' | 'kanban' | 'tradeFollowup'>('list');
  // 业务分流：项目、贸易、全部
  const [filterType, setFilterType] = useState<'项目型' | '贸易型' | '全部'>('全部');
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [followUpContent, setFollowUpContent] = useState('');
  const [followUpMethod, setFollowUpMethod] = useState('微信/WhatsApp');
  const [nextFollowDate, setNextFollowDate] = useState('');

  // 联动切换：切换分流时自动选择最适合的视图
  const handleFilterChange = (type: '项目型' | '贸易型' | '全部') => {
    setFilterType(type);
    if (type === '项目型') setViewType('kanban');
    else if (type === '贸易型') setViewType('tradeFollowup');
    else setViewType('list');
    setSelectedProjectId(''); // 切换分流时清空当前选中，避免列表显示不匹配
  };

  const filtered = useMemo(() => {
    // Statuses that must NOT appear in the active project list
    const EXCLUDED_STATUSES = new Set(['暂缓', '已归档']);

    // ── Step 1: date-sort so dedup always keeps the most-recent entry ────────
    const sorted = [...projects].sort(
      (a, b) =>
        new Date((b as any).nextActionAt || b.createdAt || 0).getTime() -
        new Date((a as any).nextActionAt || a.createdAt || 0).getTime()
    );

    const seenBizIds = new Set<string>();

    const deduped = sorted.filter(p => {
      if (!p.id) return false;
      if (EXCLUDED_STATUSES.has(p.tradeStatus || '')) return false;

      const bizKey = ((p as any).businessId || '').trim().toLowerCase() || p.id;
      if (seenBizIds.has(bizKey)) return false;
      seenBizIds.add(bizKey);

      const matchesSearch =
        !searchTerm ||
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const isProject = isProjectRecord(p);
      const matchesFilter =
        filterType === '全部' ||
        (filterType === '项目型' ? isProject : !isProject);

      return matchesSearch && matchesFilter;
    });

    // ── Step 2: sort by businessId number ascending; no-id entries go last ──
    // Extract trailing number from IDs like "2026-005" → 5, "SB-003" → 3.
    const bizNum = (p: any): number => {
      const biz = (p.businessId || '').trim();
      if (!biz) return Infinity;
      const m = biz.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : Infinity;
    };

    return deduped.sort((a, b) => bizNum(a) - bizNum(b));
  }, [projects, searchTerm, filterType]);

  // ── DIAGNOSTIC: dump all fields for every filtered card ──────────────────
  // Remove this block once field mapping is confirmed correct.
  React.useEffect(() => {
    if (filtered.length === 0) return;
    console.log('[ProjectProgress] filtered count:', filtered.length);
    console.table(filtered.map((p: any) => ({
      clientName:        p.clientName,
      title:             p.title,
      projectName:       p.projectName,
      businessId:        p.businessId,
      projectId:         p.projectId,
      bizProjectId:      p.bizProjectId,
      displayProjectId:  p.displayProjectId,
      tradeStatus:       p.tradeStatus,
      status:            p.status,
      notionSource:      p.notionSource,
      source:            p.source,
      // extra — common fallback fields worth checking
      id:                p.id,
      name:              p.name,
      type:              p.type,
      initialContext:    (p.initialContext || '').slice(0, 40),
    })));
  }, [filtered]);
  // ── END DIAGNOSTIC ────────────────────────────────────────────────────────

  const selected = projects.find(p => p.id === selectedProjectId);

  const handleAddFollowUp = () => {
    if (!selected || !followUpContent.trim()) return;
    const now = new Date().toLocaleString('zh-CN');
    const newLog: ProjectLogEntry = {
      content: `【${followUpMethod}】${followUpContent}${nextFollowDate ? `\n(预定下次跟进: ${nextFollowDate})` : ''}`,
      time: now,
      author: '本人'
    };
    onUpdateProject({
      ...selected,
      projectFollowUps: [newLog, ...(selected.projectFollowUps || [])],
      nextActionAt: nextFollowDate || selected.nextActionAt
    });
    setFollowUpContent('');
    setNextFollowDate('');
  };

  const KanbanColumn: React.FC<{ stage: TradeStatus, items: Project[] }> = ({ stage, items }) => (
    <div className="min-w-[300px] w-[300px] flex flex-col gap-4">
      <div className="px-5 py-4 rounded-[24px] flex items-center justify-between shrink-0" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
         <span className="text-xs font-black uppercase tracking-widest" style={{ color: T1 }}>{stage}</span>
         <span className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.07)', color: T2 }}>{items.length}</span>
      </div>
      <div className="flex-grow overflow-y-auto space-y-4 pb-12 pr-2 custom-scrollbar">
        {items.map(p => (
          <div key={p.id} onClick={() => { setSelectedProjectId(p.id); setViewType('list'); }} className="p-5 rounded-[28px] transition-all cursor-pointer group animate-slideIn" style={{ background: CARD2, border: `1px solid ${BORDER}` }} onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD + '60')} onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
            <div className="flex justify-between items-start mb-2">
              <Badge color={p.type === '贸易型' ? GOLD : colors.statusInfo} bg={p.type === '贸易型' ? `${GOLD}18` : 'rgba(143,166,212,0.16)'} label={p.type} className="uppercase" />
              <span className="text-[13px] font-bold" style={{ color: T2 }}>ID: {p.id.slice(-4)}</span>
            </div>
            <h4 className="text-sm font-black mb-1 leading-tight line-clamp-2" style={{ color: T1 }}>{p.name}</h4>
            <p className="text-[13px] font-bold mb-3" style={{ color: T2 }}>{p.clientName} · {p.countryCity}</p>
            <div className="pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${BORDER}` }}>
              <span className="text-[12px] font-black uppercase" style={{ color: T2 }}>{p.owner}</span>
              <ChevronRight className="w-4 h-4" style={{ color: T2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-180px)]">
      {/* SALES 分区页面标题，跟控制中心/客户跟进保持一致的标题样式 */}
      <h1 className="text-2xl font-semibold" style={{ color: T1, fontFamily: "'Space Grotesk',sans-serif" }}>业务中心</h1>

      {/* 顶部控制栏：业务分流器 + 视图切换 */}
      <div className="p-5 rounded-[32px] shadow-sm flex flex-col gap-6 shrink-0" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               <div className="p-2.5 rounded-2xl text-white shadow-lg" style={{ backgroundColor: GOLD }}><Briefcase className="w-5 h-5" /></div>
               <div>
                  <h3 className="text-sm font-black uppercase tracking-tight" style={{ color: T1 }}>业务跟进中心</h3>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: T2 }}>项目客户与贸易询盘统一跟进</p>
               </div>
            </div>

            {/* 业务分流器 (Segmented Control) */}
            <div className="flex p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}` }}>
               <button onClick={() => handleFilterChange('全部')} className="px-6 py-2.5 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={filterType === '全部' ? { backgroundColor: CARD2, color: GOLD, border: `1px solid ${BORDER}` } : { color: T2 }}>全部业务</button>
               <button onClick={() => handleFilterChange('项目型')} className="px-6 py-2.5 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={filterType === '项目型' ? { backgroundColor: GOLD, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' } : { color: T2 }}>项目型客户</button>
               <button onClick={() => handleFilterChange('贸易型')} className="px-6 py-2.5 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={filterType === '贸易型' ? { backgroundColor: GOLD, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' } : { color: T2 }}>贸易型询盘</button>
            </div>

            <button onClick={() => setShowAddModal(true)} className="px-6 py-3 text-white rounded-2xl text-[13px] font-black uppercase shadow-xl hover:opacity-90 transition-all active:scale-95" style={{ backgroundColor: GOLD }}><Plus className="w-4 h-4 inline mr-2" /> 手动建档</button>
         </div>

         <div className="h-px w-full" style={{ background: BORDER }} />

         <div className="flex items-center justify-center">
            <div className="flex p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
               <button onClick={() => setViewType('list')} className="px-8 py-2 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={viewType === 'list' ? { backgroundColor: CARD2, color: GOLD, border: `1px solid ${BORDER}` } : { color: T2 }}><List className="w-3.5 h-3.5" /> 业务列表</button>
               <button onClick={() => setViewType('kanban')} className="px-8 py-2 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={viewType === 'kanban' ? { backgroundColor: CARD2, color: GOLD, border: `1px solid ${BORDER}` } : { color: T2 }}><ClipboardList className="w-3.5 h-3.5" /> 项目进度</button>
               <button onClick={() => setViewType('tradeFollowup')} className="px-8 py-2 rounded-xl text-[13px] font-black uppercase transition-all flex items-center gap-2"
                 style={viewType === 'tradeFollowup' ? { backgroundColor: CARD2, color: GOLD, border: `1px solid ${BORDER}` } : { color: T2 }}><ShoppingBag className="w-3.5 h-3.5" /> 贸易跟进</button>
            </div>
         </div>
      </div>

      {/* ── Project AI Copilot — temporarily hidden (data not yet reliable) ─ */}
      {/* <ProjectCopilot
        projects={projects}
        onSelectProject={(id) => { setSelectedProjectId(id); setViewType('list'); }}
      /> */}

      <div className="flex-grow overflow-hidden">
        {viewType === 'list' ? (
          <div className="h-full flex flex-col lg:flex-row gap-8">
            <aside className="w-full lg:w-80 h-full overflow-y-auto custom-scrollbar pr-2 space-y-3 shrink-0">
               <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T2 }} />
                  <input type="text" placeholder={`搜索${filterType === '全部' ? '业务' : filterType}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-3 rounded-2xl text-[13px] font-bold outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }} />
               </div>
               <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T2 }}>{filterType === '项目型' ? '项目列表' : filterType === '贸易型' ? '贸易询盘列表' : '全部档案列表'}</span>
                  <span className="text-[9px] font-bold" style={{ color: T2 }}>{filtered.length} 条</span>
               </div>
               {filtered.map(p => {
                 const bizId   = ((p as any).businessId || '').trim();
                 const isActive = selectedProjectId === p.id;

                 // Line 1 label: "2026-014 | ADNOC" or "待建档 | clientName"
                 const idLabel  = bizId || '待建档';
                 const nameLabel = p.clientName || p.name || '未命名';

                 // Line 2: tradeStatus badge — centralized status color, not per-status Tailwind classes
                 const statusKey = TRADE_STATUS_KEY[p.tradeStatus || '新询盘'] || 'newInquiry';
                 const s = statusMap[statusKey];

                 // Line 3: latest follow-up note (trimmed to 45 chars)
                 const latestNote = (p.initialContext || '').trim();
                 const notePreview = latestNote.length > 45
                   ? latestNote.slice(0, 45) + '…'
                   : latestNote;

                 return (
                   <button
                     key={p.id}
                     onClick={() => setSelectedProjectId(p.id)}
                     className="w-full text-left px-5 py-4 rounded-[24px] border transition-all"
                     style={isActive
                       ? { backgroundColor: `${GOLD}18`, borderColor: GOLD, color: T1 }
                       : { backgroundColor: CARD2, borderColor: BORDER, color: T1 }}
                   >
                     {/* ── Row 1: ID + client name (prominent) ── */}
                     <div className="flex items-start justify-between gap-2 mb-1.5">
                       <p className="text-sm font-black leading-tight" style={{ color: T1 }}>
                         <span className="font-mono mr-1" style={{ color: GOLD }}>{idLabel}</span>
                         <span>| {nameLabel}</span>
                       </p>
                       <Badge
                         color={p.type === '贸易型' ? GOLD : colors.statusInfo}
                         bg={p.type === '贸易型' ? `${GOLD}18` : 'rgba(143,166,212,0.16)'}
                         label={p.type}
                         className="shrink-0 uppercase"
                       />
                     </div>

                     {/* ── Row 2: tradeStatus badge ── */}
                     <Badge color={s.color} bg={s.bg} label={p.tradeStatus || '新询盘'} className="mb-1.5 rounded-lg" />

                     {/* ── Row 3: latest follow-up note preview ── */}
                     {notePreview && (
                       <p className="text-[13px] font-medium leading-snug truncate" style={{ color: T2 }}>
                         最近跟进：{notePreview}
                       </p>
                     )}
                   </button>
                 );
               })}
               {filtered.length === 0 && <div className="py-20 text-center italic text-xs" style={{ color: T2 }}>暂无匹配记录</div>}
            </aside>
            <div className="flex-grow h-full overflow-y-auto rounded-[40px] p-8 custom-scrollbar relative" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {selected ? (
                <div className="space-y-8 pb-20 animate-fadeIn">
                   {/* 档案核心信息区 */}
                   <div className="p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden" style={{ backgroundColor: NAVY }}>
                      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge color="#fff" bg="rgba(255,255,255,0.16)" label={selected.type} className="uppercase" />
                            <span className="text-slate-400 font-bold text-[13px]">档案 ID: {selected.id}</span>
                          </div>
                          <h2 className="text-2xl font-black mb-1">{selected.name}</h2>
                          <div className="flex items-center gap-4 text-sm font-bold text-slate-400">
                             <span className="flex items-center gap-1"><User className="w-4 h-4" /> {selected.clientName}</span>
                             <span className="flex items-center gap-1"><Globe className="w-4 h-4" /> {selected.countryCity}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:items-end">
                          <select value={selected.tradeStatus} onChange={e => onUpdateProject({...selected, tradeStatus: e.target.value as TradeStatus})} className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-[13px] font-black uppercase outline-none cursor-pointer hover:bg-white/20 transition-all">
                            {(selected.type === '贸易型' ? TRADE_STAGES : PROJECT_STAGES).map(s => <option key={s} value={s} className="text-slate-900">{s}</option>)}
                          </select>
                          {/* 项目型 → Quote Type Selection (user chooses path) */}
                          {isProjectRecord(selected) && (
                            <a
                              href={`https://gci-living-engineering-studio.vercel.app/?client=${encodeURIComponent(selected.clientName)}&project=${encodeURIComponent(selected.name)}&salesperson=${encodeURIComponent(selected.owner || '')}&businessId=${encodeURIComponent((selected as any).businessId || '')}&source=DEAL&returnUrl=${encodeURIComponent(window.location.href)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-black transition-all hover:opacity-80"
                              style={{ backgroundColor: GOLD, color: 'white' }}
                            >
                              <span className="flex flex-col items-center gap-0.5">
                                <span>创建报价 Create Quote</span>
                                <span className="text-[9px] font-medium opacity-75 normal-case tracking-normal">进入 GCI Supply Chain Center</span>
                              </span>
                            </a>
                          )}
                          {/* 贸易型 → auto-enter Trade & Sourcing Quote (quoteType=TRADE) */}
                          {!isProjectRecord(selected) && (
                            <a
                              href={`https://gci-living-engineering-studio.vercel.app/?client=${encodeURIComponent(selected.clientName)}&businessId=${encodeURIComponent((selected as any).businessId || '')}&salesperson=${encodeURIComponent(selected.owner || '')}&phone=${encodeURIComponent(selected.phoneE164 || selected.whatsapp || '')}&source=DEAL&quoteType=TRADE&returnUrl=${encodeURIComponent('https://leads.globalcareinfo.com')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-black transition-all hover:opacity-80"
                              style={{ backgroundColor: GOLD, color: 'white' }}
                            >
                              <span className="flex flex-col items-center gap-0.5">
                                <span>创建报价 Create Quote</span>
                                <span className="text-[9px] font-medium opacity-75 normal-case tracking-normal">Trade &amp; Sourcing · GCI Supply Chain Center</span>
                              </span>
                            </a>
                          )}
                          <div className="flex gap-3 text-[13px] font-bold text-slate-400">
                             {selected.whatsapp && <span className="flex items-center gap-1"><Phone className="w-3 h-3" style={{ color: colors.statusSuccess }} /> {selected.whatsapp}</span>}
                             {selected.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selected.email}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><ShoppingBag className="w-32 h-32" /></div>
                   </div>

                   {/* 追加跟进区 */}
                   <div className="p-6 rounded-[32px] space-y-4" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                      <h3 className="text-xs font-black flex items-center gap-2 uppercase tracking-widest" style={{ color: T1 }}><MessageSquare className="w-4 h-4" style={{ color: GOLD }} /> 追加本次跟进事实</h3>
                      <div className="grid grid-cols-2 gap-4">
                         <select value={followUpMethod} onChange={e => setFollowUpMethod(e.target.value)} className="rounded-2xl px-5 py-3 text-[13px] font-bold outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }}><option>微信/WhatsApp</option><option>电话回访</option><option>邮件往来</option><option>面谈会议</option><option>合同签约</option></select>
                         <div className="relative"><Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: T2 }} /><input type="date" value={nextFollowDate} onChange={e => setNextFollowDate(e.target.value)} className="w-full rounded-2xl pl-10 pr-5 py-3 text-[13px] font-bold outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }} /></div>
                      </div>
                      <textarea value={followUpContent} onChange={e => setFollowUpContent(e.target.value)} placeholder="记录核心事实：客户提了什么要求？我们的对策是什么？下一步何时联系？" className="w-full rounded-2xl px-6 py-4 text-sm font-bold outline-none h-32 resize-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: T1 }} />
                      <button onClick={handleAddFollowUp} className="w-full text-white py-4 rounded-2xl font-black text-[13px] uppercase shadow-lg hover:opacity-90 active:scale-95 transition-all" style={{ backgroundColor: GOLD }}>提交跟进记录</button>
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => { if (window.confirm('确定归档此业务档案？')) { onArchiveProject(selected.id); setSelectedProjectId(''); } }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[13px] font-black transition-all"
                          style={{ backgroundColor: statusMap.inProgress.bg, color: statusMap.inProgress.color, border: `1px solid ${statusMap.inProgress.color}40` }}
                        >
                          <Archive className="w-3.5 h-3.5" /> 归档
                        </button>
                        <button
                          onClick={() => { if (window.confirm('确定删除此业务档案？可在历史记录查看。')) { onDeleteProject(selected.id); setSelectedProjectId(''); } }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[13px] font-black transition-all"
                          style={{ backgroundColor: statusMap.urgent.bg, color: statusMap.urgent.color, border: `1px solid ${statusMap.urgent.color}40` }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 删除
                        </button>
                      </div>
                   </div>

                   {/* 记录时间轴 */}
                   <div className="space-y-6 relative">
                      <div className="absolute left-6 top-4 bottom-4 w-px" style={{ background: BORDER }} />
                      <h3 className="text-xs font-black uppercase tracking-widest ml-12" style={{ color: T2 }}>历史推进轨迹</h3>
                      {selected.projectFollowUps?.map((log, i) => (
                        <div key={i} className="relative pl-16 animate-fadeIn">
                          <div className="absolute left-4 top-2 w-4 h-4 rounded-full z-10" style={{ background: CARD, border: `4px solid ${GOLD}` }} />
                          <div className="p-5 rounded-[24px]" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                             <div className="flex items-center justify-between mb-2"><span className="text-[13px] font-black flex items-center gap-1" style={{ color: GOLD }}><Clock className="w-3 h-3" /> {log.time}</span><span className="text-[12px] font-bold" style={{ color: T2 }}>主责人: {log.author}</span></div>
                             <p className="text-sm font-bold whitespace-pre-wrap leading-relaxed" style={{ color: T1 }}>{log.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="relative pl-16">
                         <div className="absolute left-4 top-2 w-4 h-4 rounded-full border-4 z-10" style={{ borderColor: CARD2, backgroundColor: `${GOLD}30` }} />
                         <div className="p-5 rounded-[24px] opacity-60" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
                            <span className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: T2 }}>初始录入背景</span>
                            <p className="text-sm font-bold italic" style={{ color: T1 }}>{selected.initialContext}</p>
                         </div>
                      </div>
                   </div>
                </div>
              ) : <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: T2 }}><Briefcase className="w-16 h-16 opacity-10" /><p className="font-black uppercase tracking-widest text-sm italic">请选择项目或贸易项开始推进</p></div>}
            </div>
          </div>
        ) : viewType === 'kanban' ? (
          <div className="flex gap-6 overflow-x-auto h-full pb-6 custom-scrollbar animate-fadeIn">
            {PROJECT_STAGES.map(s => <KanbanColumn key={s} stage={s} items={filtered.filter(p => isProjectRecord(p) && normalizeProjectStatus(p.tradeStatus) === s)} />)}
          </div>
        ) : (
          <div className="flex gap-6 overflow-x-auto h-full pb-6 custom-scrollbar animate-fadeIn">
            {TRADE_STAGES.map(s => <KanbanColumn key={s} stage={s} items={filtered.filter(p => !isProjectRecord(p) && (p.tradeStatus || '新询盘') === s)} />)}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6"><div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
        <form onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as any;
          const ptype = form.ptype.value as any;
          onAddProject({
            id: `P_${Date.now()}`, name: form.pname.value, clientName: form.cname.value, countryCity: form.city.value,
            contactKey: "", type: ptype, owner: '本人', status: '进行中', tradeStatus: ptype === '贸易型' ? '新询盘' : '新建',
            initialContext: "手动创建", projectFollowUps: [], attachments: [], createdAt: new Date().toISOString()
          });
          setShowAddModal(false);
        }} className="relative rounded-[40px] p-10 w-full max-w-lg shadow-2xl space-y-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <h2 className="text-xl font-black uppercase text-center" style={{ color: T1 }}>创建业务档案</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <select name="ptype" className="rounded-2xl px-5 py-4 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}>
                <option value="项目型">项目型</option><option value="贸易型">贸易型</option>
              </select>
              <input name="city" required type="text" placeholder="国家 / 城市" className="w-full rounded-2xl px-6 py-4 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }} />
            </div>
            <input name="pname" required type="text" placeholder="档案名称 / 方案名称" className="w-full rounded-3xl px-6 py-5 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }} />
            <input name="cname" required type="text" placeholder="客户姓名" className="w-full rounded-3xl px-6 py-5 text-sm font-bold outline-none" style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }} />
          </div>
          <button type="submit" className="w-full text-white py-6 rounded-[32px] font-black text-sm uppercase shadow-xl hover:opacity-90 transition-all" style={{ backgroundColor: GOLD }}>开启跟进</button>
        </form></div>
      )}
    </div>
  );
};

export default ProjectProgress;
