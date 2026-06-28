/**
 * QuickFollowUpPanel — lightweight follow-up entry for 客户跟进 tab.
 *
 * Scope:
 *   ✅ Customer name + business ID (display)
 *   ✅ Last context (1-line summary)
 *   ✅ AI next-action hint (1 line, no expansion)
 *   ✅ Follow-up method selector
 *   ✅ Follow-up content textarea
 *   ✅ Next follow-up date
 *   ✅ Save follow-up
 *   ✅ "查看完整详情" → business center
 *
 *   ❌ 成交助理 (full AI panel)
 *   ❌ 创建报价 (only in business center)
 *   ❌ Edit client info
 *   ❌ Archive / Delete
 */

import React, { useState } from 'react';
import { FollowUpTask } from '../types';
import { X, ChevronRight, MessageSquare, Calendar } from 'lucide-react';
import { getTaskBusinessId } from '../utils/businessId';

const NAVY = '#0F172A';
const GOLD = '#B8960C';

const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];

interface Props {
  task: FollowUpTask;
  onClose: () => void;
  /** Called after saving — parent updates task in state */
  onSave: (taskId: string, log: { method: string; content: string; nextDate: string }) => void;
  /** Called when user wants full detail → parent switches to business center */
  onViewFull: () => void;
}

export default function QuickFollowUpPanel({ task, onClose, onSave, onViewFull }: Props) {
  const bizId = (task as any).businessId || getTaskBusinessId(task.id);
  const aiHint = task.aiInsights?.nextActionSuggestion || task.aiInsights?.realNeed || '';

  const [method, setMethod] = useState(METHODS[0]);
  const [content, setContent] = useState('');
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(task.id, { method, content: content.trim(), nextDate });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setContent('');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slideLeft overflow-hidden"
        style={{ borderLeft: `3px solid ${GOLD}` }}
      >
        {/* ── Header ── */}
        <div className="p-5 flex items-center justify-between shrink-0" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {bizId && (
                <span
                  className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: `${GOLD}25`, color: GOLD }}
                >
                  {bizId}
                </span>
              )}
              <span className="text-base font-black text-white truncate">{task.clientName}</span>
            </div>
            <p className="text-[10px] font-bold mt-0.5 truncate" style={{ color: `${GOLD}99` }}>
              {task.countryCity || '—'} · {task.owner}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0 ml-3"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Last context */}
          {task.lastContext && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">最近跟进</p>
              <p className="text-sm font-medium text-slate-700 line-clamp-3">{task.lastContext}</p>
            </div>
          )}

          {/* AI hint — 1 line only, no expansion */}
          {aiHint && (
            <div
              className="p-3 rounded-2xl border flex items-start gap-2"
              style={{ backgroundColor: `${GOLD}0D`, borderColor: `${GOLD}30` }}
            >
              <span className="text-[9px] font-black shrink-0 mt-0.5" style={{ color: GOLD }}>AI</span>
              <p className="text-[11px] font-medium line-clamp-1" style={{ color: NAVY }}>
                {aiHint}
              </p>
            </div>
          )}

          {/* ── Quick follow-up form ── */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> 新增跟进记录
            </p>

            {/* Method */}
            <div className="flex flex-wrap gap-2">
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all"
                  style={
                    method === m
                      ? { backgroundColor: NAVY, color: 'white', borderColor: NAVY }
                      : { backgroundColor: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Content */}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="跟进内容：客户说了什么？我们怎么回应？下一步？"
              rows={4}
              className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 outline-none resize-none focus:border-slate-400 transition-colors placeholder:text-slate-300"
            />

            {/* Next follow-up date */}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  下次跟进日期
                </p>
                <input
                  type="date"
                  value={nextDate}
                  onChange={e => setNextDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="p-5 space-y-3 border-t border-slate-100 shrink-0 bg-white">
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="w-full py-4 rounded-2xl text-sm font-black transition-all active:scale-[0.98]"
            style={
              saved
                ? { backgroundColor: '#10B981', color: 'white' }
                : content.trim()
                  ? { backgroundColor: NAVY, color: 'white' }
                  : { backgroundColor: '#F1F5F9', color: '#CBD5E1', cursor: 'not-allowed' }
            }
          >
            {saved ? '✓ 已保存' : '保存跟进记录'}
          </button>

          {/* View full detail */}
          <button
            onClick={() => { onViewFull(); onClose(); }}
            className="w-full py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            查看完整详情 · 创建报价 · 成交助理
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
