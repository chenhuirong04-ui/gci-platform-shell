import React, { useState } from 'react';
import type { ServiceCustomer, ServiceQuote, BSLang } from '../types';
import { useT } from '../translations';
import { fmt } from '../lib/bsCalculations';
import { CustomerDocumentManager } from './CustomerDocumentManager';
import { ComplianceItemManager } from './ComplianceItemManager';
import { PersonManager } from './PersonManager';

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
  REQUIREMENT_CONFIRMING: 'bg-purple-100 text-purple-700',
  SOLUTION_PREPARING: 'bg-yellow-100 text-yellow-700',
  SOLUTION_SENT: 'bg-indigo-100 text-indigo-700',
  QUOTED: 'bg-orange-100 text-orange-700',
  CONTRACT_PENDING: 'bg-pink-100 text-pink-700',
  IN_PROGRESS: 'bg-green-100 text-green-700',
  MONTHLY_SERVICE: 'bg-teal-100 text-teal-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-gray-200 text-gray-600',
  LOST: 'bg-red-100 text-red-400',
};

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

type DetailTab = 'info' | 'service' | 'quotes' | 'documents' | 'compliance' | 'persons' | 'followup';

export function ServiceCustomerDetail({
  lang, customer, quotes, onEdit, onNewQuote, onViewQuote, onClose,
}: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  // Bridge: compliance prefill from document upload (manual flow only)
  const [compliancePrefill, setCompliancePrefill] = useState<
    { documentId: string; documentType: string; documentName: string; parsed?: Record<string, unknown> } | undefined
  >();
  const [complianceReloadKey, setComplianceReloadKey] = useState(0);
  const [complianceSavedMsg, setComplianceSavedMsg] = useState<string | null>(null);

  // Bridge: persons prefill from document upload
  const [personPrefill, setPersonPrefill] = useState<{
    documentId: string; documentType: string; documentName: string; parsed: Record<string, unknown>;
  } | null>(null);

  const handlePersonTrigger = (info: { documentId: string; documentType: string; documentName: string; parsed: Record<string, unknown> }) => {
    setPersonPrefill(info);
    setActiveTab('persons');
  };

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'info',       label: isZh ? '基本资料' : 'Info' },
    { key: 'service',    label: isZh ? '服务需求' : 'Requirements' },
    { key: 'quotes',     label: isZh ? '报价记录' : 'Quotes' },
    { key: 'documents',  label: isZh ? '客户文件' : 'Files' },
    { key: 'compliance', label: isZh ? '证照合规' : 'Compliance' },
    { key: 'persons',   label: isZh ? '公司人员' : 'Persons' },
    { key: 'followup',   label: isZh ? '跟进记录' : 'Follow-up' },
  ];

  const row = (label: string, val: React.ReactNode) => (
    <div key={label} className="flex gap-2 py-2 border-b border-gray-50 text-sm">
      <span className="text-gray-400 w-28 flex-shrink-0 text-xs pt-0.5">{label}</span>
      <span className="text-gray-800 flex-1">{val || '—'}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100" style={{ background: NAVY }}>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold truncate">{customer.customer_name}</div>
          {customer.company_name && <div className="text-blue-200 text-xs truncate">{customer.company_name}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[customer.status || ''] || 'bg-gray-100 text-gray-500'}`}>
          {customer.status ? (t.customerStatus[customer.status] || customer.status) : '—'}
        </span>
        <button onClick={onEdit} className="text-xs font-bold hover:underline flex-shrink-0" style={{ color: GOLD }}>
          {t.buttons.editCustomer}
        </button>
        <button onClick={onClose} className="text-gray-300 hover:text-white text-xl leading-none flex-shrink-0">×</button>
      </div>

      {/* Tab bar — scrollable */}
      <div className="flex border-b border-gray-100 overflow-x-auto" style={{ background: '#fafafa' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-all flex-shrink-0"
            style={{
              color: activeTab === tab.key ? GOLD : '#9ca3af',
              borderBottom: activeTab === tab.key ? `2px solid ${GOLD}` : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.key === 'quotes' && quotes.length > 0 && (
              <span className="ml-1 text-[10px] text-gray-400">({quotes.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">

        {/* ── 1. 基本资料 ── */}
        {activeTab === 'info' && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              {isZh ? '联系方式' : 'Contact'}
            </div>
            {row(t.fields.customerNumber, customer.customer_number)}
            {row(t.fields.contactName, customer.contact_name)}
            {row(t.fields.whatsapp, customer.whatsapp)}
            {row(t.fields.email, customer.email)}
            {row(t.fields.country, [customer.city, customer.country].filter(Boolean).join(', '))}

            <div className="text-[10px] font-black uppercase tracking-widest mt-5 mb-3" style={{ color: GOLD }}>
              {isZh ? '账户信息' : 'Account'}
            </div>
            {row(t.fields.priority, customer.priority ? t.priority[customer.priority] : null)}
            {row(t.fields.owner, customer.owner)}
            {row(t.fields.followUpDate, customer.follow_up_date)}
            {row(t.fields.nextAction, customer.next_action)}
            {customer.notes && row(t.fields.notes, customer.notes)}
          </div>
        )}

        {/* ── 2. 服务需求 ── */}
        {activeTab === 'service' && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              {isZh ? '服务需求' : 'Service Requirements'}
            </div>
            {row(t.fields.serviceType, customer.primary_service_type ? t.customerTypes[customer.primary_service_type] : null)}
            {row(isZh ? '服务标签' : 'Service Tags',
              customer.service_tags?.length ? (customer.service_tags as string[]).join(', ') : null)}
            {row(t.fields.requirementSummary, customer.requirement_summary)}
            {row(isZh ? '需求详情' : 'Requirement Details', customer.requirement_details)}
            {row(t.fields.budgetRange, customer.budget_range)}
            {row(isZh ? '期望开始日期' : 'Expected Start', customer.expected_start_date)}
            {row(isZh ? '月服务' : 'Monthly Service',
              customer.requires_monthly_service ? (isZh ? '是' : 'Yes') : (isZh ? '否' : 'No'))}
          </div>
        )}

        {/* ── 3. 报价记录 ── */}
        {activeTab === 'quotes' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: GOLD }}>
                {t.labels.historyQuotes}
              </div>
              <button onClick={onNewQuote} className="text-xs font-bold hover:underline" style={{ color: GOLD }}>
                + {t.buttons.newQuoteForCustomer}
              </button>
            </div>
            {quotes.length === 0 ? (
              <div className="text-xs text-gray-400 py-8 text-center">{t.empty.quotes}</div>
            ) : (
              <div className="space-y-2">
                {quotes.map(q => (
                  <div key={q.id} onClick={() => onViewQuote(q)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <span className="font-mono text-xs text-gray-500 flex-shrink-0">{q.quote_no}</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{q.quotation_title || q.customer_name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{fmt(q.grand_total || q.total_amount || 0, q.currency)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      q.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                      q.status === 'SENT'     ? 'bg-blue-100 text-blue-600'  :
                      'bg-gray-100 text-gray-500'
                    }`}>{t.quoteStatus[q.status] || q.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 4. 客户文件 ── */}
        {activeTab === 'documents' && customer.id && (
          <CustomerDocumentManager
            customerId={customer.id}
            customerName={customer.customer_name}
            lang={lang}
            onCreateComplianceItem={() => {
              // Record already saved by CustomerDocumentManager — just reload list and show toast
              setComplianceReloadKey(k => k + 1);
              setComplianceSavedMsg(isZh ? '营业执照已保存' : 'Trade license saved');
              setActiveTab('compliance');
            }}
            onCreatePerson={({ documentId, documentType, documentName, parsed }) => {
              handlePersonTrigger({ documentId, documentType, documentName, parsed: parsed as Record<string, unknown> });
            }}
          />
        )}

        {/* ── 5. 证照合规 ── */}
        {activeTab === 'compliance' && customer.id && (
          <ComplianceItemManager
            customerId={customer.id}
            lang={lang}
            prefillFromDocument={compliancePrefill}
            onPrefillHandled={() => setCompliancePrefill(undefined)}
            reloadKey={complianceReloadKey}
            savedToast={complianceSavedMsg || undefined}
          />
        )}

        {/* ── 6. 公司人员 ── */}
        {activeTab === 'persons' && customer.id && (
          <PersonManager
            customerId={customer.id}
            lang={lang}
            prefillFromDocument={personPrefill}
            onPrefillHandled={() => setPersonPrefill(null)}
          />
        )}

        {/* ── 7. 跟进记录 ── */}
        {activeTab === 'followup' && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              {isZh ? '跟进记录' : 'Follow-up History'}
            </div>
            <div className="space-y-1">
              {row(t.fields.followUpDate, customer.follow_up_date)}
              {row(t.fields.nextAction, customer.next_action)}
              {row(isZh ? '最后跟进时间' : 'Last Follow-up', customer.last_follow_up_at
                ? new Date(customer.last_follow_up_at).toLocaleDateString()
                : null)}
              {row(t.fields.notes, customer.notes)}
            </div>
            <div className="mt-6 text-center">
              <button
                onClick={onEdit}
                className="text-sm font-bold px-5 py-2.5 rounded-xl text-white"
                style={{ background: NAVY }}
              >
                {isZh ? '编辑跟进记录' : 'Edit Follow-up'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
