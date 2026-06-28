import React, { useState } from 'react';
import { FollowUpTask } from '../types';
import { generateSalesCloser, SalesCloserResult, MissingField } from '../services/geminiService';
import {
  Zap, CheckCircle2, XCircle, Copy, Check, ChevronRight,
  Loader2, AlertTriangle, Send,
} from 'lucide-react';

interface Props {
  task: FollowUpTask;
  onUpdateTask: (task: FollowUpTask) => void;
}

const STAGE_COLOR: Record<string, string> = {
  'New Inquiry':         'bg-slate-100 text-slate-600',
  'Interested':          'bg-blue-100 text-blue-700',
  'Need More Info':      'bg-amber-100 text-amber-700',
  'Ready For Quotation': 'bg-emerald-100 text-emerald-700',
  'Negotiation':         'bg-indigo-100 text-indigo-700',
  'Won':                 'bg-green-100 text-green-800',
  'Lost':                'bg-red-100 text-red-700',
};

const OWNERS = ['Chris', 'lili', 'novie'];
const METHODS = ['WhatsApp', '电话', '邮件', '微信', '当面', '其他'];

export default function AILeadAssistant({ task, onUpdateTask }: Props) {
  const [result, setResult] = useState<SalesCloserResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Editable confirm fields
  const [editedMessage, setEditedMessage] = useState('');
  const [editedNextAction, setEditedNextAction] = useState('');
  const [editedFollowUpDate, setEditedFollowUpDate] = useState('');
  const [editedTradeStatus, setEditedTradeStatus] = useState('');
  const [editedOwner, setEditedOwner] = useState(task.owner || 'Chris');
  const [editedMethod, setEditedMethod] = useState('WhatsApp');

  const [writing, setWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setWriteSuccess(false);
    setWriteError('');
    try {
      const r = await generateSalesCloser(task);
      setResult(r);
      setEditedMessage(r.closingMessage);
      setEditedNextAction(r.nextAction);
      setEditedFollowUpDate(r.nextFollowUpDate);
      setEditedTradeStatus(r.suggestedTradeStatus);
    } catch (e: any) {
      setError(e?.message || 'AI 分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleWriteToNotion = async () => {
    if (!result) return;
    setWriting(true);
    setWriteError('');
    setWriteSuccess(false);

    const today = new Date().toISOString().slice(0, 10);

    const notesContent = [
      `[AI Sales Closer · ${today}]`,
      `Stage: ${result.salesStage}`,
      `Reason: ${result.stageReason}`,
      '',
      `缺失信息: ${result.missingFields.filter(f => !f.hasValue).map(f => f.label).join(' / ') || '无'}`,
      '',
      '推进话术:',
      editedMessage,
      '',
      `下一步: ${editedNextAction}`,
    ].join('\n');

    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/crm/notion-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: task.leadId,
          fields: {
            tradeStatus: editedTradeStatus,
            followUpNotes: notesContent,
            nextAction: editedNextAction,
            nextFollowUpAt: editedFollowUpDate,
            followUpDate: today,
            followUpMethod: editedMethod,
            owner: editedOwner,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      // Optimistically update local task state
      const updated: FollowUpTask = {
        ...task,
        tradeStatus: editedTradeStatus as any,
        nextFollowUpAt: editedFollowUpDate,
        owner: editedOwner,
        updatedAt: new Date().toISOString(),
      };
      onUpdateTask(updated);
      setWriteSuccess(true);
    } catch (e: any) {
      setWriteError(e?.message || '写入 Notion 失败，请重试');
    } finally {
      setWriting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">

      {/* Trigger */}
      {!result && !loading && (
        <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)' }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-800">AI Sales Closer</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                成交推进助理
              </div>
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 mb-5 leading-relaxed">
            AI 将分析当前客户信息，判断成交阶段、识别缺失字段、生成推进话术，
            并在你确认后直接写入 Notion Follow-up Log。
          </p>
          <button
            onClick={handleAnalyze}
            className="w-full py-3 rounded-2xl text-sm font-black text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0F172A' }}
          >
            开始分析 →
          </button>
          {error && (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-red-500">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-[28px] p-10 border border-slate-200 shadow-sm flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8960C' }} />
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
            AI 分析中...
          </span>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">

          {/* Block 1: Stage */}
          <div className="bg-white rounded-[28px] p-5 border border-slate-200 shadow-sm">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              成交阶段判断
            </div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${STAGE_COLOR[result.salesStage] || 'bg-slate-100 text-slate-600'}`}>
                {result.salesStage}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
              <select
                value={editedTradeStatus}
                onChange={e => setEditedTradeStatus(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-black border border-slate-200 bg-slate-50 outline-none"
                style={{ color: '#0F172A' }}
              >
                {['新询盘','需求整理中','待报价','已报价待确认','执行中','已成交','暂缓','已归档'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="text-xs font-medium text-slate-500 leading-relaxed italic">
              {result.stageReason}
            </p>
          </div>

          {/* Block 2: Missing Fields */}
          <div className="bg-white rounded-[28px] p-5 border border-slate-200 shadow-sm">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              缺失信息清单
            </div>
            <div className="space-y-2">
              {result.missingFields.map(f => (
                <MissingFieldRow key={f.field} field={f} />
              ))}
            </div>
          </div>

          {/* Block 3: Closing Message */}
          <div className="bg-white rounded-[28px] p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                推进话术（可编辑）
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-200 hover:bg-slate-50 transition-all"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <textarea
              rows={6}
              value={editedMessage}
              onChange={e => setEditedMessage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 transition-all resize-none"
              style={{ lineHeight: '1.6' }}
            />
          </div>

          {/* Block 4: Next Action + Write */}
          <div className="bg-white rounded-[28px] p-5 border border-slate-200 shadow-sm">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              下一步行动 · 确认写入
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                  下一步行动
                </label>
                <input
                  value={editedNextAction}
                  onChange={e => setEditedNextAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                    下次跟进日期
                  </label>
                  <input
                    type="date"
                    value={editedFollowUpDate}
                    onChange={e => setEditedFollowUpDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                    跟进方式
                  </label>
                  <select
                    value={editedMethod}
                    onChange={e => setEditedMethod(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 transition-all"
                  >
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                  负责人
                </label>
                <select
                  value={editedOwner}
                  onChange={e => setEditedOwner(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 transition-all"
                >
                  {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {writeSuccess ? (
              <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-black text-emerald-700">已写入 Notion ✓</div>
                  <div className="text-[10px] font-bold text-emerald-500 mt-0.5">
                    Follow-up Log 已更新，团队可实时查看
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={handleWriteToNotion}
                  disabled={writing}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ backgroundColor: '#0F172A' }}
                >
                  {writing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> 写入中...</>
                    : <><Send className="w-4 h-4" /> 确认写入 Notion Follow-up Log</>
                  }
                </button>
                {writeError && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold text-red-500">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {writeError}
                  </div>
                )}
              </>
            )}

            <button
              onClick={handleAnalyze}
              className="w-full mt-2 py-2 rounded-2xl text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
            >
              重新分析
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

function MissingFieldRow({ field }: { field: MissingField }) {
  return (
    <div className="flex items-center gap-3">
      {field.hasValue
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      }
      <span className={`text-xs font-bold ${field.hasValue ? 'text-slate-500' : 'text-slate-800'}`}>
        {field.label}
      </span>
      {field.hasValue && field.currentValue && (
        <span className="text-[10px] font-medium text-slate-400 truncate max-w-[140px]">
          {field.currentValue}
        </span>
      )}
      {!field.hasValue && (
        <span className="text-[10px] font-black text-red-400 uppercase">缺失</span>
      )}
    </div>
  );
}
