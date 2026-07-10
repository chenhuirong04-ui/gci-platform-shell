import React, { useState } from 'react';
import type { ServiceCustomer, BSLang } from '../types';
import { useT } from '../translations';

interface Props {
  lang: BSLang;
  initial?: Partial<ServiceCustomer>;
  onSave: (c: ServiceCustomer) => Promise<void>;
  onCancel: () => void;
}

const TYPES = [
  'GLOBAL_EXPANSION','COMPANY_REGISTRATION_COMPLIANCE','MARKET_ENTRY',
  'LOCAL_EXECUTION','PROJECT_ADVISORY','AI_DIGITALIZATION','MONTHLY_SERVICE','OTHER',
] as const;

const STATUSES = [
  'NEW_REQUIREMENT','REQUIREMENT_CONFIRMING','SOLUTION_PREPARING','SOLUTION_SENT',
  'QUOTED','CONTRACT_PENDING','IN_PROGRESS','MONTHLY_SERVICE','ON_HOLD','COMPLETED','LOST',
] as const;

export function ServiceCustomerForm({ lang, initial, onSave, onCancel }: Props) {
  const t = useT(lang);
  const [form, setForm] = useState<ServiceCustomer>({
    customer_name: '',
    status: 'NEW_REQUIREMENT',
    priority: 'B',
    primary_service_type: 'OTHER',
    currency: 'AED',
    ...initial,
  } as ServiceCustomer);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof ServiceCustomer, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const inp = 'w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400';
  const sel = inp + ' cursor-pointer';
  const label = 'block text-xs text-gray-500 mb-1 font-medium';
  const row = 'grid grid-cols-2 gap-3';

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className={row}>
        <div>
          <label className={label}>{t.fields.customerName} *</label>
          <input className={inp} value={form.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="e.g. Ahmed Al Mansoori" />
        </div>
        <div>
          <label className={label}>{t.fields.companyName}</label>
          <input className={inp} value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} />
        </div>
      </div>

      <div className={row}>
        <div>
          <label className={label}>{t.fields.contactName}</label>
          <input className={inp} value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className={label}>{t.fields.whatsapp}</label>
          <input className={inp} value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="+971..." />
        </div>
      </div>

      <div className={row}>
        <div>
          <label className={label}>{t.fields.email}</label>
          <input className={inp} type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className={label}>{t.fields.country}</label>
          <input className={inp} value={form.country || ''} onChange={e => set('country', e.target.value)} placeholder="UAE" />
        </div>
      </div>

      <div className={row}>
        <div>
          <label className={label}>{t.fields.serviceType}</label>
          <select className={sel} value={form.primary_service_type || ''} onChange={e => set('primary_service_type', e.target.value)}>
            {TYPES.map(v => <option key={v} value={v}>{t.customerTypes[v]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{t.fields.status}</label>
          <select className={sel} value={form.status || 'NEW_REQUIREMENT'} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(v => <option key={v} value={v}>{t.customerStatus[v]}</option>)}
          </select>
        </div>
      </div>

      <div className={row}>
        <div>
          <label className={label}>{t.fields.priority}</label>
          <select className={sel} value={form.priority || 'B'} onChange={e => set('priority', e.target.value as any)}>
            {(['A','B','C'] as const).map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{t.fields.owner}</label>
          <input className={inp} value={form.owner || ''} onChange={e => set('owner', e.target.value)} placeholder="Chris / Lili / Novie" />
        </div>
      </div>

      <div>
        <label className={label}>{t.fields.requirementSummary}</label>
        <textarea className={inp + ' resize-none'} rows={2} value={form.requirement_summary || ''} onChange={e => set('requirement_summary', e.target.value)} />
      </div>

      <div className={row}>
        <div>
          <label className={label}>{t.fields.budgetRange}</label>
          <input className={inp} value={form.budget_range || ''} onChange={e => set('budget_range', e.target.value)} placeholder="e.g. AED 10k–30k" />
        </div>
        <div>
          <label className={label}>{t.fields.followUpDate}</label>
          <input className={inp} type="date" value={form.follow_up_date || ''} onChange={e => set('follow_up_date', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label}>{t.fields.notes}</label>
        <textarea className={inp + ' resize-none'} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !form.customer_name.trim()}
          className="flex-1 bg-[#0c1b3a] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1a3060] disabled:opacity-50"
        >
          {saving ? t.labels.saving : t.buttons.save}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded text-sm hover:bg-gray-50">
          {t.buttons.cancel}
        </button>
      </div>
    </div>
  );
}
