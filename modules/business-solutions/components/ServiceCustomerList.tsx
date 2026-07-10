import React, { useState, useMemo } from 'react';
import type { ServiceCustomer, BSLang, ServiceCustomerStatus, ServiceCustomerType } from '../types';
import { useT } from '../translations';

interface Props {
  lang: BSLang;
  customers: ServiceCustomer[];
  loading: boolean;
  onView: (c: ServiceCustomer) => void;
  onEdit: (c: ServiceCustomer) => void;
  onNewQuote: (c: ServiceCustomer) => void;
  onAddCustomer: () => void;
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

const PRIORITY_COLOR = { A: 'text-red-600 font-bold', B: 'text-blue-600', C: 'text-gray-400' };

export function ServiceCustomerList({ lang, customers, loading, onView, onEdit, onNewQuote, onAddCustomer }: Props) {
  const t = useT(lang);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    if (filterType) list = list.filter(c => c.primary_service_type === filterType);
    return list;
  }, [customers, search, filterStatus, filterType]);

  const statusList = Array.from(new Set(customers.map(c => c.status).filter(Boolean)));
  const typeList = Array.from(new Set(customers.map(c => c.primary_service_type).filter(Boolean)));

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm">{t.labels.loading}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex gap-2 p-3 border-b border-gray-100 flex-shrink-0 flex-wrap">
        <input
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-blue-400"
          placeholder={t.buttons.search + '…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">{t.buttons.allStatuses}</option>
          {statusList.map(s => <option key={s} value={s!}>{t.customerStatus[s!] || s}</option>)}
        </select>
        <select
          className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">{t.buttons.allTypes}</option>
          {typeList.map(s => <option key={s} value={s!}>{t.customerTypes[s!] || s}</option>)}
        </select>
        <div className="flex-1" />
        <button
          onClick={onAddCustomer}
          className="bg-[#0c1b3a] text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-[#1a3060]"
        >
          + {t.buttons.addCustomer}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {search || filterStatus || filterType ? t.empty.searchEmpty : t.empty.customers}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-3 py-2 text-xs text-gray-500 font-medium w-8">{t.fields.priority}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.customerName}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.serviceType}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.status}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.owner}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.followUpDate}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => onView(c)}>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-bold ${PRIORITY_COLOR[c.priority || 'B']}`}>{c.priority || 'B'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{c.customer_name}</div>
                    {c.company_name && <div className="text-xs text-gray-400">{c.company_name}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {c.primary_service_type ? (t.customerTypes[c.primary_service_type] || c.primary_service_type) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status || ''] || 'bg-gray-100 text-gray-500'}`}>
                      {c.status ? (t.customerStatus[c.status] || c.status) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{c.owner || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{c.follow_up_date || '—'}</td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(c)} className="text-xs text-blue-600 hover:underline px-1">{t.buttons.editCustomer}</button>
                      <button
                        onClick={() => onNewQuote(c)}
                        className="text-xs text-[#c9a84c] hover:underline px-1 font-medium"
                      >
                        {t.buttons.newQuoteForCustomer}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
