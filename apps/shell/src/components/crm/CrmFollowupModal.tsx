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
import { ModalPortal } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

// i18n: English for this page's fixed UI text (database values are never translated).
// LANG is set from the language context by the page component on every render.
let LANG: 'zh' | 'en' = 'zh';
const EN: Record<string, string> = {
  "请先选择客户": "Please select a customer first",
  "请填写跟进内容": "Please enter the follow-up notes",
  "请选择跟进时间": "Please choose the follow-up date",
  "下次跟进日期必须从跟进日的隔天开始": "The next follow-up date must be at least one day after the follow-up date",
  "保存中…": "Saving…",
  "保存跟进": "Save follow-up",
  "记录跟进": "Log follow-up",
  "关闭": "Close",
  "搜索公司名 / 联系人 / 电话 / 邮箱…": "Search company / contact / phone / email…",
  "选择客户": "Select customer",
  "本次沟通的内容、客户反馈…": "What was discussed, customer feedback…",
  "例如：发送报价 / 约看样 / 确认交期": "e.g. send quote / arrange sample viewing / confirm lead time",
  "客户": "Customer",
  "更换": "Change",
  "没有匹配的客户，请先在页面顶部“+ 新建客户”。": "No matching customer. Use “+ New Customer” at the top of the page first.",
  "跟进内容": "Follow-up notes",
  "跟进时间": "Follow-up date",
  "下次跟进日期（从隔天起）": "Next follow-up date (from the next day)",
  "下一步行动": "Next action",
  "取消": "Cancel"
};
const tx = (zh: string): string => (LANG === 'en' ? EN[zh] ?? zh : zh);


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

const FIELD = 'w-full p-3 border border-gray-300 rounded-md outline-none focus:border-[#7A5F2A] text-sm font-bold text-gray-700 bg-white min-w-0';
const LABEL = 'text-xs font-bold text-slate-600  ';

export function CrmFollowupModal({ open, customer, onClose, onSaved }: Props) {
  LANG = useI18n().lang; // keep tx() in sync with the language toggle
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
    if (!picked) { setError(tx('请先选择客户')); return; }
    if (!notes.trim()) { setError(tx('请填写跟进内容')); return; }
    if (!followUpDate) { setError(tx('请选择跟进时间')); return; }
    if (nextDate && nextDate < minNext) { setError(tx('下次跟进日期必须从跟进日的隔天开始')); return; }
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
    <ModalPortal><div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 max-sm:p-0 max-sm:items-start max-sm:overflow-y-auto" role="dialog" aria-modal="true" aria-label={tx('记录跟进')}>
      <div className="absolute inset-0 bg-slate-900/60 rounded-[14px] max-sm:w-full max-sm:min-h-full max-sm:my-0 max-sm:max-w-none max-sm:max-h-none max-sm:rounded-none" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">{tx('记录跟进')}</h3>
          <button type="button" onClick={() => !saving && onClose()} className="p-1.5 text-slate-600 hover:text-gray-700" aria-label={tx('关闭')}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1 relative">
          <label className={LABEL}>{tx('客户')} <span className="text-[#7A5F2A]">*</span></label>
          {picked ? (
            <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <span className="font-bold text-sm text-gray-800 flex-1 min-w-0 truncate">{picked.customer_name}</span>
              {!customer && <button type="button" onClick={() => { setPicked(null); setQuery(''); }} className="text-xs font-bold text-slate-600 hover:text-gray-700">{tx('更换')}</button>}
            </div>
          ) : (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx('搜索公司名 / 联系人 / 电话 / 邮箱…')} className={FIELD} aria-label={tx('选择客户')} autoFocus />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-[10px] shadow-xl">
                  {hits.map(({ customer: c, contact }) => (
                    <button key={c.id} type="button" onClick={() => setPicked({ id: c.id, customer_name: c.customer_name })} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <span className="block font-bold text-sm text-gray-800 truncate">{c.customer_name}</span>
                      <span className="block text-xs text-slate-600 truncate">{[contact?.contact_name, contact?.phone || contact?.email, c.country].filter(Boolean).join(' · ') || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && hits.length === 0 && <p className="text-xs text-slate-600 px-1 pt-1">{tx('没有匹配的客户，请先在页面顶部“+ 新建客户”。')}</p>}
            </>
          )}
        </div>

        <div className="space-y-1">
          <label className={LABEL}>{tx('跟进内容')} <span className="text-[#7A5F2A]">*</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className={FIELD} placeholder={tx('本次沟通的内容、客户反馈…')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><label className={LABEL}>{tx('跟进时间')}</label><input type="date" value={followUpDate} onChange={e => onFollowUpDate(e.target.value)} className={FIELD} /></div>
          <div className="space-y-1"><label className={LABEL}>{tx('下次跟进日期（从隔天起）')}</label><input type="date" value={nextDate} min={minNext} onChange={e => setNextDate(e.target.value)} className={FIELD} /></div>
        </div>
        <div className="space-y-1">
          <label className={LABEL}>{tx('下一步行动')}</label>
          <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={FIELD} placeholder={tx('例如：发送报价 / 约看样 / 确认交期')} />
        </div>

        {error && <p className="text-xs font-bold text-[#C53030]">{error}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={saving} onClick={save} className="px-5 py-2.5 rounded-md bg-[#080D1E] text-white text-xs font-bold disabled:opacity-50">{saving ? tx('保存中…') : tx('保存跟进')}</button>
          <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2.5 rounded-md bg-gray-100 text-slate-600 text-xs font-bold ">{tx('取消')}</button>
        </div>
      </div>
    </div></ModalPortal>,
    document.body,
  );
}
