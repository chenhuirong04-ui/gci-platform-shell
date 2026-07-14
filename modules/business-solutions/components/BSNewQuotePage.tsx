import React, { useState, useMemo, useRef, useEffect } from 'react';
import type {
  ServiceCustomer, ServiceCatalogItem, ServiceCategory,
  ServiceQuoteLineItem, ServiceQuote, BSLang, PeriodicBilling,
} from '../types';
import { useT } from '../translations';
import { calcQuoteTotals, calcLineTotal, fmt } from '../lib/bsCalculations';
import { saveCustomer, generateCustomerNumber, generateFwQuoteNo, saveQuote } from '../lib/bsCloud';
import { syncCustomerToNotion, syncQuoteToNotion } from '../lib/bsNotionSync';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

// ── Shared form styles — matches the Quick-Add client form exactly ──────────
const BS_LBL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#0B1F44', marginBottom: 6,
};
const BS_INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #b0bec5',
  fontSize: 15, color: '#0F172A', background: 'white', outline: 'none',
};
const BS_AMT: React.CSSProperties = {
  ...BS_INP, color: '#0B1F44', fontWeight: 700,
};
const BS_TA: React.CSSProperties = {
  ...BS_INP, resize: 'none' as const, lineHeight: 1.6,
};
const BS_SEL: React.CSSProperties = { ...BS_INP };

interface Props {
  lang: BSLang;
  customers: ServiceCustomer[];
  categories: ServiceCategory[];
  catalogItems: ServiceCatalogItem[];
  onCustomerSaved: (c: ServiceCustomer) => void;
  onQuoteSaved: () => void;
  initialCustomer?: ServiceCustomer;
  onGoToCustomerFiles?: (c: ServiceCustomer) => void;
  onGoToCustomerProfile?: (c: ServiceCustomer) => void;
}

function uid() { return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function derivePB(bt: string, otf: number, mf: number, af: number): PeriodicBilling {
  if (bt === 'monthly') return 'monthly_only';
  if (bt === 'yearly' || bt === 'quarterly') return 'annual_only';
  const hasMo = mf > 0, hasAn = af > 0;
  if (hasMo && hasAn) return 'both';
  if (hasMo) return 'monthly_only';
  if (hasAn) return 'annual_only';
  return 'none';
}

function makeItemFromCatalog(
  item: ServiceCatalogItem,
  categories: ServiceCategory[],
  lang: BSLang,
  existingCount: number,
): ServiceQuoteLineItem {
  const cat  = categories.find(c => c.id === item.category_id);
  const otf  = item.one_time_fee  || 0;
  const mf   = item.monthly_fee   || 0;
  const af   = item.annual_fee    || 0;
  const bt   = item.default_billing_type || 'fixed';
  return {
    id: uid(),
    catalog_service_id: item.id,
    category_name: lang === 'zh' ? (cat?.name_cn || '') : (cat?.name_en || cat?.name_cn || ''),
    service_name: lang === 'zh' ? item.name_cn : (item.name_en || item.name_cn),
    description: lang === 'zh' ? (item.description_zh || '') : (item.description_en || ''),
    scope: lang === 'zh' ? (item.scope_zh || '') : (item.scope_en || ''),
    deliverables: lang === 'zh' ? (item.deliverables_zh || '') : (item.deliverables_en || ''),
    item_exclusions: lang === 'zh' ? (item.exclusions_zh || '') : (item.exclusions_en || ''),
    timeline: item.default_timeline || '',
    unit: item.default_unit || '项',
    quantity: item.default_quantity || 1,
    months: item.default_months || 1,
    billing_type: bt,
    billing_label: '',
    periodic_billing: derivePB(bt, otf, mf, af),
    one_time_fee: otf,
    monthly_fee: mf,
    annual_fee: af,
    unit_price: otf,
    line_total: 0,
    is_optional: false,
    sort_order: existingCount,
  };
}

export function BSNewQuotePage({
  lang, customers, categories, catalogItems, onCustomerSaved, onQuoteSaved, initialCustomer,
  onGoToCustomerFiles, onGoToCustomerProfile,
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
  const [custNameError, setCustNameError] = useState(false);
  const [custSaveError, setCustSaveError] = useState('');
  const custRef = useRef<HTMLDivElement>(null);

  // ── Service picker ────────────────────────────────────────────────────────
  const [activeCatId, setActiveCatId] = useState('');
  const [svcSearch, setSvcSearch] = useState('');

  // ── Quote items ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<ServiceQuoteLineItem[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedTermsId, setExpandedTermsId] = useState<string | null>(null);

  // ── Quote meta ────────────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const [quoteNo, setQuoteNo] = useState(`FW-${year}-DRAFT`);
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
  const [vatRate, setVatRate] = useState(0);  // e.g. 0.05 for 5%
  const [saving, setSaving] = useState(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  const totals = useMemo(
    () => calcQuoteTotals(items, discountType || undefined, discountValue, vatRate),
    [items, discountType, discountValue, vatRate],
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
        (isZh ? i.name_cn : (i.name_en || i.name_cn)).toLowerCase().includes(q) ||
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
    const newItem = makeItemFromCatalog(item, categories, lang, items.length);
    setItems(prev => [...prev, newItem]);
    setExpandedItemId(newItem.id);
  };

  const addCustomItem = () => {
    const id = uid();
    setItems(prev => [...prev, {
      id, catalog_service_id: undefined, category_name: '', sort_order: prev.length,
      service_name: isZh ? '自定义服务' : 'Custom Service',
      description: '', scope: '', deliverables: '', item_exclusions: '', timeline: '',
      unit: '项', quantity: 1, months: 1, billing_type: 'fixed', billing_label: '',
      periodic_billing: 'none' as PeriodicBilling,
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
    if (!newCust.customer_name.trim()) {
      setCustNameError(true);
      return;
    }
    setCustNameError(false);
    setCustSaveError('');
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
      setCustNameError(false);
      setCustSaveError('');
      syncCustomerToNotion(saved).catch(console.error);
    } else {
      setCustSaveError(isZh ? '保存失败，请检查网络后重试' : 'Save failed. Please check your connection and retry.');
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
    const fwNo = await generateFwQuoteNo();
    setQuoteNo(fwNo);
    const quote: ServiceQuote = {
      quote_no: fwNo, version: 1,
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
      grand_total: totals.firstYearValue,
      total_amount: totals.firstYearValue,
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
    <div className="flex gap-6 p-6 w-full" style={{ minHeight: 'calc(100vh - 140px)', background: '#f5f3ef' }}>

      {/* ═══ LEFT SIDE 45% ═══════════════════════════════════════════════════ */}
      <div
        className="flex flex-col gap-5 overflow-y-auto pb-16"
        style={{ width: '45%', maxHeight: 'calc(100vh - 140px)' }}
      >

        {/* ── Card 1: Customer Selection ──────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[24px] shadow-sm" style={{ border: `1px solid #e8e0d0` }}>
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
            <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GOLD}55`, background: '#fdfcfa' }}>
              {/* Form header */}
              <div className="px-5 py-3" style={{ background: `${GOLD}18`, borderBottom: `1px solid ${GOLD}40` }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                  {isZh ? '快速建档' : 'Quick Add Client'}
                </p>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Customer name — required */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                    {isZh ? '客户名称' : 'Client Name'}
                    <span style={{ color: '#e53e3e', marginLeft: 4 }}>*</span>
                  </label>
                  <input
                    style={{
                      display: 'block', width: '100%', boxSizing: 'border-box',
                      padding: '11px 14px', borderRadius: 10,
                      border: `1.5px solid ${custNameError ? '#e53e3e' : newCust.customer_name ? GOLD : '#b0bec5'}`,
                      fontSize: 15, color: '#17233C', background: 'white', outline: 'none',
                    }}
                    placeholder={isZh ? '请输入客户名称' : 'Enter client name'}
                    value={newCust.customer_name}
                    onChange={e => {
                      setNewCust(v => ({ ...v, customer_name: e.target.value }));
                      if (e.target.value.trim()) setCustNameError(false);
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = custNameError ? '#e53e3e' : newCust.customer_name ? GOLD : '#b0bec5';
                    }}
                  />
                  {custNameError && (
                    <p style={{ fontSize: 12, color: '#e53e3e', marginTop: 5, fontWeight: 600 }}>
                      {isZh ? '请输入客户名称' : 'Please enter customer name'}
                    </p>
                  )}
                </div>

                {/* Company + Contact row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                      {isZh ? '公司名称' : 'Company'}
                    </label>
                    <input
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                      placeholder={isZh ? '公司全称' : 'Company name'}
                      value={newCust.company_name}
                      onChange={e => setNewCust(v => ({ ...v, company_name: e.target.value }))}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                      {isZh ? '联系人' : 'Contact Person'}
                    </label>
                    <input
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                      placeholder={isZh ? '联系人姓名' : 'Full name'}
                      value={newCust.contact_name}
                      onChange={e => setNewCust(v => ({ ...v, contact_name: e.target.value }))}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                    />
                  </div>
                </div>

                {/* WhatsApp + Email row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                      WhatsApp
                    </label>
                    <input
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                      placeholder="+971 ..."
                      value={newCust.whatsapp}
                      onChange={e => setNewCust(v => ({ ...v, whatsapp: e.target.value }))}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                      {isZh ? '邮箱' : 'Email'}
                    </label>
                    <input
                      type="email"
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                      placeholder="email@example.com"
                      value={newCust.email}
                      onChange={e => setNewCust(v => ({ ...v, email: e.target.value }))}
                      onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                    />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                    {isZh ? '国家' : 'Country'}
                  </label>
                  <input
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none' }}
                    placeholder={isZh ? '如：UAE / China / Saudi Arabia' : 'e.g. UAE / China / Saudi Arabia'}
                    value={newCust.country}
                    onChange={e => setNewCust(v => ({ ...v, country: e.target.value }))}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                  />
                </div>

                {/* Requirement summary */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
                    {isZh ? '需求摘要' : 'Requirement Summary'}
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8a9ab0', marginLeft: 6 }}>
                      {isZh ? '（可选）' : '(optional)'}
                    </span>
                  </label>
                  <textarea
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 14, color: '#17233C', background: 'white', outline: 'none', resize: 'none', minHeight: 80, lineHeight: 1.6 }}
                    placeholder={isZh ? '简要描述客户主要需求…' : 'Briefly describe the client\'s main requirements…'}
                    value={newCust.requirement_summary}
                    onChange={e => setNewCust(v => ({ ...v, requirement_summary: e.target.value }))}
                    onFocus={e => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#b0bec5'; }}
                  />
                </div>

                {/* Save error */}
                {custSaveError && (
                  <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#c53030', fontWeight: 600 }}>
                    {custSaveError}
                  </div>
                )}

                {/* Save button */}
                <div>
                  <button
                    onClick={handleSaveNewCustomer}
                    disabled={savingCust}
                    style={{
                      display: 'block', width: '100%',
                      padding: '13px 0',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 900,
                      cursor: savingCust ? 'not-allowed' : 'pointer',
                      border: 'none',
                      background: newCust.customer_name.trim() ? NAVY : '#d1d9e0',
                      color: newCust.customer_name.trim() ? 'white' : '#8a9ab0',
                      transition: 'all 0.2s',
                    }}
                  >
                    {savingCust
                      ? (isZh ? '保存中…' : 'Saving…')
                      : (isZh ? '保存并选择此客户' : 'Save and Select Customer')}
                  </button>
                  {!newCust.customer_name.trim() && (
                    <p style={{ textAlign: 'center', fontSize: 12, color: '#8a9ab0', marginTop: 6 }}>
                      {isZh ? '请先填写客户名称' : 'Please enter a client name first'}
                    </p>
                  )}
                </div>
              </div>
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
            <div className="mt-3 rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${GOLD}60` }}>
              <div style={{ background: `${GOLD}18`, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {isZh ? '已选客户' : 'Selected Client'}
                </span>
                {selectedCustomer.customer_number && (
                  <span style={{ fontSize: 11, color: '#8a9ab0', fontFamily: 'monospace' }}>{selectedCustomer.customer_number}</span>
                )}
              </div>
              <div style={{ padding: '12px 14px', background: '#fdfcfa' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 4 }}>{selectedCustomer.customer_name}</div>
                {selectedCustomer.company_name && (
                  <div style={{ fontSize: 13, color: '#3d4f6b', marginBottom: 6 }}>{selectedCustomer.company_name}</div>
                )}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#5a6a82' }}>
                  {selectedCustomer.contact_name && <span>👤 {selectedCustomer.contact_name}</span>}
                  {selectedCustomer.whatsapp && <span>📱 {selectedCustomer.whatsapp}</span>}
                  {selectedCustomer.email && <span>✉ {selectedCustomer.email}</span>}
                  {selectedCustomer.country && <span>🌍 {selectedCustomer.country}</span>}
                </div>
                {selectedCustomer.requirement_summary && (
                  <div style={{ fontSize: 13, color: '#5a6a82', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e0d0' }}>
                    {selectedCustomer.requirement_summary}
                  </div>
                )}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e8e0d0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={{ fontSize: 11, fontWeight: 700, color: GOLD, border: `1px solid ${GOLD}50`, background: `${GOLD}10`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
                    onClick={() => onGoToCustomerFiles && onGoToCustomerFiles(selectedCustomer)}
                  >
                    📎 {isZh ? '客户文件' : 'Client Files'}
                  </button>
                  <button
                    style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
                    onClick={() => onGoToCustomerProfile && onGoToCustomerProfile(selectedCustomer)}
                  >
                    👤 {isZh ? '查看档案' : 'View Profile'}
                  </button>
                  <button
                    style={{ fontSize: 11, color: '#8a9ab0', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', marginLeft: 'auto' }}
                    onClick={() => { setSelectedCustomer(null); setCustSearch(''); }}
                  >
                    {isZh ? '更换客户' : 'Change'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Card 2: Service Selection ───────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[24px] shadow-sm" style={{ border: '1px solid #e8e0d0' }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>
            {isZh ? '2. 选择服务' : '2. Service Selection'}
          </label>

          {/* Search */}
          <input
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-3"
            style={{ borderColor: '#cbd5e1' }}
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
                {isZh ? cat.name_cn : (cat.name_en || cat.name_cn)}
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
              const name = isZh ? svc.name_cn : (svc.name_en || svc.name_cn);
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
          <div className="bg-white p-7 rounded-[24px] shadow-sm" style={{ border: `1px solid ${GOLD}50` }}>
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
                    onClick={() => items.length > 1 && setExpandedItemId(expandedItemId === it.id ? null : it.id)}
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
                    {items.length > 1 && <span className="text-gray-300 text-[10px]">{expandedItemId === it.id ? '▲' : '▼'}</span>}
                  </div>

                  {/* Expanded editor */}
                  {(expandedItemId === it.id || items.length === 1) && (
                    <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-gray-100 bg-white">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={BS_LBL}>{isZh ? '服务名称' : 'Service Name'}</label>
                          <input style={BS_INP}
                            value={it.service_name} onChange={e => updateItem(it.id, { service_name: e.target.value })} />
                        </div>
                        <div>
                          <label style={BS_LBL}>{isZh ? '服务分类' : 'Category'}</label>
                          <input style={BS_INP}
                            value={it.category_name} onChange={e => updateItem(it.id, { category_name: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label style={BS_LBL}>{isZh ? '简要说明' : 'Description'}</label>
                        <textarea style={BS_TA}
                          rows={2} value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })} />
                      </div>
                      {/* Periodic billing mode */}
                      <div>
                        <label style={{ ...BS_LBL, color: GOLD }}>
                          {isZh ? '周期收费方式' : 'Billing Period Mode'}
                        </label>
                        <select
                          style={{ ...BS_SEL, color: NAVY, fontWeight: 600 }}
                          value={it.periodic_billing || 'auto'}
                          onChange={e => updateItem(it.id, { periodic_billing: e.target.value as PeriodicBilling })}
                        >
                          <option value="auto">{isZh ? '自动检测（根据费用字段）' : 'Auto-detect (from fee fields)'}</option>
                          <option value="monthly_only">{isZh ? '按月收费（月费 × 月数）' : 'Monthly only (fee × months)'}</option>
                          <option value="annual_only">{isZh ? '按年收费（年费一次）' : 'Annual only (annual fee)'}</option>
                          <option value="both">{isZh ? '月费 + 年费分别收取' : 'Monthly + Annual (separate)'}</option>
                          <option value="none">{isZh ? '不适用（仅一次性）' : 'N/A (one-time only)'}</option>
                        </select>
                      </div>

                      {/* Three fee inputs */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label style={BS_LBL}>{isZh ? '一次性费用' : 'One-time Fee'}</label>
                          <input type="number" style={{ ...BS_AMT, textAlign: 'right' as const }}
                            value={it.one_time_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { one_time_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label style={BS_LBL}>{isZh ? '月服务费' : 'Monthly Fee'}</label>
                          <input type="number" style={{ ...BS_AMT, textAlign: 'right' as const }}
                            value={it.monthly_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { monthly_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label style={{ ...BS_LBL, color: GOLD }}>
                            {isZh ? '年服务费' : 'Annual Fee'}
                          </label>
                          <input type="number" style={{ ...BS_AMT, textAlign: 'right' as const, border: `2px solid ${GOLD}` }}
                            value={it.annual_fee || ''} placeholder="0"
                            onChange={e => updateItem(it.id, { annual_fee: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label style={BS_LBL}>{isZh ? '数量' : 'Qty'}</label>
                          <input type="number" min="1" style={{ ...BS_INP, textAlign: 'center' as const }}
                            value={it.quantity} onChange={e => updateItem(it.id, { quantity: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label style={BS_LBL}>{isZh ? '月数' : 'Months'}</label>
                          <input type="number" min="1" style={{ ...BS_INP, textAlign: 'center' as const }}
                            value={it.months} onChange={e => updateItem(it.id, { months: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label style={BS_LBL}>{isZh ? '交付周期' : 'Timeline'}</label>
                          <input style={BS_INP}
                            value={it.timeline} placeholder={isZh ? '如: 2-4周' : 'e.g. 2-4 wks'}
                            onChange={e => updateItem(it.id, { timeline: e.target.value })} />
                        </div>
                      </div>
                      {/* 补充服务条款 — 默认收起 */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedTermsId(expandedTermsId === it.id ? null : it.id)}
                          className="flex items-center gap-1.5 text-xs font-bold"
                          style={{ color: expandedTermsId === it.id ? GOLD : '#64748B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <span>{expandedTermsId === it.id ? '▲' : '▶'}</span>
                          {isZh ? '补充服务条款（选填）' : 'Additional Terms (optional)'}
                        </button>
                        {expandedTermsId === it.id && (
                          <div className="mt-2 space-y-2.5 pl-3" style={{ borderLeft: `2px solid ${GOLD}40` }}>
                            <div>
                              <label style={BS_LBL}>{isZh ? '服务范围' : 'Scope of Work'}</label>
                              <textarea style={BS_TA}
                                rows={2} value={it.scope} onChange={e => updateItem(it.id, { scope: e.target.value })} />
                            </div>
                            <div>
                              <label style={BS_LBL}>{isZh ? '交付内容' : 'Deliverables'}</label>
                              <textarea style={BS_TA}
                                rows={2} value={it.deliverables} onChange={e => updateItem(it.id, { deliverables: e.target.value })} />
                            </div>
                            <div>
                              <label style={BS_LBL}>{isZh ? '不包含事项' : 'Exclusions'}</label>
                              <textarea style={BS_TA}
                                rows={1} value={it.item_exclusions} onChange={e => updateItem(it.id, { item_exclusions: e.target.value })} />
                            </div>
                          </div>
                        )}
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
                  <span>{isZh ? `月服务费（共 × 月）` : 'Monthly Period Cost'}</span>
                  <span className="font-medium font-mono">{fmt(totals.subtotalMonthly, currency)}</span>
                </div>
              )}
              {totals.subtotalAnnual > 0 && (
                <div className="flex justify-between" style={{ color: GOLD }}>
                  <span className="font-semibold">{isZh ? '年服务费小计' : 'Annual Fee Subtotal'}</span>
                  <span className="font-bold font-mono">{fmt(totals.subtotalAnnual, currency)}</span>
                </div>
              )}

              {/* Discount row */}
              <div className="flex items-center gap-2 pt-1 pb-1">
                <select
                  className="border rounded-lg px-2 py-1 text-xs outline-none"
                  style={{ borderColor: '#94a3b8', color: '#0F172A', fontWeight: 600 }}
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
                    style={{ borderColor: '#94a3b8', color: '#0F172A', fontWeight: 600 }}
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

              {/* VAT row */}
              <div className="flex items-center gap-2 pb-1">
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#0B1F44' }}>{isZh ? 'VAT 税率 %' : 'VAT Rate %'}</span>
                <input
                  type="number" min="0" max="100" step="1"
                  className="w-20 border rounded-lg px-2 py-1 text-xs outline-none text-right"
                  style={{ borderColor: '#94a3b8', color: '#0F172A', fontWeight: 600 }}
                  value={vatRate > 0 ? vatRate * 100 : ''}
                  placeholder="0"
                  onChange={e => setVatRate((parseFloat(e.target.value) || 0) / 100)}
                />
                {totals.vatAmount > 0 && (
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#0B1F44' }}>
                    +{fmt(totals.vatAmount, currency)}
                  </span>
                )}
              </div>

              <div className="flex justify-between font-black pt-2 border-t-2" style={{ color: NAVY, borderColor: NAVY }}>
                <span className="text-sm">{isZh ? '首年合同价值' : 'First Year Value'}</span>
                <span className="text-base font-mono">{fmt(totals.firstYearValue, currency)}</span>
              </div>
            </div>

            {/* Commercial terms */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
              <p className="text-[12px] font-black uppercase tracking-widest" style={{ color: '#0B1F44' }}>
                {isZh ? '商务条款' : 'Commercial Terms'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={BS_LBL}>{isZh ? '币种' : 'Currency'}</label>
                  <select style={BS_SEL}
                    value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
                <div>
                  <label style={BS_LBL}>{isZh ? '有效期至' : 'Valid Until'}</label>
                  <input type="date" style={BS_INP}
                    value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={BS_LBL}>{isZh ? '付款方式' : 'Payment Terms'}</label>
                <input style={BS_INP}
                  value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                  placeholder={isZh ? '如: 50% 预付，完成后付 50%' : 'e.g. 50% upfront, 50% on completion'} />
              </div>
              <div>
                <label style={BS_LBL}>{isZh ? '项目总周期' : 'Project Timeline'}</label>
                <input style={BS_INP}
                  value={deliveryPeriod} onChange={e => setDeliveryPeriod(e.target.value)}
                  placeholder={isZh ? '如: 60 个工作日' : 'e.g. 60 business days'} />
              </div>
              <div>
                <label style={BS_LBL}>{isZh ? '总体不包含事项' : 'Exclusions'}</label>
                <textarea style={BS_TA}
                  rows={2} value={quoteExclusions} onChange={e => setQuoteExclusions(e.target.value)} />
              </div>
              <div>
                <label style={BS_LBL}>{isZh ? '总体备注' : 'Notes'}</label>
                <textarea style={BS_TA}
                  rows={2} value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── Card 4: Save ────────────────────────────────────────────────── */}
        <div className="bg-white p-7 rounded-[24px] shadow-sm" style={{ border: '1px solid #e8e0d0' }}>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-4" style={{ color: GOLD }}>
            {isZh ? '4. 保存报价' : '4. Save Quote'}
          </label>
          <div className="space-y-3">
            <div>
              <label style={BS_LBL}>{isZh ? '报价标题' : 'Quote Title'}</label>
              <input
                style={BS_INP}
                value={quoteTitle}
                onChange={e => setQuoteTitle(e.target.value)}
                placeholder={selectedCustomer
                  ? `${selectedCustomer.customer_name} - ${isZh ? '服务报价' : 'Service Quote'}`
                  : (isZh ? '报价标题' : 'Quote title')}
              />
            </div>
            <div>
              <label style={BS_LBL}>{isZh ? '负责人' : 'Owner'}</label>
              <input
                style={BS_INP}
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
                className="flex-1 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-40"
                style={{ background: GOLD, color: NAVY }}
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
          vatRate={vatRate}
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
  vatRate?: number;
}

function BSQuotePreviewPanel(p: PreviewProps) {
  const isZh = p.lang === 'zh';

  // warm palette
  const WARM_BG   = '#faf8f5';   // warm near-white
  const DIVIDER   = '#e8e0d0';   // warm tan divider
  const LABEL_CLR = '#8a7f72';   // warm muted label
  const TEXT_DK   = '#1a2540';   // deep navy-blue body text
  const TEXT_MD   = '#4a5568';   // mid body

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 4px 24px rgba(12,27,58,0.10)',
        border: `1px solid ${DIVIDER}`,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* ── TOP ACCENT LINE ─────────────────────────────────────────── */}
      <div style={{ height: 5, background: `linear-gradient(90deg, ${NAVY} 0%, ${GOLD} 100%)` }} />

      {/* ── LETTERHEAD HEADER ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '28px 36px 22px', borderBottom: `1px solid ${DIVIDER}` }}>
        {/* Left: company identity */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 4 }}>
            GCI
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.3 }}>
            GLOBALCARE INFO<br />GENERAL TRADING FZCO
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: LABEL_CLR, lineHeight: 1.7 }}>
            Dubai, UAE<br />
            TEL: +971 58 556 6809<br />
            chris@globalcareinfo.com
          </div>
        </div>

        {/* Right: document type + meta */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: NAVY, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            {isZh ? '服务报价单' : 'SERVICE QUOTATION'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 5, fontSize: 13 }}>
            <span style={{ color: LABEL_CLR, textAlign: 'right' }}>{isZh ? '报价编号' : 'Quote No.'}</span>
            <span style={{ fontWeight: 700, color: TEXT_DK, fontFamily: 'monospace' }}>{p.quoteNo}</span>
            <span style={{ color: LABEL_CLR, textAlign: 'right' }}>{isZh ? '报价日期' : 'Date'}</span>
            <span style={{ fontWeight: 700, color: TEXT_DK }}>{p.quoteDate}</span>
            {p.validUntil && <>
              <span style={{ color: LABEL_CLR, textAlign: 'right' }}>{isZh ? '有效期至' : 'Valid Until'}</span>
              <span style={{ fontWeight: 700, color: TEXT_DK }}>{p.validUntil}</span>
            </>}
            <span style={{ color: LABEL_CLR, textAlign: 'right' }}>{isZh ? '币种' : 'Currency'}</span>
            <span style={{ fontWeight: 700, color: GOLD }}>{p.currency}</span>
          </div>
        </div>
      </div>

      {/* ── CLIENT INFO ─────────────────────────────────────────────── */}
      <div style={{ background: WARM_BG, padding: '18px 36px', borderBottom: `1px solid ${DIVIDER}` }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 10 }}>
          {isZh ? '客户信息' : 'CLIENT INFORMATION'}
        </div>
        {p.customer ? (
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: NAVY, marginBottom: 4 }}>{p.customer.customer_name}</div>
            {p.customer.company_name && (
              <div style={{ fontSize: 14, color: TEXT_MD, marginBottom: 6, fontWeight: 600 }}>{p.customer.company_name}</div>
            )}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: TEXT_MD }}>
              {p.customer.contact_name && <span>👤 {p.customer.contact_name}</span>}
              {p.customer.whatsapp && <span>📱 {p.customer.whatsapp}</span>}
              {p.customer.email && <span>✉ {p.customer.email}</span>}
              {p.customer.country && <span>🌍 {p.customer.country}</span>}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: '#94a3b8', fontStyle: 'italic' }}>
            {isZh ? '← 请在左侧选择或新增服务客户' : '← Please select or add a service client on the left'}
          </div>
        )}
      </div>

      {/* ── SUBJECT LINE ────────────────────────────────────────────── */}
      {p.quoteTitle && (
        <div style={{ padding: '12px 36px', borderBottom: `1px solid ${DIVIDER}`, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: LABEL_CLR, textTransform: 'uppercase', letterSpacing: '0.12em', flexShrink: 0 }}>
            {isZh ? '主题' : 'SUBJECT'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_DK }}>{p.quoteTitle}</span>
        </div>
      )}

      {/* ── SERVICE TABLE ───────────────────────────────────────────── */}
      <div style={{ padding: '22px 36px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 14 }}>
          {isZh ? '服务项目明细' : 'SERVICE ITEMS'}
        </div>
        {p.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: '#ccc', fontStyle: 'italic' }}>
            {isZh ? '从左侧选择服务项目…' : 'Select service items on the left…'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                <th style={{ textAlign: 'center', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em', width: 28 }}>#</th>
                <th style={{ textAlign: 'left', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {isZh ? '服务内容' : 'Service'}
                </th>
                <th style={{ textAlign: 'center', paddingBottom: 10, paddingRight: 4, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em', width: 36 }}>
                  {isZh ? '数量' : 'Qty'}
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 4, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em', width: 82 }}>
                  {isZh ? '一次性' : 'One-time'}
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 4, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em', width: 75 }}>
                  {isZh ? '月费' : 'Monthly'}
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 4, fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', width: 75 }}>
                  {isZh ? '年服务费' : 'Annual'}
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 10, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.04em', width: 80 }}>
                  {isZh ? '小计' : 'Subtotal'}
                </th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((it, i) => {
                const lt = calcLineTotal(it);
                const subDisplay = lt > 0 ? fmt(lt, p.currency) : (isZh ? '待定' : 'TBD');
                const rowBg = i % 2 === 1 ? WARM_BG : 'transparent';
                return (
                  <tr key={it.id} style={{ background: rowBg, borderBottom: `1px solid ${DIVIDER}` }}>
                    <td style={{ padding: '11px 6px 11px 2px', textAlign: 'center', fontSize: 11, color: LABEL_CLR, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '11px 6px 11px 0', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: TEXT_DK, fontSize: 13 }}>{it.service_name}</div>
                      {it.category_name && <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginTop: 2 }}>{it.category_name}</div>}
                      {it.description && <div style={{ fontSize: 12, color: TEXT_MD, marginTop: 3, lineHeight: 1.5 }}>{it.description}</div>}
                      {it.timeline && <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginTop: 3 }}>{isZh ? '周期: ' : 'Timeline: '}{it.timeline}</div>}
                      {it.is_optional && <div style={{ fontSize: 11, color: '#9f7aea', fontWeight: 700, marginTop: 2 }}>{isZh ? '（可选）' : '(Optional)'}</div>}
                    </td>
                    <td style={{ padding: '11px 4px', textAlign: 'center', color: TEXT_MD, fontWeight: 600, fontSize: 12 }}>{it.quantity}</td>
                    <td style={{ padding: '11px 4px', textAlign: 'right', color: TEXT_MD, fontFamily: 'monospace', fontSize: 12 }}>
                      {it.one_time_fee > 0 ? fmt(it.one_time_fee, p.currency) : '—'}
                    </td>
                    <td style={{ padding: '11px 4px', textAlign: 'right', color: TEXT_MD, fontFamily: 'monospace', fontSize: 12 }}>
                      {it.monthly_fee > 0 ? fmt(it.monthly_fee, p.currency) : '—'}
                    </td>
                    <td style={{ padding: '11px 4px', textAlign: 'right', color: GOLD, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                      {it.annual_fee > 0 ? fmt(it.annual_fee, p.currency) : '—'}
                    </td>
                    <td style={{ padding: '11px 0 11px 4px', textAlign: 'right', fontWeight: 800, color: NAVY, fontFamily: 'monospace', fontSize: 13 }}>
                      {subDisplay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── FEE SUMMARY ─────────────────────────────────────────────── */}
      {p.items.length > 0 && (
        <div style={{ padding: '16px 36px 24px', borderTop: `1px solid ${DIVIDER}` }}>
          <div style={{ marginLeft: 'auto', maxWidth: 340, borderRadius: 14, border: `1px solid ${DIVIDER}`, background: WARM_BG, padding: '18px 22px' }}>
            {p.totals.subtotalOneTime > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: TEXT_MD }}>
                <span>{isZh ? '一次性费用小计' : 'One-time Subtotal'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(p.totals.subtotalOneTime, p.currency)}</span>
              </div>
            )}
            {p.totals.subtotalMonthly > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: TEXT_MD }}>
                <span>{isZh ? '月服务费（周期）' : 'Monthly Period Cost'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(p.totals.subtotalMonthly, p.currency)}</span>
              </div>
            )}
            {p.totals.subtotalAnnual > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: GOLD }}>
                <span style={{ fontWeight: 700 }}>{isZh ? '年服务费小计' : 'Annual Fee Subtotal'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(p.totals.subtotalAnnual, p.currency)}</span>
              </div>
            )}
            {p.totals.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#e53e3e' }}>
                <span>{isZh ? '折扣' : 'Discount'}{p.discountType === 'percent' ? ` (${p.discountValue}%)` : ''}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>-{fmt(p.totals.discountAmount, p.currency)}</span>
              </div>
            )}
            {(p.vatRate || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: TEXT_MD }}>
                <span>{isZh ? `VAT (${((p.vatRate||0)*100).toFixed(0)}%)` : `VAT (${((p.vatRate||0)*100).toFixed(0)}%)`}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>+{fmt(p.totals.vatAmount, p.currency)}</span>
              </div>
            )}
            {/* First Year Value */}
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: `2px solid ${NAVY}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isZh ? '首年合同价值' : 'FIRST YEAR VALUE'}
              </span>
              <span style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: 'monospace' }}>
                {fmt(p.totals.firstYearValue, p.currency)}
              </span>
            </div>
            {p.totals.monthlyRate > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: LABEL_CLR }}>
                <span>{isZh ? '每月持续费用' : 'Monthly Recurring'}</span>
                <span style={{ fontFamily: 'monospace' }}>{fmt(p.totals.monthlyRate, p.currency)}/{isZh ? '月' : 'mo'}</span>
              </div>
            )}
            {p.totals.annualRate > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4, color: GOLD }}>
                <span>{isZh ? '每年续费' : 'Annual Recurring'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(p.totals.annualRate, p.currency)}/{isZh ? '年' : 'yr'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMMERCIAL TERMS ────────────────────────────────────────── */}
      {(p.paymentTerms || p.deliveryPeriod || p.exclusions || p.notes) && (
        <div style={{ padding: '20px 36px 24px', borderTop: `1px solid ${DIVIDER}`, background: WARM_BG }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 14 }}>
            {isZh ? '商务条款' : 'COMMERCIAL TERMS'}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {p.paymentTerms && (
              <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: NAVY, minWidth: 80, flexShrink: 0 }}>{isZh ? '付款方式' : 'Payment'}</span>
                <span style={{ color: TEXT_MD }}>{p.paymentTerms}</span>
              </div>
            )}
            {p.deliveryPeriod && (
              <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: NAVY, minWidth: 80, flexShrink: 0 }}>{isZh ? '项目周期' : 'Timeline'}</span>
                <span style={{ color: TEXT_MD }}>{p.deliveryPeriod}</span>
              </div>
            )}
            {p.exclusions && (
              <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: NAVY, minWidth: 80, flexShrink: 0 }}>{isZh ? '不包含' : 'Exclusions'}</span>
                <span style={{ color: TEXT_MD }}>{p.exclusions}</span>
              </div>
            )}
            {p.notes && (
              <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: NAVY, minWidth: 80, flexShrink: 0 }}>{isZh ? '备注' : 'Notes'}</span>
                <span style={{ color: TEXT_MD }}>{p.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 36px', borderTop: `1px solid ${DIVIDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: LABEL_CLR, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          GLOBALCARE INFO GENERAL TRADING FZCO · DUBAI · UAE
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em' }}>GCI PLATFORM</div>
      </div>
    </div>
  );
}
