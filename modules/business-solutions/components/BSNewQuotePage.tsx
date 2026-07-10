import React, { useState, useMemo, useRef, useEffect } from 'react';
import type {
  ServiceCustomer, ServiceCatalogItem, ServiceCategory,
  ServiceQuoteLineItem, ServiceQuote, BSLang,
} from '../types';
import { useT } from '../translations';
import { calcQuoteTotals, calcLineTotal, fmt } from '../lib/bsCalculations';
import { saveCustomer, generateCustomerNumber, generateQuoteNo, saveQuote } from '../lib/bsCloud';
import { syncCustomerToNotion, syncQuoteToNotion } from '../lib/bsNotionSync';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

interface Props {
  lang: BSLang;
  customers: ServiceCustomer[];
  categories: ServiceCategory[];
  catalogItems: ServiceCatalogItem[];
  onCustomerSaved: (c: ServiceCustomer) => void;
  onQuoteSaved: () => void;
  initialCustomer?: ServiceCustomer;
}

function uid() { return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function makeItemFromCatalog(
  item: ServiceCatalogItem,
  categories: ServiceCategory[],
  lang: BSLang,
  existingCount: number,
): ServiceQuoteLineItem {
  const cat = categories.find(c => c.id === item.category_id);
  return {
    id: uid(),
    catalog_service_id: item.id,
    category_name: lang === 'zh' ? (cat?.name_cn || '') : (cat?.name_en || ''),
    service_name: lang === 'zh' ? item.name_cn : item.name_en,
    description: lang === 'zh' ? (item.description_zh || '') : (item.description_en || ''),
    scope: lang === 'zh' ? (item.scope_zh || '') : (item.scope_en || ''),
    deliverables: lang === 'zh' ? (item.deliverables_zh || '') : (item.deliverables_en || ''),
    item_exclusions: lang === 'zh' ? (item.exclusions_zh || '') : (item.exclusions_en || ''),
    timeline: item.default_timeline || '',
    unit: item.default_unit || '项',
    quantity: item.default_quantity || 1,
    months: item.default_months || 1,
    billing_type: item.default_billing_type || 'fixed',
    billing_label: '',
    one_time_fee: item.one_time_fee || 0,
    monthly_fee: item.monthly_fee || 0,
    annual_fee: item.annual_fee || 0,
    unit_price: item.one_time_fee || 0,
    line_total: 0,
    is_optional: false,
    sort_order: existingCount,
  };
}

export function BSNewQuotePage({
  lang, customers, categories, catalogItems, onCustomerSaved, onQuoteSaved, initialCustomer,
}: Props) {
  const t = useT(lang);
  const today = new Date().toISOString().split('T')[0];
  const isZh = lang === 'zh';

  // ── Customer ──────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<ServiceCustomer | null>(initialCustomer || null);
  const [custSearch, setCustSearch] = useState(initialCustomer?.customer_name || '');
  const [custDropOpen, setCustDropOpen] = useState(false);
  const [showNewCustForm, setShowNewCustForm] = useState(false);
  const [newCust, setNewCust] = useState({
    customer_name: '', company_name: '', contact_name: '',
    whatsapp: '', email: '', country: '', requirement_summary: '',
  });
  const [savingCust, setSavingCust] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  // ── Service picker ────────────────────────────────────────────────────────
  const [activeCatId, setActiveCatId] = useState('');
  const [svcSearch, setSvcSearch] = useState('');

  // ── Quote items ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<ServiceQuoteLineItem[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // ── Quote meta ────────────────────────────────────────────────────────────
  const [quoteNo] = useState(() => generateQuoteNo());
  const [quoteTitle, setQuoteTitle] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [validUntil, setValidUntil] = useState('');
  const [discountType, setDiscountType] = useState<'' | 'fixed' | 'percent'>('');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryPeriod, setDeliveryPeriod] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteExclusions, setQuoteExclusions] = useState('');
  const [owner, setOwner] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  const totals = useMemo(
    () => calcQuoteTotals(items, discountType || undefined, discountValue),
    [items, discountType, discountValue],
  );

  const itemsWithTotals = useMemo(
    () => items.map(it => ({ ...it, line_total: calcLineTotal(it) })),
    [items],
  );

  const filteredCustomers = useMemo(() => {
    if (!custSearch) return customers.slice(0, 20);
    const q = custSearch.toLowerCase();
    return customers.filter(c =>
      c.customer_name.toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.contact_name || '').toLowerCase().includes(q),
    ).slice(0, 20);
  }, [customers, custSearch]);

  const filteredServices = useMemo(() => {
    let list = catalogItems.filter(i => i.active);
    if (activeCatId) list = list.filter(i => i.category_id === activeCatId);
    if (svcSearch) {
      const q = svcSearch.toLowerCase();
      list = list.filter(i =>
        (isZh ? i.name_cn : i.name_en).toLowerCase().includes(q) ||
        (isZh ? (i.description_zh || '') : (i.description_en || '')).toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalogItems, activeCatId, svcSearch, isZh]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const addServiceItem = (item: ServiceCatalogItem) => {
    setItems(prev => [...prev, makeItemFromCatalog(item, categories, lang, prev.length)]);
  };

  const addCustomItem = () => {
    const id = uid();
    setItems(prev => [...prev, {
      id, catalog_service_id: undefined, category_name: '', sort_order: prev.length,
      service_name: isZh ? '自定义服务' : 'Custom Service',
      description: '', scope: '', deliverables: '', item_exclusions: '', timeline: '',
      unit: '项', quantity: 1, months: 1, billing_type: 'fixed', billing_label: '',
      one_time_fee: 0, monthly_fee: 0, annual_fee: 0, unit_price: 0, line_total: 0, is_optional: false,
    }]);
    setExpandedItemId(id);
  };

  const updateItem = (id: string, patch: Partial<ServiceQuoteLineItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  };

  const handleSaveNewCustomer = async () => {
    if (!newCust.customer_name.trim()) return;
    setSavingCust(true);
    const c: ServiceCustomer = {
      ...newCust,
      customer_number: generateCustomerNumber(),
      status: 'NEW_REQUIREMENT',
      priority: 'B',
      created_at: new Date().toISOString(),
    };
    const saved = await saveCustomer(c);
    setSavingCust(false);
    if (saved) {
      onCustomerSaved(saved);
      setSelectedCustomer(saved);
      setCustSearch(saved.customer_name);
      setShowNewCustForm(false);
      setNewCust({ customer_name: '', company_name: '', contact_name: '', whatsapp: '', email: '', country: '', requirement_summary: '' });
      syncCustomerToNotion(saved).catch(console.error);
    }
  };

  const handleSaveQuote = async (status: 'DRAFT' | 'FINAL') => {
    if (!selectedCustomer) {
      alert(isZh ? '请先选择或新增服务客户' : 'Please select or add a service client first');
      return;
    }
    if (items.length === 0) {
      alert(isZh ? '请至少添加一个服务项目' : 'Please add at least one service item');
      return;
    }
    setSaving(true);
    const quote: ServiceQuote = {
      quote_no: quoteNo, version: 1,
      quotation_title: quoteTitle || `${selectedCustomer.customer_name} - ${isZh ? '服务报价' : 'Service Quote'}`,
      customer_id: selectedCustomer.id,
      customer_name: selectedCustomer.customer_name,
      contact_person: selectedCustomer.contact_name,
      quote_date: today,
      valid_until: validUntil || undefined,
      currency,
      payment_terms: paymentTerms || undefined,
      delivery_period: deliveryPeriod || undefined,
      notes: quoteNotes || undefined,
      exclusions: quoteExclusions || undefined,
      owner: owner || undefined,
      status,
      discount_type: (discountType as 'fixed' | 'percent') || undefined,
      discount_value: discountValue,
      discount_amount: totals.discountAmount,
      subtotal_one_time: totals.subtotalOneTime,
      subtotal_monthly: totals.subtotalMonthly,
      subtotal_annual: totals.subtotalAnnual,
      total_one_time: totals.totalOneTime,
      monthly_fee: totals.monthlyFee,
      annual_recurring_amount: totals.annualRecurring,
      grand_total: totals.grandTotal,
      total_amount: totals.grandTotal,
    };
    const savedId = await saveQuote(quote, itemsWithTotals);
    setSaving(false);
    if (savedId) {
      syncQuoteToNotion({ ...quote, id: savedId }).catch(console.error);
      onQuoteSaved();
    } else {
      alert(isZh ? '保存失败，请重试' : 'Save failed, please try again');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 p-6 w-full" style={{ minHeight: 'calc(100vh - 140px)' }}>

      {/* ═══ LEFT SIDE 45% ═══════════════════════════════════════════════════ */}
      <div
        className="flex flex-col gap-5 overflow-y-auto pb-16"
        style={{ width: '45%', maxHeight: 'calc(100vh - 140px)' }}
      >

        {/* ── Card 1: Customer Selection ──────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[28px] shadow-sm" style={{ border: `1px solid ${GOLD}33` }}>
          <div className="flex items-center justify-between mb-4">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>
              {isZh ? '1. 选择服务客户' : '1. Customer Selection'}
            </label>
            <button
              onClick={() => { setShowNewCustForm(v => !v); setCustDropOpen(false); }}
              className="text-[11px] font-black px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: showNewCustForm ? GOLD : NAVY,
                color: showNewCustForm ? NAVY : 'white',
              }}
            >
              {showNewCustForm
                ? (isZh ? '✕ 取消' : '✕ Cancel')
                : (isZh ? '+ 新增客户' : '+ New Client')}
            </button>
          </div>

          {/* Inline new customer form */}
          {showNewCustForm && (
            <div className="mb-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {isZh ? '快速建档' : 'Quick Add Client'}
              </p>
              <input
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                style={{ borderColor: `${GOLD}50` }}
                placeholder={isZh ? '客户名称 *' : 'Client Name *'}
                value={newCust.customer_name}
                onChange={e => setNewCust(v => ({ ...v, customer_name: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  placeholder={isZh ? '公司名称' : 'Company'} value={newCust.company_name}
                  onChange={e => setNewCust(v => ({ ...v, company_name: e.target.value }))} />
                <input className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  placeholder={isZh ? '联系人' : 'Contact Person'} value={newCust.contact_name}
                  onChange={e => setNewCust(v => ({ ...v, contact_name: e.target.value }))} />
                <input className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  placeholder="WhatsApp" value={newCust.whatsapp}
                  onChange={e => setNewCust(v => ({ ...v, whatsapp: e.target.value }))} />
                <input className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  placeholder="Email" value={newCust.email}
                  onChange={e => setNewCust(v => ({ ...v, email: e.target.value }))} />
                <input className="px-3 py-2 rounded-xl border text-sm outline-none col-span-2" style={{ borderColor: `${GOLD}30` }}
                  placeholder={isZh ? '国家' : 'Country'} value={newCust.country}
                  onChange={e => setNewCust(v => ({ ...v, country: e.target.value }))} />
              </div>
              <textarea
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                style={{ borderColor: `${GOLD}30` }}
                rows={2}
                placeholder={isZh ? '需求摘要（可选）' : 'Requirement summary (optional)'}
                value={newCust.requirement_summary}
                onChange={e => setNewCust(v => ({ ...v, requirement_summary: e.target.value }))}
              />
              <button
                onClick={handleSaveNewCustomer}
                disabled={savingCust || !newCust.customer_name.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-40"
                style={{ background: NAVY }}
              >
                {savingCust
                  ? (isZh ? '保存中…' : 'Saving…')
                  : (isZh ? '保存并选择此客户' : 'Save & Select Client')}
              </button>
            </div>
          )}

          {/* Search existing customers */}
          {!showNewCustForm && (
            <div ref={custRef} className="relative">
              <input
                className="w-full px-4 py-3 rounded-2xl border-2 font-bold text-sm outline-none transition-colors"
                style={{
                  borderColor: selectedCustomer ? `${GOLD}60` : `${GOLD}30`,
                  background: selectedCustomer ? `${GOLD}08` : 'white',
                  color: NAVY,
                }}
                placeholder={isZh ? '搜索已有服务客户…' : 'Search existing service clients…'}
                value={custSearch}
                onFocus={() => setCustDropOpen(true)}
                onChange={e => {
                  setCustSearch(e.target.value);
                  setCustDropOpen(true);
                  setSelectedCustomer(null);
                }}
              />
              {custDropOpen && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                    <li
                      key={c.id}
                      className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      onMouseDown={() => { setSelectedCustomer(c); setCustSearch(c.customer_name); setCustDropOpen(false); }}
                    >
                      <div className="font-bold text-sm text-gray-800">{c.customer_name}</div>
                      {c.company_name && <div className="text-xs text-gray-400">{c.company_name}</div>}
                    </li>
                  )) : (
                    <li className="px-4 py-3 text-sm text-gray-400">
                      {custSearch
                        ? (isZh ? '未找到客户，可点击「+ 新增客户」建档' : 'No match — click "+ New Client"')
                        : (isZh ? '输入客户名称搜索' : 'Type to search clients')}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Selected customer info card */}
          {selectedCustomer && !showNewCustForm && (
            <div className="mt-3 p-3 rounded-xl space-y-1.5 text-xs" style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}25` }}>
              <div className="flex justify-between items-start">
                <span className="font-black text-gray-800 text-sm">{selectedCustomer.customer_name}</span>
                {selectedCustomer.customer_number && (
                  <span className="text-gray-400 text-[10px] font-mono">{selectedCustomer.customer_number}</span>
                )}
              </div>
              {selectedCustomer.company_name && <div className="text-gray-600">{selectedCustomer.company_name}</div>}
              <div className="flex gap-3 text-gray-400 flex-wrap">
                {selectedCustomer.contact_name && <span>👤 {selectedCustomer.contact_name}</span>}
                {selectedCustomer.whatsapp && <span>📱 {selectedCustomer.whatsapp}</span>}
                {selectedCustomer.email && <span>✉ {selectedCustomer.email}</span>}
                {selectedCustomer.country && <span>🌍 {selectedCustomer.country}</span>}
              </div>
              {selectedCustomer.requirement_summary && (
                <div className="text-gray-500 border-t border-gray-100 pt-1.5 mt-1">
                  {selectedCustomer.requirement_summary}
                </div>
              )}
              <button
                className="text-gray-400 text-[10px] underline hover:text-gray-600"
                onClick={() => { setSelectedCustomer(null); setCustSearch(''); }}
              >
                {isZh ? '更换客户' : 'Change client'}
              </button>
            </div>
          )}
        </div>

        {/* ── Card 2: Service Selection ───────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[28px] shadow-sm" style={{ border: `1px solid ${GOLD}33` }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>
            {isZh ? '2. 选择服务' : '2. Service Selection'}
          </label>

          {/* Search */}
          <input
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-3"
            style={{ borderColor: `${GOLD}30` }}
            placeholder={isZh ? '搜索服务项目…' : 'Search services…'}
            value={svcSearch}
            onChange={e => setSvcSearch(e.target.value)}
          />

          {/* Category tabs */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button
              onClick={() => setActiveCatId('')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: activeCatId === '' ? NAVY : 'transparent',
                color: activeCatId === '' ? 'white' : '#6b7280',
                border: activeCatId === '' ? 'none' : '1px solid #e5e7eb',
              }}
            >
              {isZh ? '全部' : 'All'}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(activeCatId === cat.id ? '' : (cat.id || ''))}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: activeCatId === cat.id ? NAVY : 'transparent',
                  color: activeCatId === cat.id ? 'white' : '#6b7280',
                  border: activeCatId === cat.id ? 'none' : '1px solid #e5e7eb',
                }}
              >
                {isZh ? cat.name_cn : cat.name_en}
              </button>
            ))}
          </div>

          {/* Service compact list */}
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {filteredServices.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">
                {isZh ? '暂无服务项目' : 'No services found'}
              </div>
            ) : filteredServices.map(svc => {
              const name = isZh ? svc.name_cn : svc.name_en;
              const fee = svc.one_time_fee
                ? fmt(svc.one_time_fee, currency)
                : svc.monthly_fee
                  ? `${fmt(svc.monthly_fee, currency)}/${isZh ? '月' : 'mo'}`
                  : svc.annual_fee
                    ? `${fmt(svc.annual_fee, currency)}/${isZh ? '年' : 'yr'}`
                    : (isZh ? '待定' : 'TBD');
              const billing = t.billingType[svc.default_billing_type] || svc.default_billing_type;
              return (
                <div
                  key={svc.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                    <div className="text-xs text-gray-400 flex gap-2 items-center">
                      <span className="text-gray-300">{billing}</span>
                      <span className="font-bold" style={{ color: GOLD }}>{fee}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => addServiceItem(svc)}
                    className="text-xs font-black w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                    style={{ background: NAVY, color: 'white' }}
                    title={isZh ? '添加到报价' : 'Add to quote'}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom service */}
          <button
            onClick={addCustomItem}
            className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-gray-400 border border-dashed border-gray-200 hover:border-gray-400 hover:text-gray-600 transition-all"
          >
            {isZh ? '+ 添加自定义服务项目' : '+ Add Custom Service Item'}
          </button>
        </div>

        {/* ── Card 3: Quote Items + Terms ─────────────────────────────────── */}
        {items.length > 0 && (
          <div className="bg-white p-7 rounded-[28px] shadow-sm" style={{ border: `2px solid ${GOLD}40` }}>
            <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>
              {isZh ? '3. 报价明细与商务条款' : '3. Quotation Details & Commercial Terms'}
            </label>

            {/* Items */}
            <div className="space-y-2 mb-5">
              {itemsWithTotals.map(it => (
                <div key={it.id} className="rounded-xl overflow-hidden border border-gray-100">
                  {/* Row */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedItemId(expandedItemId === it.id ? null : it.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{it.service_name}</div>
                      {it.category_name && <div className="text-xs text-gray-400">{it.category_name}</div>}
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: GOLD }}>
                      {it.one_time_fee > 0
                        ? fmt(it.one_time_fee * it.quantity, currency)
                        : it.monthly_fee > 0
                          ? `${fmt(it.monthly_fee, currency)}/${isZh ? '月' : 'mo'}`
                          : it.annual_fee > 0
                            ? `${fmt(it.annual_fee, currency)}/${isZh ? '年' : 'yr'}`
                            : '—'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); removeItem(it.id); }}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0 text-sm w-5 text-center"
                    >✕</button>
                    <span className="text-gray-300 text-[10px]">{expandedItemId === it.id ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded editor */}
                  {expandedItemId === it.id && (
                    <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-gray-100 bg-gray-50">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '服务名称' : 'Service Name'}</label>
                          <input className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.service_name} onChange={e => updateItem(it.id, { service_name: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '服务分类' : 'Category'}</label>
                          <input className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.category_name} onChange={e => updateItem(it.id, { category_name: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '服务说明' : 'Description'}</label>
                        <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none bg-white" style={{ borderColor: `${GOLD}30` }}
                          rows={2} value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '服务范围' : 'Scope of Work'}</label>
                        <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none bg-white" style={{ borderColor: `${GOLD}30` }}
                          rows={2} value={it.scope} onChange={e => updateItem(it.id, { scope: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '交付内容' : 'Deliverables'}</label>
                        <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none bg-white" style={{ borderColor: `${GOLD}30` }}
                          rows={2} value={it.deliverables} onChange={e => updateItem(it.id, { deliverables: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '不包含事项' : 'Exclusions'}</label>
                        <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none bg-white" style={{ borderColor: `${GOLD}30` }}
                          rows={1} value={it.item_exclusions} onChange={e => updateItem(it.id, { item_exclusions: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '一次性费用' : 'One-time Fee'}</label>
                          <input type="number" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-right bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.one_time_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { one_time_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '月服务费' : 'Monthly Fee'}</label>
                          <input type="number" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-right bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.monthly_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { monthly_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '年服务费' : 'Annual Fee'}</label>
                          <input type="number" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-right bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.annual_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { annual_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '数量' : 'Qty'}</label>
                          <input type="number" min="1" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-center bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.quantity} onChange={e => updateItem(it.id, { quantity: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '月数' : 'Months'}</label>
                          <input type="number" min="1" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none text-center bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.months} onChange={e => updateItem(it.id, { months: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '交付周期' : 'Timeline'}</label>
                          <input className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: `${GOLD}30` }}
                            value={it.timeline} placeholder={isZh ? '如: 2-4周' : 'e.g. 2-4 wks'}
                            onChange={e => updateItem(it.id, { timeline: e.target.value })} />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={it.is_optional} onChange={e => updateItem(it.id, { is_optional: e.target.checked })} />
                        {isZh ? '标记为可选项目' : 'Mark as optional item'}
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Fee summary */}
            <div className="space-y-1.5 pt-3 border-t border-gray-100 text-sm">
              {totals.subtotalOneTime > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{isZh ? '一次性费用小计' : 'One-time Subtotal'}</span>
                  <span className="font-medium font-mono">{fmt(totals.subtotalOneTime, currency)}</span>
                </div>
              )}
              {totals.subtotalMonthly > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{isZh ? '月服务费小计' : 'Monthly Subtotal'}</span>
                  <span className="font-medium font-mono">{fmt(totals.subtotalMonthly, currency)}</span>
                </div>
              )}
              {totals.subtotalAnnual > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{isZh ? '年服务费小计' : 'Annual Subtotal'}</span>
                  <span className="font-medium font-mono">{fmt(totals.subtotalAnnual, currency)}</span>
                </div>
              )}

              {/* Discount row */}
              <div className="flex items-center gap-2 pt-1 pb-1">
                <select
                  className="border rounded-lg px-2 py-1 text-xs outline-none"
                  style={{ borderColor: `${GOLD}30` }}
                  value={discountType}
                  onChange={e => setDiscountType(e.target.value as any)}
                >
                  <option value="">{isZh ? '无折扣' : 'No Discount'}</option>
                  <option value="fixed">{isZh ? '固定金额' : 'Fixed Amount'}</option>
                  <option value="percent">{isZh ? '百分比 %' : 'Percentage %'}</option>
                </select>
                {discountType && (
                  <input
                    type="number"
                    className="flex-1 border rounded-lg px-2 py-1 text-xs outline-none text-right"
                    style={{ borderColor: `${GOLD}30` }}
                    value={discountValue || ''}
                    onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder={discountType === 'percent' ? '%' : currency}
                  />
                )}
                {totals.discountAmount > 0 && (
                  <span className="text-xs font-bold text-red-500 flex-shrink-0">
                    -{fmt(totals.discountAmount, currency)}
                  </span>
                )}
              </div>

              <div className="flex justify-between font-black pt-2 border-t" style={{ color: NAVY }}>
                <span className="text-sm">{isZh ? '总金额' : 'Grand Total'}</span>
                <span className="text-base font-mono">{fmt(totals.grandTotal, currency)}</span>
              </div>
            </div>

            {/* Commercial terms */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                {isZh ? '商务条款' : 'Commercial Terms'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '币种' : 'Currency'}</label>
                  <select className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                    value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '有效期至' : 'Valid Until'}</label>
                  <input type="date" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                    value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '付款方式' : 'Payment Terms'}</label>
                <input className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                  placeholder={isZh ? '如: 50% 预付，完成后付 50%' : 'e.g. 50% upfront, 50% on completion'} />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '项目总周期' : 'Project Timeline'}</label>
                <input className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: `${GOLD}30` }}
                  value={deliveryPeriod} onChange={e => setDeliveryPeriod(e.target.value)}
                  placeholder={isZh ? '如: 60 个工作日' : 'e.g. 60 business days'} />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '总体不包含事项' : 'Exclusions'}</label>
                <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none" style={{ borderColor: `${GOLD}30` }}
                  rows={2} value={quoteExclusions} onChange={e => setQuoteExclusions(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '总体备注' : 'Notes'}</label>
                <textarea className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none resize-none" style={{ borderColor: `${GOLD}30` }}
                  rows={2} value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── Card 4: Save ────────────────────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[28px] shadow-sm" style={{ border: `1px solid ${GOLD}33` }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>
            {isZh ? '4. 保存报价' : '4. Save Quote'}
          </label>
          <div className="space-y-3">
            <div>
              <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '报价标题' : 'Quote Title'}</label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: `${GOLD}30` }}
                value={quoteTitle}
                onChange={e => setQuoteTitle(e.target.value)}
                placeholder={selectedCustomer
                  ? `${selectedCustomer.customer_name} - ${isZh ? '服务报价' : 'Service Quote'}`
                  : (isZh ? '报价标题' : 'Quote title')}
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-400 font-black uppercase block mb-1">{isZh ? '负责人' : 'Owner'}</label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: `${GOLD}30` }}
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="Chris / Lili / Novie"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleSaveQuote('DRAFT')}
                disabled={saving || !selectedCustomer || items.length === 0}
                className="flex-1 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-40 border-2"
                style={{ borderColor: NAVY, color: NAVY, background: 'white' }}
              >
                {saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存草稿' : 'Save Draft')}
              </button>
              <button
                onClick={() => handleSaveQuote('FINAL')}
                disabled={saving || !selectedCustomer || items.length === 0}
                className="flex-1 py-3 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-40"
                style={{ background: NAVY }}
              >
                {isZh ? '生成正式报价' : 'Generate Quote'}
              </button>
            </div>
            {(!selectedCustomer || items.length === 0) && (
              <p className="text-xs text-gray-400 text-center">
                {!selectedCustomer
                  ? (isZh ? '请先选择或新增服务客户' : 'Select a service client first')
                  : (isZh ? '请至少添加一个服务项目' : 'Add at least one service item')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT SIDE 55% — Live Preview ═══════════════════════════════════ */}
      <div
        className="overflow-y-auto pb-6 sticky top-0"
        style={{ width: '55%', maxHeight: 'calc(100vh - 140px)' }}
      >
        <BSQuotePreviewPanel
          lang={lang}
          quoteNo={quoteNo}
          quoteDate={today}
          validUntil={validUntil}
          customer={selectedCustomer}
          items={itemsWithTotals}
          totals={totals}
          currency={currency}
          paymentTerms={paymentTerms}
          deliveryPeriod={deliveryPeriod}
          notes={quoteNotes}
          exclusions={quoteExclusions}
          quoteTitle={quoteTitle}
          discountType={discountType || undefined}
          discountValue={discountValue}
        />
      </div>
    </div>
  );
}

// ── Live quote preview panel ─────────────────────────────────────────────────

interface PreviewProps {
  lang: BSLang;
  quoteNo: string;
  quoteDate: string;
  validUntil?: string;
  customer: ServiceCustomer | null;
  items: ServiceQuoteLineItem[];
  totals: ReturnType<typeof calcQuoteTotals>;
  currency: string;
  paymentTerms?: string;
  deliveryPeriod?: string;
  notes?: string;
  exclusions?: string;
  quoteTitle?: string;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
}

function BSQuotePreviewPanel(p: PreviewProps) {
  const isZh = p.lang === 'zh';
  const docTitle = isZh ? '服务报价单' : 'SERVICE QUOTATION';

  return (
    <div
      className="bg-white rounded-[28px] shadow-md overflow-hidden"
      style={{ border: '1px solid #e5e7eb', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
    >
      {/* Company header */}
      <div className="px-10 pt-8 pb-6 text-center" style={{ background: NAVY }}>
        <div className="text-[10px] font-black tracking-[0.25em] uppercase mb-1" style={{ color: GOLD }}>
          GCI
        </div>
        <div className="text-[11px] font-black tracking-[0.1em] uppercase text-white/90 leading-tight">
          GLOBALCARE INFO GENERAL TRADING FZCO
        </div>
        <div className="text-[9px] text-white/40 mt-1 tracking-widest uppercase">
          TEL: +971585566809 · chris@globalcareinfo.com · Dubai, UAE
        </div>
        <div
          className="mt-5 inline-block px-6 py-2 rounded-full text-sm font-black tracking-[0.12em] uppercase"
          style={{ background: GOLD, color: NAVY }}
        >
          {docTitle}
        </div>
      </div>

      {/* Quote meta */}
      <div className="px-10 py-5 border-b border-gray-100">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <div className="flex gap-2">
            <span className="text-gray-400 w-24 flex-shrink-0">{isZh ? '报价编号' : 'Quote No.'}</span>
            <span className="font-bold text-gray-800 font-mono">{p.quoteNo}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-24 flex-shrink-0">{isZh ? '报价日期' : 'Date'}</span>
            <span className="font-bold text-gray-800">{p.quoteDate}</span>
          </div>
          {p.validUntil && (
            <div className="flex gap-2">
              <span className="text-gray-400 w-24 flex-shrink-0">{isZh ? '有效期至' : 'Valid Until'}</span>
              <span className="font-bold text-gray-800">{p.validUntil}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-400 w-24 flex-shrink-0">{isZh ? '币种' : 'Currency'}</span>
            <span className="font-bold text-gray-800">{p.currency}</span>
          </div>
          {p.quoteTitle && (
            <div className="flex gap-2 col-span-2">
              <span className="text-gray-400 w-24 flex-shrink-0">{isZh ? '标题' : 'Subject'}</span>
              <span className="font-bold text-gray-800">{p.quoteTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Client info */}
      <div className="px-10 py-5 border-b border-gray-100">
        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">
          {isZh ? '客户信息' : 'CLIENT INFORMATION'}
        </div>
        {p.customer ? (
          <div>
            <div className="font-black text-base" style={{ color: NAVY }}>{p.customer.customer_name}</div>
            {p.customer.company_name && (
              <div className="text-sm text-gray-600 mt-0.5">{p.customer.company_name}</div>
            )}
            <div className="flex gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
              {p.customer.contact_name && <span>{p.customer.contact_name}</span>}
              {p.customer.whatsapp && <span>{p.customer.whatsapp}</span>}
              {p.customer.email && <span>{p.customer.email}</span>}
              {p.customer.country && <span>{p.customer.country}</span>}
            </div>
          </div>
        ) : (
          <div className="text-gray-200 text-sm italic">{isZh ? '请选择服务客户…' : 'Select a service client…'}</div>
        )}
      </div>

      {/* Service items */}
      <div className="px-10 py-5">
        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-3">
          {isZh ? '服务项目明细' : 'SERVICE ITEMS'}
        </div>
        {p.items.length === 0 ? (
          <div className="text-gray-200 text-sm italic py-8 text-center">
            {isZh ? '从左侧选择服务项目…' : 'Select service items on the left…'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                <th className="text-left pb-2 font-black text-[9px] uppercase tracking-wider pr-3" style={{ color: NAVY }}>
                  {isZh ? '服务项目' : 'Service'}
                </th>
                <th className="text-center pb-2 font-black text-[9px] uppercase tracking-wider w-10" style={{ color: NAVY }}>
                  {isZh ? '数量' : 'Qty'}
                </th>
                <th className="text-right pb-2 font-black text-[9px] uppercase tracking-wider w-28" style={{ color: NAVY }}>
                  {isZh ? '费用' : 'Fee'}
                </th>
                <th className="text-right pb-2 font-black text-[9px] uppercase tracking-wider w-28" style={{ color: NAVY }}>
                  {isZh ? '小计' : 'Subtotal'}
                </th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((it, i) => {
                const lt = calcLineTotal(it);
                const feeDisplay = it.one_time_fee > 0
                  ? fmt(it.one_time_fee, p.currency)
                  : it.monthly_fee > 0
                    ? `${fmt(it.monthly_fee, p.currency)}/${isZh ? '月' : 'mo'}`
                    : it.annual_fee > 0
                      ? `${fmt(it.annual_fee, p.currency)}/${isZh ? '年' : 'yr'}`
                      : (isZh ? '待定' : 'TBD');
                const subDisplay = lt > 0
                  ? fmt(lt, p.currency)
                  : it.monthly_fee > 0
                    ? `${fmt(it.monthly_fee * it.quantity, p.currency)}/${isZh ? '月' : 'mo'}`
                    : (isZh ? '待定' : 'TBD');
                return (
                  <tr key={it.id} style={{ borderBottom: i < p.items.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td className="py-3 pr-3">
                      <div className="font-bold text-gray-800">{it.service_name}</div>
                      {it.category_name && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{it.category_name}</div>
                      )}
                      {it.description && (
                        <div className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap leading-relaxed line-clamp-3">
                          {it.description}
                        </div>
                      )}
                      {it.timeline && (
                        <div className="text-[10px] mt-1 font-medium" style={{ color: GOLD }}>
                          {isZh ? '交付周期: ' : 'Timeline: '}{it.timeline}
                        </div>
                      )}
                      {it.is_optional && (
                        <span className="text-[9px] text-purple-400 font-bold">
                          {isZh ? '(可选项目)' : '(Optional)'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center text-gray-600">{it.quantity}</td>
                    <td className="py-3 text-right text-gray-600 font-mono">{feeDisplay}</td>
                    <td className="py-3 text-right font-bold font-mono" style={{ color: NAVY }}>
                      {subDisplay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Fee breakdown */}
      {p.items.length > 0 && (
        <div className="px-10 pb-5">
          <div style={{ marginLeft: 'auto', maxWidth: 290 }}>
            {p.totals.subtotalOneTime > 0 && (
              <div className="flex justify-between text-xs py-1">
                <span className="text-gray-400">{isZh ? '一次性费用小计' : 'One-time Subtotal'}</span>
                <span className="font-medium font-mono">{fmt(p.totals.subtotalOneTime, p.currency)}</span>
              </div>
            )}
            {p.totals.subtotalMonthly > 0 && (
              <div className="flex justify-between text-xs py-1">
                <span className="text-gray-400">{isZh ? '月服务费小计' : 'Monthly Subtotal'}</span>
                <span className="font-medium font-mono">{fmt(p.totals.subtotalMonthly, p.currency)}</span>
              </div>
            )}
            {p.totals.subtotalAnnual > 0 && (
              <div className="flex justify-between text-xs py-1">
                <span className="text-gray-400">{isZh ? '年服务费小计' : 'Annual Subtotal'}</span>
                <span className="font-medium font-mono">{fmt(p.totals.subtotalAnnual, p.currency)}</span>
              </div>
            )}
            {p.totals.discountAmount > 0 && (
              <div className="flex justify-between text-xs py-1 text-red-500">
                <span>
                  {isZh ? '折扣' : 'Discount'}
                  {p.discountType === 'percent' ? ` (${p.discountValue}%)` : ''}
                </span>
                <span className="font-medium font-mono">-{fmt(p.totals.discountAmount, p.currency)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-sm font-black pt-2 border-t-2 mt-1"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              <span>{isZh ? '总金额' : 'GRAND TOTAL'}</span>
              <span className="font-mono">{fmt(p.totals.grandTotal, p.currency)}</span>
            </div>
            {p.totals.subtotalMonthly > 0 && (
              <div className="flex justify-between text-xs pt-1 text-gray-400">
                <span>{isZh ? '每月持续费用' : 'Monthly Recurring'}</span>
                <span className="font-mono">{fmt(p.totals.subtotalMonthly, p.currency)}/{isZh ? '月' : 'mo'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Commercial terms */}
      {(p.paymentTerms || p.deliveryPeriod || p.exclusions || p.notes) && (
        <div className="px-10 pb-8 pt-3 border-t border-gray-100 space-y-2.5">
          {p.paymentTerms && (
            <div className="text-xs">
              <span className="font-black text-gray-400 uppercase tracking-widest text-[9px]">
                {isZh ? '付款方式  ·  ' : 'Payment Terms  ·  '}
              </span>
              <span className="text-gray-600">{p.paymentTerms}</span>
            </div>
          )}
          {p.deliveryPeriod && (
            <div className="text-xs">
              <span className="font-black text-gray-400 uppercase tracking-widest text-[9px]">
                {isZh ? '交付周期  ·  ' : 'Timeline  ·  '}
              </span>
              <span className="text-gray-600">{p.deliveryPeriod}</span>
            </div>
          )}
          {p.exclusions && (
            <div className="text-xs">
              <span className="font-black text-gray-400 uppercase tracking-widest text-[9px]">
                {isZh ? '不包含  ·  ' : 'Exclusions  ·  '}
              </span>
              <span className="text-gray-600">{p.exclusions}</span>
            </div>
          )}
          {p.notes && (
            <div className="text-xs">
              <span className="font-black text-gray-400 uppercase tracking-widest text-[9px]">
                {isZh ? '备注  ·  ' : 'Notes  ·  '}
              </span>
              <span className="text-gray-600">{p.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-10 py-4 text-center" style={{ borderTop: `1px solid ${GOLD}30` }}>
        <div className="text-[9px] text-gray-300 uppercase tracking-widest">
          GLOBALCARE INFO GENERAL TRADING FZCO · DUBAI · UAE · GCI PLATFORM
        </div>
      </div>
    </div>
  );
}
