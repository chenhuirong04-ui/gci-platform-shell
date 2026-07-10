import React, { useState } from 'react';
import type { ServiceCustomer, ServiceQuote, BSLang } from '../types';
import { useT } from '../translations';
import { fmt } from '../lib/bsCalculations';
import { CustomerDocumentManager } from './CustomerDocumentManager';

interface Props {
  lang: BSLang;
  customer: ServiceCustomer;
  quotes: ServiceQuote[];
  onEdit: () => void;
  onNewQuote: () => void;
  onViewQuote: (q: ServiceQuote) => void;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  NEW_REQUIREMENT: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-green-100 text-green-700',
  MONTHLY_SERVICE: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-gray-200 text-gray-600',
  LOST: 'bg-red-100 text-red-400',
};

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

type DetailTab = 'info' | 'documents' | 'quotes';

export function ServiceCustomerDetail({ lang, customer, quotes, onEdit, onNewQuote, onViewQuote, onClose }: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  const row = (label: string, val: React.ReactNode) => (
    <div key={label} className="flex gap-2 py-1.5 border-b border-gray-50 text-sm">
      <span className="text-gray-400 w-28 flex-shrink-0 text-xs pt-0.5">{label}</span>
      <span className="text-gray-800">{val || '—'}</span>
    </div>
  );

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'info',      label: isZh ? '基本信息' : 'Info' },
    { key: 'documents', label: isZh ? '客户文件' : 'Documents' },
    { key: 'quotes',    label: isZh ? '报价记录' : 'Quotes' },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100" style={{ background: NAVY }}>
        <div className="flex-1">
          <div className="text-white font-semibold">{customer.customer_name}</div>
          {customer.company_name && <div className="text-blue-200 text-xs">{customer.company_name}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[customer.status || ''] || 'bg-gray-100 text-gray-500'}`}>
          {customer.status ? (t.customerStatus[customer.status] || customer.status) : '—'}
        </span>
        <button onClick={onEdit} className="text-xs hover:underline" style={{ color: GOLD }}>{t.buttons.editCustomer}</button>
        <button onClick={onClose} className="text-gray-300 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100" style={{ background: '#fafafa' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-5 py-3 text-xs font-black uppercase tracking-wide transition-all"
            style={{
              color: activeTab === tab.key ? GOLD : '#9ca3af',
              borderBottom: activeTab === tab.key ? `2px solid ${GOLD}` : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* ── Info Tab ── */}
        {activeTab === 'info' && (
          <div className="space-y-1">
            {row(t.fields.customerNumber, customer.customer_number)}
            {row(t.fields.serviceType, customer.primary_service_type ? t.customerTypes[customer.primary_service_type] : null)}
            {row(t.fields.priority, customer.priority ? t.priority[customer.priority] : null)}
            {row(t.fields.owner, customer.owner)}
            {row(t.fields.contactName, customer.contact_name)}
            {row(t.fields.whatsapp, customer.whatsapp)}
            {row(t.fields.email, customer.email)}
            {row(t.fields.country, [customer.city, customer.country].filter(Boolean).join(', '))}
            {row(t.fields.requirementSummary, customer.requirement_summary)}
            {row(t.fields.budgetRange, customer.budget_range)}
            {row(t.fields.followUpDate, customer.follow_up_date)}
            {row(t.fields.nextAction, customer.next_action)}
            {row(t.fields.notes, customer.notes)}
          </div>
        )}

        {/* ── Documents Tab ── */}
        {activeTab === 'documents' && customer.id && (
          <CustomerDocumentManager
            customerId={customer.id}
            customerName={customer.customer_name}
            lang={lang}
          />
        )}

        {/* ── Quotes Tab ── */}
        {activeTab === 'quotes' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t.labels.historyQuotes}
              </span>
              <button onClick={onNewQuote} className="text-xs font-medium hover:underline" style={{ color: GOLD }}>
                + {t.buttons.newQuoteForCustomer}
              </button>
            </div>
            {quotes.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">{t.empty.quotes}</div>
            ) : (
              <div className="space-y-1.5">
                {quotes.map(q => (
                  <div
                    key={q.id}
                    onClick={() => onViewQuote(q)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer text-sm transition-colors"
                  >
                    <span className="font-mono text-xs text-gray-500 flex-shrink-0">{q.quote_no}</span>
                    <span className="text-gray-700 flex-1 truncate">{q.quotation_title || q.customer_name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{fmt(q.grand_total || q.total_amount || 0, q.currency)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      q.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                      q.status === 'SENT' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>{t.quoteStatus[q.status] || q.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
