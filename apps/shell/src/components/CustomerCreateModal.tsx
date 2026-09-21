/**
 * The ONE "new customer" dialog of the platform. Writes the real crm_customers row (+ crm_contacts row when contact details are given) through
 * quickCreateCustomer — same tables and rules everywhere, refuses a same-name duplicate (offers the existing customer instead).
 * Used by the quotation customer picker (CustomerProjectSelector) and by the CRM workbench page.
 * `allowLead` adds "quote now as temporary customer" (stage 待建档) — quotation screens only.
 * `extended` = the full CRM customer profile (also WhatsApp, business line, stage) — the CRM workbench; the quotation screens keep the short form.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@gci/i18n';
import { quickCreateCustomer, DuplicateCustomerError } from '../lib/crmProjects';
import { BUSINESS_LINES, CRM_STAGES, type CrmCustomer, type CrmContact } from '../lib/crmSupabase';

interface CustomerCreateModalProps {
  open: boolean;
  /** pre-filled company name (e.g. what the user typed in a search box) */
  initialName?: string;
  allowLead?: boolean;
  /** full CRM profile form (WhatsApp, business line, stage) */
  extended?: boolean;
  onClose: () => void;
  /** called after the customer (and contact) were written */
  onCreated: (customer: CrmCustomer, contact: CrmContact | null) => void;
  /** called when the user chooses the existing same-name customer instead of creating a duplicate */
  onUseExisting: (existing: CrmCustomer) => void;
}

const inputCls = 'w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold text-gray-700 bg-white min-w-0';
const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';
const emptyForm = { name: '', country: '', contactName: '', mobile: '', whatsapp: '', email: '', type: '', source: '', businessLine: '', stage: '' };

export function CustomerCreateModal({ open, initialName = '', allowLead = false, extended = false, onClose, onCreated, onUseExisting }: CustomerCreateModalProps) {
  const { dict } = useI18n();
  const cp = dict.quotation.customerPicker;
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicate, setDuplicate] = useState<CrmCustomer | null>(null);

  // every time the dialog opens it starts from the typed name with an empty form
  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, name: initialName.trim() });
    setFormError('');
    setDuplicate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submit = async (isLead: boolean) => {
    if (!form.name.trim()) { setFormError(cp.required); return; }
    setCreating(true);
    setFormError('');
    setDuplicate(null);
    try {
      const { customer, contact } = await quickCreateCustomer({
        customerName: form.name,
        country: form.country || undefined,
        customerPrimaryType: form.type || null,
        source: form.source || undefined,
        isLead,
        contactName: form.contactName || undefined,
        phone: form.mobile || undefined,
        whatsapp: extended ? form.whatsapp || undefined : undefined,
        email: form.email || undefined,
        businessType: extended ? form.businessLine || undefined : undefined,
        status: extended ? form.stage || undefined : undefined,
      });
      onCreated(customer, contact);
    } catch (e: any) {
      if (e instanceof DuplicateCustomerError) setDuplicate(e.existing);
      else setFormError(e?.message || cp.createFailed);
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={extended ? cp.formalTitle : cp.modalTitle}>
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => !creating && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-800">{extended ? cp.formalTitle : cp.modalTitle}</h3>
          <button type="button" onClick={() => !creating && onClose()} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label={cp.cancel}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>{cp.name} <span className="text-[#CBA85C]">*</span></label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><label className={labelCls}>{cp.country}</label><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className={inputCls} /></div>
          <div className="space-y-1"><label className={labelCls}>{cp.contactName}</label><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className={inputCls} /></div>
          <div className="space-y-1"><label className={labelCls}>{cp.mobile}</label><input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} inputMode="tel" /></div>
          {extended && <div className="space-y-1"><label className={labelCls}>{cp.whatsapp}</label><input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className={inputCls} inputMode="tel" /></div>}
          <div className="space-y-1"><label className={labelCls}>{cp.email}</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} inputMode="email" /></div>
          <div className="space-y-1">
            <label className={labelCls}>{cp.customerType}</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
              <option value="">{cp.typeNone}</option>
              <option value="project">{cp.typeProject}</option>
              <option value="trade">{cp.typeTrade}</option>
              <option value="services">{cp.typeServices}</option>
            </select>
          </div>
          {extended && (
            <div className="space-y-1">
              <label className={labelCls}>{cp.businessLine}</label>
              <select value={form.businessLine} onChange={e => setForm({ ...form, businessLine: e.target.value })} className={inputCls}>
                <option value="">{cp.businessLineNone}</option>
                {BUSINESS_LINES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          {extended && (
            <div className="space-y-1">
              <label className={labelCls}>{cp.stage}</label>
              <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className={inputCls}>
                <option value="">{cp.stageNone}</option>
                {CRM_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1"><label className={labelCls}>{cp.source}</label><input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder={cp.sourcePlaceholder} className={inputCls} /></div>
        </div>

        {duplicate && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-amber-800 flex-1 min-w-0">{cp.dupTitle.replace('{name}', duplicate.customer_name)}</span>
            <button type="button" onClick={() => onUseExisting(duplicate)} className="px-3 py-1.5 rounded-md bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-wide">{cp.dupUse}</button>
          </div>
        )}
        {formError && <p className="text-xs font-bold text-[#E0846A]">{formError}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={creating} onClick={() => submit(false)} className="px-4 py-2.5 rounded-lg bg-[#080D1E] text-white text-[11px] font-black uppercase tracking-wide disabled:opacity-50">
            {creating ? cp.creating : extended ? cp.save : cp.create}
          </button>
          {allowLead && (
            <button type="button" disabled={creating} onClick={() => submit(true)} className="px-4 py-2.5 rounded-lg bg-white border border-[#CBA85C] text-[#8A6D1F] text-[11px] font-black tracking-wide disabled:opacity-50">
              {cp.createLead}
            </button>
          )}
          <button type="button" disabled={creating} onClick={onClose} className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-wide">
            {cp.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
