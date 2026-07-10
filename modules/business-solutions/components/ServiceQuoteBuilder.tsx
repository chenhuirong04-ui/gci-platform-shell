import React, { useState, useEffect, useCallback } from 'react';
import type {
  ServiceCustomer, ServiceCatalogItem, ServiceCategory,
  ServiceQuote, ServiceQuoteLineItem, BSLang, BillingType
} from '../types';
import { useT } from '../translations';
import { calcLineTotal, calcQuoteTotals, fmt } from '../lib/bsCalculations';
import { ServiceCatalogPicker } from './ServiceCatalogPicker';
import { generateFwQuoteNo } from '../lib/bsCloud';

interface Props {
  lang: BSLang;
  customers: ServiceCustomer[];
  categories: ServiceCategory[];
  catalogItems: ServiceCatalogItem[];
  initialCustomer?: ServiceCustomer;
  onSave: (quote: ServiceQuote, items: ServiceQuoteLineItem[]) => Promise<void>;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

const BILLING_TYPES: BillingType[] = ['fixed','monthly','quarterly','yearly','per_unit','per_shipment','percentage','commission','custom'];

function makeEmptyQuote(customer?: ServiceCustomer): ServiceQuote {
  const today = new Date().toISOString().slice(0, 10);
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    quote_no: `FW-${new Date().getFullYear()}-DRAFT`,
    version: 1,
    quotation_title: '',
    customer_id: customer?.id,
    customer_name: customer?.customer_name || '',
    contact_person: customer?.contact_name || '',
    service_type: customer?.primary_service_type || '',
    quote_date: today,
    valid_until: validUntil,
    currency: 'AED',
    payment_terms: lang => lang === 'zh' ? '50% 订金 + 50% 完成后' : '50% Deposit + 50% upon completion',
    notes: '',
    exclusions: '',
    delivery_period: '',
    owner: customer?.owner || '',
    status: 'DRAFT',
    discount_type: undefined,
    discount_value: 0,
    total_amount: 0,
  } as any;
}

export function ServiceQuoteBuilder({ lang, customers, categories, catalogItems, initialCustomer, onSave, onCancel }: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';

  const [step, setStep] = useState<Step>(initialCustomer ? 2 : 1);
  const [selectedCustomer, setSelectedCustomer] = useState<ServiceCustomer | null>(initialCustomer || null);
  const [items, setItems] = useState<ServiceQuoteLineItem[]>([]);
  const [quote, setQuote] = useState<ServiceQuote>(() => {
    const q = makeEmptyQuote(initialCustomer) as any;
    q.payment_terms = isZh ? '50% 订金 + 50% 完成后' : '50% Deposit + 50% upon completion';
    return q;
  });
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (initialCustomer && !selectedCustomer) {
      setSelectedCustomer(initialCustomer);
      setQuote(q => ({ ...q, customer_id: initialCustomer.id, customer_name: initialCustomer.customer_name }));
    }
  }, [initialCustomer]);

  const totals = calcQuoteTotals(items, quote.discount_type, quote.discount_value || 0);

  const updateItem = useCallback((id: string, patch: Partial<ServiceQuoteLineItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, ...patch };
      updated.line_total = calcLineTotal(updated);
      return updated;
    }));
  }, []);

  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const addItem = (item: ServiceQuoteLineItem) => {
    setItems(prev => [...prev, { ...item, sort_order: prev.length }]);
  };

  const handleSave = async (status: 'DRAFT' | 'FINAL') => {
    const fwNo = await generateFwQuoteNo();
    const finalQuote: ServiceQuote = {
      ...quote,
      quote_no: fwNo,
      status,
      total_amount: totals.grandTotal,
      grand_total: totals.grandTotal,
      subtotal_one_time: totals.subtotalOneTime,
      subtotal_monthly: totals.subtotalMonthly,
      subtotal_annual: totals.subtotalAnnual,
      discount_amount: totals.discountAmount,
      total_one_time: totals.totalOneTime,
      monthly_fee: totals.monthlyFee,
      annual_recurring_amount: totals.annualRecurring,
    };
    setSaving(true);
    try { await onSave(finalQuote, items); } finally { setSaving(false); }
  };

  const inp = 'border border-[#cbd5e1] rounded-lg px-3 py-[10px] text-[15px] text-[#0f172a] w-full focus:outline-none focus:border-[#C9A84C] bg-white';
  const label = 'text-[13px] text-[#334155] font-semibold mb-1.5 block';

  // Step 1: Select customer
  if (step === 1) {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        <div className="text-sm font-semibold text-[#0c1b3a]">{t.labels.step1}</div>
        <input
          className={inp}
          placeholder={t.buttons.search + '…'}
          onChange={e => {
            const q = e.target.value.toLowerCase();
            if (!q) return;
          }}
        />
        <div className="flex-1 overflow-auto space-y-1">
          {customers.map(c => (
            <div
              key={c.id}
              onClick={() => {
                setSelectedCustomer(c);
                setQuote(q => ({ ...q, customer_id: c.id, customer_name: c.customer_name, contact_person: c.contact_name || '', owner: c.owner || q.owner }));
                setStep(2);
              }}
              className="flex items-center gap-3 p-3 rounded border border-gray-100 hover:bg-blue-50 cursor-pointer"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-800">{c.customer_name}</div>
                {c.company_name && <div className="text-xs text-gray-400">{c.company_name}</div>}
              </div>
              <span className="text-xs text-gray-400">{c.owner || ''}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-gray-200 rounded py-2 text-sm">{t.buttons.cancel}</button>
        </div>
      </div>
    );
  }

  // Step 2: Add services
  if (step === 2) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-semibold text-[#0c1b3a]">{t.labels.step2}</div>
          <div className="text-xs text-gray-500 mt-0.5">{selectedCustomer?.customer_name}</div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: service picker */}
          <div className="w-64 border-r border-gray-100 flex flex-col overflow-hidden">
            <ServiceCatalogPicker
              lang={lang}
              categories={categories}
              items={catalogItems}
              onAdd={addItem}
              onAddCustom={addItem}
            />
          </div>

          {/* Right: selected items */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {items.length === 0 && (
                <div className="flex items-center justify-center h-24 text-gray-400 text-sm">{t.labels.selectServices}</div>
              )}
              {items.map((it, i) => (
                <div key={it.id} className="border border-gray-100 rounded p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 mt-1">{i + 1}.</span>
                    <div className="flex-1">
                      <input
                        className="border-0 border-b border-gray-200 px-0 py-0.5 text-sm w-full font-medium focus:outline-none focus:border-blue-400"
                        value={it.service_name}
                        onChange={e => updateItem(it.id, { service_name: e.target.value })}
                      />
                    </div>
                    <button onClick={() => removeItem(it.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <div className={label}>{t.fields.oneTimeFee}</div>
                      <input className={inp + ' text-xs'} type="number" min={0} value={it.one_time_fee || ''} onChange={e => updateItem(it.id, { one_time_fee: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className={label}>{t.fields.monthlyFee}</div>
                      <input className={inp + ' text-xs'} type="number" min={0} value={it.monthly_fee || ''} onChange={e => updateItem(it.id, { monthly_fee: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className={label}>{t.fields.months}</div>
                      <input className={inp + ' text-xs'} type="number" min={1} value={it.months || 1} onChange={e => updateItem(it.id, { months: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className={label}>{t.fields.lineTotal}</div>
                      <div className="px-2 py-1.5 text-xs text-[#0c1b3a] font-semibold">{fmt(it.line_total, quote.currency)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals bar */}
            <div className="border-t border-gray-100 p-3 bg-gray-50 text-sm flex items-center gap-4 flex-wrap">
              {totals.subtotalOneTime > 0 && <span className="text-gray-500 text-xs">{t.fields.subtotalOneTime}: <b>{fmt(totals.subtotalOneTime, quote.currency)}</b></span>}
              {totals.subtotalMonthly > 0 && <span className="text-gray-500 text-xs">{t.fields.subtotalMonthly}: <b>{fmt(totals.subtotalMonthly, quote.currency)}</b></span>}
              <div className="flex-1" />
              <span className="font-bold text-[#0c1b3a]">{t.fields.grandTotal}: {fmt(totals.grandTotal, quote.currency)}</span>
              <button onClick={() => setStep(3)} disabled={items.length === 0} className="bg-[#0c1b3a] text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
                {t.buttons.next} →
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-gray-100 flex gap-2">
          <button onClick={() => setStep(1)} className="border border-gray-200 rounded px-3 py-1.5 text-sm">← {t.buttons.back}</button>
          <button onClick={onCancel} className="border border-gray-200 rounded px-3 py-1.5 text-sm">{t.buttons.cancel}</button>
        </div>
      </div>
    );
  }

  // Step 3: Quote details
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <div className="text-sm font-semibold text-[#0c1b3a]">{t.labels.step3}</div>
        <div className="text-xs text-gray-500">{selectedCustomer?.customer_name} · {items.length} services</div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={label}>{t.fields.quoteNo}</div>
            <input className={inp} value={quote.quote_no} onChange={e => setQuote(q => ({ ...q, quote_no: e.target.value }))} />
          </div>
          <div>
            <div className={label}>{t.fields.quoteTitle}</div>
            <input className={inp} value={quote.quotation_title || ''} onChange={e => setQuote(q => ({ ...q, quotation_title: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={label}>{t.fields.quoteDate}</div>
            <input className={inp} type="date" value={quote.quote_date} onChange={e => setQuote(q => ({ ...q, quote_date: e.target.value }))} />
          </div>
          <div>
            <div className={label}>{t.fields.validUntil}</div>
            <input className={inp} type="date" value={quote.valid_until || ''} onChange={e => setQuote(q => ({ ...q, valid_until: e.target.value }))} />
          </div>
          <div>
            <div className={label}>{t.fields.currency}</div>
            <select className={inp} value={quote.currency} onChange={e => setQuote(q => ({ ...q, currency: e.target.value }))}>
              {['AED','USD','CNY','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className={label}>{t.fields.paymentTerms}</div>
          <input className={inp} value={quote.payment_terms || ''} onChange={e => setQuote(q => ({ ...q, payment_terms: e.target.value }))} />
        </div>
        <div>
          <div className={label}>{t.fields.deliveryPeriod}</div>
          <input className={inp} value={quote.delivery_period || ''} onChange={e => setQuote(q => ({ ...q, delivery_period: e.target.value }))} />
        </div>

        {/* Discount */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={label}>{t.fields.discountType}</div>
            <select className={inp} value={quote.discount_type || ''} onChange={e => setQuote(q => ({ ...q, discount_type: (e.target.value || undefined) as any }))}>
              <option value="">—</option>
              <option value="fixed">{t.fields.discountFixed}</option>
              <option value="percent">{t.fields.discountPercent}</option>
            </select>
          </div>
          <div>
            <div className={label}>{t.fields.discount}</div>
            <input className={inp} type="number" min={0} value={quote.discount_value || ''} onChange={e => setQuote(q => ({ ...q, discount_value: Number(e.target.value) }))} />
          </div>
          <div>
            <div className={label}>{t.fields.grandTotal}</div>
            <div className="px-2 py-2 font-bold text-[#0c1b3a]">{fmt(totals.grandTotal, quote.currency)}</div>
          </div>
        </div>

        <div>
          <div className={label}>{t.fields.quoteExclusions}</div>
          <textarea className={inp + ' resize-none'} rows={2} value={quote.exclusions || ''} onChange={e => setQuote(q => ({ ...q, exclusions: e.target.value }))} />
        </div>
        <div>
          <div className={label}>{t.fields.notes}</div>
          <textarea className={inp + ' resize-none'} rows={2} value={quote.notes || ''} onChange={e => setQuote(q => ({ ...q, notes: e.target.value }))} />
        </div>
        <div>
          <div className={label}>{t.fields.owner}</div>
          <input className={inp} value={quote.owner || ''} onChange={e => setQuote(q => ({ ...q, owner: e.target.value }))} />
        </div>
      </div>

      <div className="p-3 border-t border-gray-100 flex gap-2 flex-wrap">
        <button onClick={() => setStep(2)} className="border border-gray-200 rounded px-3 py-1.5 text-sm">← {t.buttons.back}</button>
        <div className="flex-1" />
        <button onClick={() => handleSave('DRAFT')} disabled={saving} className="border border-gray-200 rounded px-3 py-1.5 text-sm disabled:opacity-50">
          {t.buttons.saveDraft}
        </button>
        <button onClick={() => handleSave('FINAL')} disabled={saving || items.length === 0} className="bg-[#0c1b3a] text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
          {saving ? t.labels.saving : t.buttons.generateQuote}
        </button>
      </div>
    </div>
  );
}
