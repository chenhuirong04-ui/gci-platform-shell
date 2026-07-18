import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Supplier } from '../types';
import { listSuppliers, searchSuppliers } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const T2 = '#475569';
const T3 = '#94a3b8';
const BORDER = '#e2e8f0';

const RATING_COLOR: Record<string, string> = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' };
const STATUS_COLOR: Record<string, string> = {
  active: '#16a34a', inactive: '#94a3b8', blacklisted: '#dc2626',
  under_review: '#d97706', archived: '#64748b',
};
const STATUS_LABEL: Record<string, string> = {
  active: '正常', inactive: '停用', blacklisted: '黑名单', under_review: '审核中', archived: '封存',
};

const SUPPLIER_TYPES = ['Factory', 'Trading', 'Integrated', 'Service', 'Agent', 'Unknown'];
const RATINGS = ['A', 'B', 'C', 'D'];
const STATUSES = ['active', 'inactive', 'blacklisted', 'under_review', 'archived'];

interface Props {
  onSelect: (s: Supplier) => void;
  onNew: () => void;
}

export default function SupplierList({ onSelect, onNew }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [filters, setFilters] = useState({
    country: '', supplier_type: '', category: '', status: '', rating: '', is_preferred: '',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      let data: Supplier[];
      if (q && q.length >= 2) {
        data = await searchSuppliers(q, 50);
      } else {
        data = await listSuppliers({
          country: filters.country || undefined,
          supplier_type: filters.supplier_type || undefined,
          category: filters.category || undefined,
          status: filters.status || undefined,
          rating: filters.rating || undefined,
          is_preferred: filters.is_preferred === 'true' ? true : undefined,
          limit: 100,
        });
      }
      setSuppliers(data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (v: string) => {
    setSearchQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 300);
  };

  const filt = (key: string, val: string) =>
    setFilters(f => ({ ...f, [key]: val }));

  const countries = [...new Set(suppliers.map(s => s.country).filter(Boolean))] as string[];
  const categories = [...new Set(suppliers.flatMap(s => s.product_categories ?? []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={searchQ}
          onChange={e => handleSearch(e.target.value)}
          placeholder="搜索供应商名称、编码…"
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 14, color: NAVY, outline: 'none' }}
        />
        <Select value={filters.supplier_type} onChange={v => filt('supplier_type', v)} placeholder="全部类型">
          {SUPPLIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={filters.country} onChange={v => filt('country', v)} placeholder="全部国家">
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filters.category} onChange={v => filt('category', v)} placeholder="全部品类">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filters.status} onChange={v => filt('status', v)} placeholder="全部状态">
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select value={filters.rating} onChange={v => filt('rating', v)} placeholder="全部评级">
          {RATINGS.map(r => <option key={r} value={r}>评级 {r}</option>)}
        </Select>
        <Select value={filters.is_preferred} onChange={v => filt('is_preferred', v)} placeholder="常用">
          <option value="true">仅常用</option>
        </Select>
        <button
          onClick={onNew}
          style={{ padding: '9px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + 新增供应商
        </button>
      </div>

      {/* Count */}
      <div style={{ padding: '10px 24px', fontSize: 12, color: T3 }}>
        {loading ? '加载中…' : `共 ${suppliers.length} 家供应商`}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {!loading && suppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T3, fontSize: 14 }}>暂无供应商数据</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                {['供应商名称', '编码', '类型', '国家', '评级', '状态', '常用', '操作'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: T2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr
                  key={s.id}
                  onClick={() => onSelect(s)}
                  style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '12px', fontWeight: 600, color: NAVY, maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.supplier_name_display}
                    </div>
                    {(s.name_cn || s.name_en) && (
                      <div style={{ fontSize: 11, color: T3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name_cn || s.name_en}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px', color: T2 }}>{s.short_code}</td>
                  <td style={{ padding: '12px', color: T2 }}>{s.supplier_type || '—'}</td>
                  <td style={{ padding: '12px', color: T2 }}>{s.country || '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: 700, color: RATING_COLOR[s.current_rating ?? 'B'] ?? T2 }}>
                      {s.current_rating || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: (STATUS_COLOR[s.status ?? 'active'] ?? T3) + '18',
                      color: STATUS_COLOR[s.status ?? 'active'] ?? T3,
                    }}>
                      {STATUS_LABEL[s.status ?? 'active'] ?? s.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {s.is_preferred ? <span style={{ color: GOLD, fontWeight: 700 }}>★</span> : <span style={{ color: T3 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); onSelect(s); }}
                      style={{ fontSize: 12, fontWeight: 600, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      查看详情
                    </button>
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

function Select({ value, onChange, placeholder, children }: {
  value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, color: value ? '#0B1F44' : '#94a3b8', background: '#fff', outline: 'none', cursor: 'pointer' }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
