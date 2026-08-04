import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, LayoutGrid, List } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { getTaskBusinessId } from '../utils/businessId';

// ── Dark theme tokens (matches FollowUpQueue/CustomerDirectory) ────────
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const GOLD_L = '#D4AF37';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';

const PLACEHOLDER = '待补充';
const TYPE_LABEL: Record<string, string> = { TRADE: '贸易型', PROJECT: '项目型', LOG_ONLY: '内部', INTERNAL: '内部' };
const DONE_STATUSES = new Set(['已成交', '已归档', '执行中']);
const QUOTED_STATUSES = new Set(['已报价待确认', '合同待签', '执行中', '已成交']);

// inquirySummary/goal sometimes just echoes the trade status at creation
// time (e.g. "已签合同,") rather than a real project/business name — this
// list keeps those out of the "项目/业务" column so a status word never
// gets displayed as if it were the business's name.
const STATUS_PHRASES = new Set([
  '新询盘', '需求整理中', '待报价', '已报价待确认', '合同待签', '执行中', '已成交',
  '暂缓', '已归档', '待人工确认', '已报价', '等待确认', '新建', '跟进中', '谈判中',
  '已暂停', '已关闭', '寻价中', '已发客户', '已确认', '已转订单', '已签合同',
]);
function looksLikeStatusPhrase(s: string): boolean {
  return STATUS_PHRASES.has(s.trim().replace(/[，,。.!！\s]+$/g, ''));
}
// The real project name from Business Master (🏗️ 项目客户库) takes priority
// when linked — it's an actual project title, never a Follow-up Log status/
// next-action phrase. Falls back to Follow-up Log's own inquirySummary/goal
// (filtered against STATUS_PHRASES) only when no Business Master record is
// linked. Never uses tradeStatus/goal/nextAction as a stand-in project name.
function businessName(t: FollowUpTask): string {
  const projectName = ((t as any).projectMaster?.projectName || '').trim();
  if (projectName) return projectName;
  const summary = (t.inquirySummary || '').trim();
  if (summary && !looksLikeStatusPhrase(summary)) return summary;
  const goal = (t.goal || '').trim();
  if (goal && !looksLikeStatusPhrase(goal)) return goal;
  return PLACEHOLDER;
}

function quoteStatusOf(tradeStatus: string): string {
  if (QUOTED_STATUSES.has(tradeStatus)) return '已报价';
  if (tradeStatus === '待报价') return '报价中';
  return '未报价';
}

function fmtDate(iso: string): string {
  if (!iso) return PLACEHOLDER;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return PLACEHOLDER;
  return d.toLocaleDateString('zh-CN');
}

function daysAgo(iso: string): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

export default function BusinessRegister({
  tasks, onSelectTask, onSelectBusiness, onOpenKanban,
}: {
  tasks: FollowUpTask[];
  // 客户编码/客户名称 → 客户工作台
  onSelectTask: (task: FollowUpTask) => void;
  // 项目编码/项目名称 → 独立业务详情页
  onSelectBusiness: (task: FollowUpTask) => void;
  onOpenKanban: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('全部');
  const [stageFilter, setStageFilter] = useState<string>('全部');
  const [countryFilter, setCountryFilter] = useState<string>('全部');
  const [ownerFilter, setOwnerFilter] = useState<string>('全部');
  // 已归档不再是独立的核心Tab — 降级为这里的状态筛选之一，与 当前/已完成/
  // 已暂停 并列。底层 HistoryView（?tab=history）未改动，恢复/导出等能力
  // 仍在那里可用。
  const [statusFilter, setStatusFilter] = useState<'当前' | '已完成' | '已暂停' | '已归档' | '全部'>('当前');

  const active = useMemo(() => tasks.filter(t => {
    switch (statusFilter) {
      case '全部':   return true;
      case '已归档': return t.status === 'archived';
      case '已完成': return t.status !== 'archived' && t.tradeStatus === '已成交';
      case '已暂停': return t.status !== 'archived' && t.tradeStatus === '暂缓';
      case '当前':
      default:
        return t.status !== 'archived' && t.tradeStatus !== '已成交' && t.tradeStatus !== '暂缓';
    }
  }), [tasks, statusFilter]);

  const stats = useMemo(() => {
    const all = tasks.filter(t => t.status !== 'deleted');
    const now = Date.now();
    const in7  = all.filter(t => daysAgo(t.createdAt) <= 7).length;
    const in30 = all.filter(t => daysAgo(t.updatedAt || t.createdAt) <= 30 && t.status !== 'archived').length;
    void now;
    return {
      total: all.filter(t => t.status !== 'archived').length,
      new7: in7,
      active30: in30,
      project: all.filter(t => (t.businessType === 'PROJECT') && t.status !== 'archived').length,
      trade: all.filter(t => (t.businessType === 'TRADE') && t.status !== 'archived').length,
      quoting: all.filter(t => t.tradeStatus === '待报价' && t.status !== 'archived').length,
      executing: all.filter(t => t.tradeStatus === '执行中' && t.status !== 'archived').length,
      archived: all.filter(t => t.status === 'archived').length,
    };
  }, [tasks]);

  const countries = useMemo(() => {
    const set = new Set(active.map(t => t.countryCity).filter(c => c && c.trim()));
    return ['全部', ...Array.from(set).sort()];
  }, [active]);
  const owners = useMemo(() => {
    const set = new Set(active.map(t => t.owner).filter(o => o && o.trim()));
    return ['全部', ...Array.from(set).sort()];
  }, [active]);
  const stages = useMemo(() => {
    const set = new Set(active.map(t => t.tradeStatus).filter(Boolean));
    return ['全部', ...Array.from(set).sort()];
  }, [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active
      .filter(t => {
        if (typeFilter !== '全部' && (TYPE_LABEL[t.businessType] || t.businessType) !== typeFilter) return false;
        if (stageFilter !== '全部' && t.tradeStatus !== stageFilter) return false;
        if (countryFilter !== '全部' && t.countryCity !== countryFilter) return false;
        if (ownerFilter !== '全部' && t.owner !== ownerFilter) return false;
        if (!q) return true;
        return [t.clientName, t.goal, t.inquirySummary, t.countryCity]
          .some(f => (f || '').toLowerCase().includes(q));
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  }, [active, search, typeFilter, stageFilter, countryFilter, ownerFilter]);

  // Compact stat row — 最近7天新增/报价中/已归档 stay reachable via the
  // filters and "仅看已归档" toggle below instead of their own big cards.
  const STAT_ITEMS: [string, number][] = [
    ['全部业务', stats.total], ['最近30天活跃', stats.active30],
    ['项目型', stats.project], ['贸易型', stats.trade], ['执行中', stats.executing],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black" style={{ color: T1 }}>全部业务</h2>
          <p className="text-sm font-medium mt-0.5" style={{ color: T2 }}>直接来自 Follow-up Log · 默认按最近更新排序</p>
        </div>
        <button
          onClick={onOpenKanban}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}
        >
          <LayoutGrid className="w-3.5 h-3.5" /> 看板视图
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {STAT_ITEMS.map(([label, value]) => (
          <div key={label} className="rounded-xl px-4 py-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T3 }}>{label}</div>
            <div className="text-xl font-black mt-1" style={{ color: GOLD_L }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T3 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索客户、项目、国家…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-medium outline-none"
            style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          {['全部', '项目型', '贸易型'].map(v => <option key={v} value={v}>{v === '全部' ? '全部类型' : v}</option>)}
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          {stages.map(v => <option key={v} value={v}>{v === '全部' ? '全部阶段' : v}</option>)}
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          {countries.map(v => <option key={v} value={v}>{v === '全部' ? '全部国家' : v}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          {owners.map(v => <option key={v} value={v}>{v === '全部' ? '全部负责人' : v}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none" style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}>
          {(['当前', '已完成', '已暂停', '已归档', '全部'] as const).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1180 }}>
            <thead>
              <tr style={{ background: CARD2 }}>
                {['客户/公司', '项目/业务', '业务类型', '当前阶段', '最近沟通', '下一步', '报价状态', '文件数量', '负责人', '最近更新'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-black uppercase tracking-wide whitespace-nowrap" style={{ color: T2, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const bizId = (t as any).businessId || getTaskBusinessId(t.id) || '';
                const qs = quoteStatusOf(t.tradeStatus);
                return (
                  <tr
                    key={t.id}
                    className="transition-colors hover:bg-white/5"
                    style={{ borderTop: `1px solid ${BORDER}`, background: CARD }}
                  >
                    <td className="px-3 py-3 cursor-pointer" onClick={() => onSelectTask(t)}>
                      <div className="flex items-center gap-1.5">
                        {bizId && <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ background: `${GOLD}22`, color: GOLD_L }}>{bizId}</span>}
                        <span className="font-black truncate" style={{ color: T1 }}>{t.clientName || PLACEHOLDER}</span>
                      </div>
                      {!bizId && <div className="text-[9px] mt-0.5" style={{ color: T3 }}>{PLACEHOLDER}</div>}
                    </td>
                    <td className="px-3 py-3 max-w-[220px] cursor-pointer" title={businessName(t)} onClick={() => onSelectBusiness(t)}>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          // Real Business Master 项目ID takes priority over the
                          // locally-generated fallback projectCode (used only
                          // for businesses created in-app with no Notion link).
                          const displayCode = (t as any).projectMaster?.projectId || (t as any).projectCode;
                          return displayCode ? (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: T3 }}>{displayCode}</span>
                          ) : null;
                        })()}
                        <span className="truncate underline decoration-dotted" style={{ color: T2 }}>{businessName(t)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{TYPE_LABEL[t.businessType] || t.businessType || PLACEHOLDER}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${GOLD}22`, color: GOLD_L }}>{t.tradeStatus || PLACEHOLDER}</span>
                    </td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{fmtDate(t.updatedAt || t.createdAt)}</td>
                    <td className="px-3 py-3 max-w-[160px] truncate" style={{ color: t.suggestedAction ? T2 : T3 }} title={t.suggestedAction}>{t.suggestedAction || PLACEHOLDER}</td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{qs}</td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{(t.attachments || []).length}</td>
                    <td className="px-3 py-3" style={{ color: t.owner ? T2 : T3 }}>{t.owner || PLACEHOLDER}</td>
                    <td className="px-3 py-3 flex items-center justify-between gap-2 cursor-pointer" style={{ color: T2 }} onClick={() => onSelectBusiness(t)} title="查看业务">
                      {fmtDate(t.updatedAt || t.createdAt)}
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center" style={{ color: T3 }}>未找到匹配的业务记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: T3 }}>
        <List className="w-3 h-3" /> "最近30天活跃"基于最近更新时间（updatedAt/createdAt）计算——现有数据未逐项记录"新增报价/新增附件"事件，无法单独识别这两类变化。
      </div>
    </div>
  );
}
