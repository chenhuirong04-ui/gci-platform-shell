/**
 * New customer typed straight into a quote (no CRM record needed first).
 * After "Done": similar existing customers are listed for the user to check (never merged
 * automatically), then the user decides —
 *   Yes → the platform's one CustomerCreateModal opens pre-filled (the user confirms there);
 *         the created customer is linked to the quote like any CRM pick.
 *   No  → the details stay on this quote only; nothing is written to CRM.
 */
import { useState } from 'react';
import { CustomerCreateModal } from '../../../apps/shell/src/components/CustomerCreateModal';
import { searchCustomers, listContactsForCustomer, type CustomerSearchHit } from '../../../apps/shell/src/lib/crmProjects';
import type { CrmCustomer, CrmContact } from '../../../apps/shell/src/lib/crmSupabase';
import { coreSearchTerm, similarCustomers, emptyQuoteOnlyCustomer, type QuoteOnlyCustomer } from '../lib/quoteCustomer';

interface Props {
  t: (key: string) => string;
  /** the quote-only customer currently on the quote (null = none) */
  value: QuoteOnlyCustomer | null;
  onQuoteOnly: (c: QuoteOnlyCustomer) => void;
  /** a CRM customer was created or an existing one chosen — link it like a CRM pick */
  onCrmCustomer: (customer: CrmCustomer, contact: CrmContact | null) => void;
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:border-[#CBA85C] min-w-0';
const btnDark = 'px-3 py-1.5 rounded-md bg-[#080D1E] text-white text-xs font-bold disabled:opacity-50';
const btnLight = 'px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-bold';

export function QuoteNewCustomer({ t, value, onQuoteOnly, onCrmCustomer }: Props) {
  const [stage, setStage] = useState<'idle' | 'edit' | 'ask'>('idle');
  const [form, setForm] = useState<QuoteOnlyCustomer>(emptyQuoteOnlyCustomer());
  const [checking, setChecking] = useState(false);
  const [similar, setSimilar] = useState<CustomerSearchHit[]>([]);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const startEdit = () => { setForm(value ? { ...value } : emptyQuoteOnlyCustomer()); setError(''); setStage('edit'); };

  const done = async () => {
    const name = form.name.trim();
    if (!name) { setError(t('Please enter the company / customer name.')); return; }
    setChecking(true);
    try {
      const core = coreSearchTerm(name);
      const [a, b] = await Promise.all([
        searchCustomers(name, 8),
        core && core !== name.toLowerCase() ? searchCustomers(core, 8) : Promise.resolve([] as CustomerSearchHit[]),
      ]);
      setSimilar(similarCustomers(name, [...a, ...b]));
    } finally {
      setChecking(false);
    }
    setForm(f => ({ ...f, name, contactName: f.contactName.trim(), phone: f.phone.trim(), email: f.email.trim() }));
    setStage('ask');
  };

  const useExisting = async (c: CrmCustomer, contact?: CrmContact | null) => {
    let ct = contact ?? null;
    if (!ct) { const list = await listContactsForCustomer(c.id); ct = list.find(x => x.is_primary) || list[0] || null; }
    setShowModal(false);
    setStage('idle');
    onCrmCustomer(c, ct);
  };

  if (stage === 'idle') {
    if (value) {
      return (
        <div className="mt-2 p-3 rounded-lg bg-[#0C1B3A]/3 border border-[#0C1B3A]/10 flex flex-wrap items-center gap-2" data-testid="quote-only-customer">
          <span className="text-xs font-bold text-slate-700 flex-1 min-w-0">
            {t('Quote customer (not saved to CRM)')}: {value.name}
            {[value.contactName, value.phone, value.email].filter(Boolean).length > 0 && ` · ${[value.contactName, value.phone, value.email].filter(Boolean).join(' · ')}`}
          </span>
          <button type="button" className={btnLight} onClick={startEdit}>{t('Edit')}</button>
        </div>
      );
    }
    return (
      <button type="button" onClick={startEdit} data-testid="quote-new-customer-open" className="mt-2 text-xs font-bold text-[#7A5F2A] hover:text-[#5E4920] px-1">
        {t('+ New customer: fill in directly (no CRM record needed)')}
      </button>
    );
  }

  return (
    <div className="mt-2 p-4 rounded-lg border border-[#CBA85C]/40 bg-[#CBA85C]/5 space-y-3" data-testid="quote-new-customer-form">
      {stage === 'edit' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">{t('Company / customer name')} *</label>
              <input data-testid="qnc-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} autoFocus /></div>
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">{t('Contact person')}</label>
              <input data-testid="qnc-contact" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className={inputCls} /></div>
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">{t('Phone / WA')}</label>
              <input data-testid="qnc-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} inputMode="tel" /></div>
            <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">{t('Email')}</label>
              <input data-testid="qnc-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} inputMode="email" /></div>
          </div>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" data-testid="qnc-done" className={btnDark} disabled={checking} onClick={done}>{checking ? t('Checking…') : t('Done')}</button>
            <button type="button" className={btnLight} onClick={() => setStage('idle')}>{t('Cancel')}</button>
          </div>
        </>
      )}

      {stage === 'ask' && (
        <>
          <p className="text-xs font-bold text-slate-700">
            {form.name}{[form.contactName, form.phone, form.email].filter(Boolean).length > 0 && ` · ${[form.contactName, form.phone, form.email].filter(Boolean).join(' · ')}`}
          </p>
          {similar.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2" data-testid="qnc-similar">
              <p className="text-xs font-bold text-amber-800">{t('Similar existing customers found — please check whether one of them is the same customer (nothing is merged automatically):')}</p>
              {similar.map(({ customer: c, contact }) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-amber-900 flex-1 min-w-0">
                    {c.customer_name}{[contact?.contact_name, contact?.phone || contact?.whatsapp || contact?.email].filter(Boolean).length > 0 && ` · ${[contact?.contact_name, contact?.phone || contact?.whatsapp || contact?.email].filter(Boolean).join(' · ')}`}
                  </span>
                  <button type="button" className={btnLight} onClick={() => useExisting(c, contact)}>{t('Use this customer')}</button>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm font-bold text-[#0C1B3A]">{t('Also save to CRM customer records?')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="qnc-yes" className={btnDark} onClick={() => setShowModal(true)}>{t('Yes, save to CRM')}</button>
            <button type="button" data-testid="qnc-no" className={btnLight} onClick={() => { setStage('idle'); onQuoteOnly(form); }}>{t('No, this quote only')}</button>
            <button type="button" className={btnLight} onClick={() => setStage('edit')}>{t('Back')}</button>
          </div>
        </>
      )}

      <CustomerCreateModal
        open={showModal}
        initialName={form.name}
        initialContact={{ contactName: form.contactName, mobile: form.phone, email: form.email }}
        onClose={() => setShowModal(false)}
        onCreated={(c, contact) => { setShowModal(false); setStage('idle'); onCrmCustomer(c, contact); }}
        onUseExisting={c => useExisting(c)}
      />
    </div>
  );
}
