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

const PRIORITY_DOT: Record<string, string> = {
  A: 'bg-red-500',
  B: 'bg-blue-400',
  C: 'bg-gray-300',
};

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

export function ServiceCustomerList({
  lang, customers, loading, onView, onEdit, onNewQuote, onAddCustomer,
}: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';

  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]   = useState('');
  const [filterOwner, setFilterOwner] = useState('');

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total    = customers.length;
    const active   = customers.filter(c => ['NEW_REQUIREMENT','REQUIREMENT_CONFIRMING','SOLUTION_PREPARING','SOLUTION_SENT'].includes(c.status || '')).length;
    const quoted   = customers.filter(c => c.status === 'QUOTED' || c.status === 'CONTRACT_PENDING').length;
    const ongoing  = customers.filter(c => c.status === 'IN_PROGRESS' || c.status === 'MONTHLY_SERVICE').length;
    return { total, active, quoted, ongoing };
  }, [customers]);

  // ── Filter ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        (c.company_name  || '').toLowerCase().includes(q) ||
        (c.contact_name  || '').toLowerCase().includes(q) ||
        (c.customer_number || '').toLowerCase().includes(q),
      );
    }
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    if (filterType)   list = list.filter(c => c.primary_service_type === filterType);
    if (filterOwner)  list = list.filter(c => c.owner === filterOwner);
    return list;
  }, [customers, search, filterStatus, filterType, filterOwner]);

  const statusList = useMemo(() => Array.from(new Set(customers.map(c => c.status).filter(Boolean))), [customers]);
  const typeList   = useMemo(() => Array.from(new Set(customers.map(c => c.primary_service_type).filter(Boolean))), [customers]);
  const ownerList  = useMemo(() => Array.from(new Set(customers.map(c => c.owner).filter(Boolean))), [customers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        {t.labels.loading}
      </div>
    );
  }

  return (
    <div className="flex flex-col">

      {/* ── Stats dashboard ──────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black" style={{ color: NAVY }}>
            {isZh ? '服务客户库' : 'Service Client Base'}
          </h2>
          <button
            onClick={onAddCustomer}
            className="flex-shrink-0 text-sm font-black px-4 py-2 rounded-xl text-white"
            style={{ background: NAVY }}
          >
            + {t.buttons.addCustomer}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl p-3 text-center" style={{ background: `${NAVY}08`, border: `1px solid ${NAVY}15` }}>
            <div className="text-2xl font-black" style={{ color: NAVY }}>{stats.total}</div>
            <div className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">{isZh ? '服务客户总数' : 'Total Clients'}</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <div className="text-2xl font-black text-blue-600">{stats.active}</div>
            <div className="text-[10px] text-blue-500 font-bold uppercase mt-0.5">{isZh ? '待跟进' : 'Follow-up'}</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <div className="text-2xl font-black text-orange-600">{stats.quoted}</div>
            <div className="text-[10px] text-orange-500 font-bold uppercase mt-0.5">{isZh ? '已报价' : 'Quoted'}</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <div className="text-2xl font-black text-green-600">{stats.ongoing}</div>
            <div className="text-[10px] text-green-500 font-bold uppercase mt-0.5">{isZh ? '执行中' : 'In Progress'}</div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
          style={{ width: 180 }}
          placeholder={`${t.buttons.search}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">{t.buttons.allStatuses}</option>
          {statusList.map(s => (
            <option key={s} value={s!}>{t.customerStatus[s!] || s}</option>
          ))}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">{t.buttons.allTypes}</option>
          {typeList.map(s => (
            <option key={s} value={s!}>{t.customerTypes[s!] || s}</option>
          ))}
        </select>
        {ownerList.length > 0 && (
          <select
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
          >
            <option value="">{isZh ? '全部负责人' : 'All Owners'}</option>
            {ownerList.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        )}
        {(search || filterStatus || filterType || filterOwner) && (
          <button
            className="text-xs text-gray-400 hover:text-gray-700 underline"
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterOwner(''); }}
          >
            {isZh ? '清除筛选' : 'Clear'}
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} / {customers.length}
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <p className="text-gray-400 text-sm">
            {search || filterStatus || filterType || filterOwner
              ? t.empty.searchEmpty
              : t.empty.customers}
          </p>
          {!search && !filterStatus && !filterType && !filterOwner && (
            <button
              onClick={onAddCustomer}
              className="text-white text-sm font-black px-5 py-2.5 rounded-xl"
              style={{ background: NAVY }}
            >
              + {isZh ? '新增第一位服务客户' : 'Add First Service Client'}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-2.5 text-xs text-gray-500 font-bold w-8"></th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.customerName}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.companyName}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.country}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.serviceType}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.requirementSummary}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.status}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.owner}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold">{t.fields.followUpDate}</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 font-bold w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onView(c)}
                >
                  {/* Priority dot */}
                  <td className="px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full mx-auto ${PRIORITY_DOT[c.priority || 'B'] || 'bg-gray-300'}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{c.customer_name}</div>
                    {c.customer_number && (
                      <div className="text-[10px] text-gray-400 font-mono">{c.customer_number}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{c.company_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{c.country || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {c.primary_service_type ? (t.customerTypes[c.primary_service_type] || c.primary_service_type) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[160px]">
                    <div className="truncate">{c.requirement_summary || '—'}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status || ''] || 'bg-gray-100 text-gray-500'}`}>
                      {c.status ? (t.customerStatus[c.status] || c.status) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{c.owner || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{c.follow_up_date || '—'}</td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onEdit(c)}
                        className="text-xs text-blue-600 hover:underline px-1"
                      >
                        {t.buttons.editCustomer}
                      </button>
                      <button
                        onClick={() => onNewQuote(c)}
                        className="text-xs font-medium hover:underline px-1"
                        style={{ color: GOLD }}
                      >
                        {t.buttons.newQuoteForCustomer}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
