/**
 * "记录跟进" dialog of the CRM workbench. Writes a real crm_followups row (and syncs last/next follow-up + next action onto the customer)
 * through the existing logFollowup helper. Customer is either preset (opened from a row / the detail panel) or picked here from the real CRM.
 * Rule (CRM): the next follow-up date starts the day AFTER the follow-up is entered, never the same day.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { logFollowup, crmDate } from '../../lib/crmSupabase';
import { searchCustomers, type CustomerSearchHit } from '../../lib/crmProjects';

export interface FollowupTarget { id: string; customer_name: string }

interface Props {
  open: boolean;
  /** preset customer; null = let the user search and pick one */
  customer: FollowupTarget | null;
  onClose: () => void;
  onSaved: (customerId: string) => void;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const FIELD = 'w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold text-gray-700 bg-white min-w-0';
const LABEL = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';

export function CrmFollowupModal({ open, customer, onClose, onSaved }: Props) {
  const [picked, setPicked] = useState<FollowupTarget | null>(customer);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState(crmDate(0));
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState(crmDate(1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setPicked(customer);
    setQuery('');
    setHits([]);
    setNotes('');
    setFollowUpDate(crmDate(0));
    setNextAction('');
    setNextDate(crmDate(1));
    setError('');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  // live customer search (only while no customer is picked)
  useEffect(() => {
    if (!open || picked || !query.trim()) { setHits([]); return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const rows = await searchCustomers(query, 6);
      if (my === seq.current) setHits(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [query, picked, open]);

  if (!open) return null;

  const minNext = addDays(followUpDate, 1);
  const onFollowUpDate = (v: string) => {
    setFollowUpDate(v);
    if (v && nextDate && nextDate <= v) setNextDate(addDays(v, 1));
  };

  const save = async () => {
    if (!picked) { setError('请先选择客户'); return; }
    if (!notes.trim()) { setError('请填写跟进内容'); return; }
    if (!followUpDate) { setError('请选择跟进时间'); return; }
    if (nextDate && nextDate < minNext) { setError('下次跟进日期必须从跟进日的隔天开始'); return; }
    setSaving(true);
    setError('');
    const res = await logFollowup({
      customerId: picked.id,
      notes: notes.trim(),
      nextAction: nextAction.trim() || null,
      nextFollowUpAt: nextDate || null,
      followUpDate,
      source: 'crm_workbench',
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(picked.id);
  };

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="记录跟进">
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-800">记录跟进</h3>
          <button type="button" onClick={() => !saving && onClose()} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="关闭"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1 relative">
          <label className={LABEL}>客户 <span className="text-[#CBA85C]">*</span></label>
          {picked ? (
            <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <span className="font-bold text-sm text-gray-800 flex-1 min-w-0 truncate">{picked.customer_name}</span>
              {!customer && <button type="button" onClick={() => { setPicked(null); setQuery(''); }} className="text-[10px] font-black text-gray-400 hover:text-gray-700">更换</button>}
            </div>
          ) : (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索公司名 / 联系人 / 电话 / 邮箱…" className={FIELD} aria-label="选择客户" autoFocus />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
                  {hits.map(({ customer: c, contact }) => (
                    <button key={c.id} type="button" onClick={() => setPicked({ id: c.id, customer_name: c.customer_name })} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <span className="block font-bold text-sm text-gray-800 truncate">{c.customer_name}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{[contact?.contact_name, contact?.phone || contact?.email, c.country].filter(Boolean).join(' · ') || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && hits.length === 0 && <p className="text-[11px] text-gray-400 px-1 pt-1">没有匹配的客户，请先在页面顶部“+ 新建客户”。</p>}
            </>
          )}
        </div>

        <div className="space-y-1">
          <label className={LABEL}>跟进内容 <span className="text-[#CBA85C]">*</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className={FIELD} placeholder="本次沟通的内容、客户反馈…" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><label className={LABEL}>跟进时间</label><input type="date" value={followUpDate} onChange={e => onFollowUpDate(e.target.value)} className={FIELD} /></div>
          <div className="space-y-1"><label className={LABEL}>下次跟进日期（从隔天起）</label><input type="date" value={nextDate} min={minNext} onChange={e => setNextDate(e.target.value)} className={FIELD} /></div>
        </div>
        <div className="space-y-1">
          <label className={LABEL}>下一步行动</label>
          <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={FIELD} placeholder="例如：发送报价 / 约看样 / 确认交期" />
        </div>

        {error && <p className="text-xs font-bold text-[#E0846A]">{error}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={saving} onClick={save} className="px-5 py-2.5 rounded-lg bg-[#080D1E] text-white text-[11px] font-black uppercase tracking-wide disabled:opacity-50">{saving ? '保存中…' : '保存跟进'}</button>
          <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-wide">取消</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
