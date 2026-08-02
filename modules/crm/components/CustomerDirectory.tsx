import React, { useMemo, useState } from 'react';
import { Search, Globe, User, ChevronRight } from 'lucide-react';
import type { FollowUpTask } from '../types';
import { getTaskBusinessId } from '../utils/businessId';

// ── Dark theme tokens (matches FollowUpQueue/ProjectProgress) ──────────
const CARD   = '#0F1E35';
const CARD2  = '#162A45';
const BORDER = 'rgba(255,255,255,0.09)';
const GOLD   = '#B8960C';
const GOLD_L = '#D4AF37';
const T1     = '#E8F0FF';
const T2     = '#7A9CC5';
const T3     = '#4A6080';

const PLACEHOLDER = '待补充';
const TYPE_LABEL: Record<string, string> = { TRADE: '贸易型', PROJECT: '项目型', LOG_ONLY: '内部', INTERNAL: '内部' };

interface CustomerRecord {
  key: string;
  clientName: string;
  businessType: string;
  countryCity: string;
  contactPerson: string;
  phoneE164: string;
  whatsapp: string;
  email: string;
  goal: string;
  businessCount: number;
  lastCommAt: string;
  owner: string;
  updatedAt: string;
  representative: FollowUpTask;
}

function fmtDate(iso: string): string {
  if (!iso) return PLACEHOLDER;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return PLACEHOLDER;
  return d.toLocaleDateString('zh-CN');
}

// Groups tasks into one row per customer. Reuses the same contactKey-first,
// clientName-fallback identity logic already established in CrmModule.tsx
// (taskMatchesProject) rather than inventing a new matching rule.
function buildCustomerRecords(tasks: FollowUpTask[]): CustomerRecord[] {
  const groups = new Map<string, FollowUpTask[]>();
  for (const t of tasks) {
    const key = (t.contactKey || '').trim().toLowerCase() || (t.clientName || '').trim().toLowerCase() || t.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const records: CustomerRecord[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => {
      const au = a.updatedAt || a.createdAt || '';
      const bu = b.updatedAt || b.createdAt || '';
      return bu.localeCompare(au);
    });
    const rep = sorted[0];
    const lastCommAt = sorted.reduce((latest, t) => {
      const c = t.updatedAt || t.createdAt || '';
      return c > latest ? c : latest;
    }, '');
    records.push({
      key,
      clientName: rep.clientName || PLACEHOLDER,
      businessType: TYPE_LABEL[rep.businessType] || rep.businessType || PLACEHOLDER,
      countryCity: rep.countryCity || PLACEHOLDER,
      contactPerson: (rep as any).contactPerson || PLACEHOLDER,
      phoneE164: rep.phoneE164 || PLACEHOLDER,
      whatsapp: rep.whatsapp || PLACEHOLDER,
      email: rep.email || PLACEHOLDER,
      goal: rep.goal || rep.inquirySummary || PLACEHOLDER,
      businessCount: group.length,
      lastCommAt,
      owner: rep.owner || PLACEHOLDER,
      updatedAt: rep.updatedAt || rep.createdAt || '',
      representative: rep,
    });
  }
  return records.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export default function CustomerDirectory({
  tasks, onSelectTask,
}: {
  tasks: FollowUpTask[];
  onSelectTask: (task: FollowUpTask) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'全部' | '项目型' | '贸易型'>('全部');
  const [countryFilter, setCountryFilter] = useState<string>('全部');
  const [ownerFilter, setOwnerFilter] = useState<string>('全部');

  const allRecords = useMemo(() => buildCustomerRecords(tasks), [tasks]);

  const countries = useMemo(() => {
    const set = new Set(allRecords.map(r => r.countryCity).filter(c => c && c !== PLACEHOLDER));
    return ['全部', ...Array.from(set).sort()];
  }, [allRecords]);

  const owners = useMemo(() => {
    const set = new Set(allRecords.map(r => r.owner).filter(o => o && o !== PLACEHOLDER));
    return ['全部', ...Array.from(set).sort()];
  }, [allRecords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRecords.filter(r => {
      if (typeFilter !== '全部' && r.businessType !== typeFilter) return false;
      if (countryFilter !== '全部' && r.countryCity !== countryFilter) return false;
      if (ownerFilter !== '全部' && r.owner !== ownerFilter) return false;
      if (!q) return true;
      return [r.clientName, r.contactPerson, r.phoneE164, r.whatsapp, r.email, r.countryCity]
        .some(f => (f || '').toLowerCase().includes(q));
    });
  }, [allRecords, search, typeFilter, countryFilter, ownerFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black" style={{ color: T1 }}>客户档案</h2>
          <p className="text-sm font-medium mt-0.5" style={{ color: T2 }}>
            聚合自项目客户库与小B/C客户池 · 共 {allRecords.length} 位客户
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T3 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索客户、公司、联系人、电话、国家…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-medium outline-none"
            style={{ background: CARD2, border: `1px solid ${BORDER}`, color: T1 }}
          />
        </div>
        {(['全部', '项目型', '贸易型'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={typeFilter === t
              ? { background: GOLD, color: '#fff' }
              : { background: CARD2, color: T2, border: `1px solid ${BORDER}` }}
          >
            {t}
          </button>
        ))}
        <select
          value={countryFilter}
          onChange={e => setCountryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none"
          style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}
        >
          {countries.map(c => <option key={c} value={c}>{c === '全部' ? '全部国家' : c}</option>)}
        </select>
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold outline-none"
          style={{ background: CARD2, color: T2, border: `1px solid ${BORDER}` }}
        >
          {owners.map(o => <option key={o} value={o}>{o === '全部' ? '全部负责人' : o}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1080 }}>
            <thead>
              <tr style={{ background: CARD2 }}>
                {['客户/公司', '类型', '国家/城市', '联系人', '电话', 'WhatsApp', '邮箱', '主要需求', '关联业务', '最近沟通', '负责人', '最近更新'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-black uppercase tracking-wide" style={{ color: T2, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const bizId = getTaskBusinessId(r.representative.id) || (r.representative as any).businessId || '';
                return (
                  <tr
                    key={r.key}
                    onClick={() => onSelectTask(r.representative)}
                    className="cursor-pointer transition-colors hover:bg-white/5"
                    style={{ borderTop: `1px solid ${BORDER}`, background: CARD }}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {bizId && <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD_L }}>{bizId}</span>}
                        <span className="font-black" style={{ color: T1 }}>{r.clientName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{r.businessType}</td>
                    <td className="px-3 py-3" style={{ color: r.countryCity === PLACEHOLDER ? T3 : T2 }}>
                      <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" />{r.countryCity}</span>
                    </td>
                    <td className="px-3 py-3" style={{ color: r.contactPerson === PLACEHOLDER ? T3 : T2 }}>
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{r.contactPerson}</span>
                    </td>
                    <td className="px-3 py-3" style={{ color: r.phoneE164 === PLACEHOLDER ? T3 : T2 }}>{r.phoneE164}</td>
                    <td className="px-3 py-3" style={{ color: r.whatsapp === PLACEHOLDER ? T3 : T2 }}>{r.whatsapp}</td>
                    <td className="px-3 py-3" style={{ color: r.email === PLACEHOLDER ? T3 : T2 }}>{r.email}</td>
                    <td className="px-3 py-3 max-w-[220px] truncate" style={{ color: r.goal === PLACEHOLDER ? T3 : T2 }} title={r.goal}>{r.goal}</td>
                    <td className="px-3 py-3 font-black" style={{ color: GOLD_L }}>{r.businessCount}</td>
                    <td className="px-3 py-3" style={{ color: T2 }}>{fmtDate(r.lastCommAt)}</td>
                    <td className="px-3 py-3" style={{ color: r.owner === PLACEHOLDER ? T3 : T2 }}>{r.owner}</td>
                    <td className="px-3 py-3 flex items-center justify-between gap-2" style={{ color: T2 }}>
                      {fmtDate(r.updatedAt)}
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: T3 }} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center" style={{ color: T3 }}>未找到匹配的客户档案</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
