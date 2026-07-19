import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Supplier } from '../types';
import {
  listSuppliersPage, searchSuppliersPage, listFilterOptions,
  type PagedSuppliers,
} from '../lib/suppliersCloud';
import { getCountryLabel, getCategoryLabel } from '../lib/labelMaps';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const CARD_BORDER = '#e8e0d0';

const RATING_COLOR: Record<string, string> = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' };
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  active:       { bg: '#dcfce7', text: '#166534' },
  inactive:     { bg: '#f1f5f9', text: '#475569' },
  blacklisted:  { bg: '#fee2e2', text: '#991b1b' },
  under_review: { bg: '#fef9ec', text: '#92400e' },
  archived:     { bg: '#f8fafc', text: '#94a3b8' },
};
const STATUS_LABEL: Record<string, string> = {
  active: '正常', inactive: '停用', blacklisted: '黑名单', under_review: '审核中', archived: '封存',
};

const SUPPLIER_TYPES = ['Factory', 'Trading', 'Integrated', 'Service', 'Agent', 'Unknown'];
const RATINGS = ['A', 'B', 'C', 'D'];
const STATUSES = ['active', 'inactive', 'blacklisted', 'under_review', 'archived'];
const PAGE_SIZES = [50, 100, 200];

interface Props {
  onSelect: (s: Supplier) => void;
  onNew: () => void;
  onNotionImport: () => void;
  onCleanup: () => void;
  initialFilters?: { country?: string; category?: string };
}

export default function SupplierList({ onSelect, onNew, onNotionImport, onCleanup, initialFilters }: Props) {
  const [paged, setPaged] = useState<PagedSuppliers>({ items: [], total: 0, page: 1, pageSize: 100 });
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [filters, setFilters] = useState({
    country: initialFilters?.country ?? '',
    supplier_type: '',
    category: initialFilters?.category ?? '',
    status: '',
    rating: '',
    is_preferred: '',
  });
  const [filterOptions, setFilterOptions] = useState<{ countries: string[]; categories: string[] }>({
    countries: [], categories: [],
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load filter dropdown options once on mount
  useEffect(() => {
    listFilterOptions().then(setFilterOptions);
  }, []);

  const load = useCallback(async (q: string, pg: number, pgSize: number) => {
    setLoading(true);
    try {
      let result: PagedSuppliers;
      if (q && q.length >= 2) {
        result = await searchSuppliersPage(q, { page: pg, pageSize: pgSize });
      } else {
        result = await listSuppliersPage({
          country: filters.country || undefined,
          supplier_type: filters.supplier_type || undefined,
          category: filters.category || undefined,
          status: filters.status || undefined,
          rating: filters.rating || undefined,
          is_preferred: filters.is_preferred === 'true' ? true : undefined,
          page: pg,
          pageSize: pgSize,
        });
      }
      setPaged(result);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(searchQ, page, pageSize); }, [load, page, pageSize]);

  const handleSearch = (v: string) => {
    setSearchQ(v);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v, 1, pageSize), 300);
  };

  const filt = (key: string, val: string) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  const { items, total } = paged;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 49px)', background: '#f5f3ef' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${CARD_BORDER}`, padding: '14px 24px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={searchQ}
          onChange={e => handleSearch(e.target.value)}
          placeholder="搜索供应商名称、编码…"
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 10, border: `1.5px solid #b0bec5`, fontSize: 14, color: NAVY, outline: 'none', background: '#fff' }}
        />
        <Sel value={filters.supplier_type} onChange={v => filt('supplier_type', v)} placeholder="全部类型">
          {SUPPLIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Sel>
        <Sel value={filters.country} onChange={v => filt('country', v)} placeholder="全部国家">
          {filterOptions.countries.map(c => <option key={c} value={c}>{getCountryLabel(c)}</option>)}
        </Sel>
        <Sel value={filters.category} onChange={v => filt('category', v)} placeholder="全部品类">
          {filterOptions.categories.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
        </Sel>
        <Sel value={filters.status} onChange={v => filt('status', v)} placeholder="全部状态">
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Sel>
        <Sel value={filters.rating} onChange={v => filt('rating', v)} placeholder="全部评级">
          {RATINGS.map(r => <option key={r} value={r}>评级 {r}</option>)}
        </Sel>
        <Sel value={filters.is_preferred} onChange={v => filt('is_preferred', v)} placeholder="用过的">
          <option value="true">仅常用</option>
        </Sel>
        <button
          onClick={onNotionImport}
          style={{ padding: '9px 16px', borderRadius: 10, background: '#fff', color: NAVY, border: `1.5px solid ${GOLD}`, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          从概念导入
        </button>
        <button
          onClick={onCleanup}
          style={{ padding: '9px 16px', borderRadius: 10, background: '#fff', color: NAVY, border: `1.5px solid ${GOLD}`, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          数据概览与清理
        </button>
        <button
          onClick={onNew}
          style={{ padding: '9px 20px', borderRadius: 10, background: NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + 新增供应商
        </button>
      </div>

      {/* Count info */}
      <div style={{ padding: '12px 24px', fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 16 }}>
        {loading ? '加载中…' : (
          <>
            <span>共 <strong style={{ color: NAVY }}>{total}</strong> 家供应商</span>
            {total > 0 && (
              <span style={{ color: '#b0bec5' }}>
                第 {fromItem}–{toItem} 条 · 第 {page} / {totalPages} 页
              </span>
            )}
          </>
        )}
      </div>

      {/* Table card */}
      <div style={{ flex: 1, padding: '0 24px 8px' }}>
        {!loading && items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${CARD_BORDER}`, textAlign: 'center', padding: '80px 0', color: '#94a3b8', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏭</div>
            暂无供应商数据
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 24, border: `1px solid ${CARD_BORDER}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(12,27,58,0.06)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f3ef' }}>
                    {['供应商名称', '编码', '类型', '国家', '评级', '状态', '用过的', ''].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(s => {
                    const st = STATUS_COLOR[s.status ?? 'active'] ?? { bg: '#f1f5f9', text: '#475569' };
                    return (
                      <tr
                        key={s.id}
                        onClick={() => onSelect(s)}
                        style={{ borderBottom: `1px solid ${CARD_BORDER}`, cursor: 'pointer', transition: 'background .1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '13px 14px', fontWeight: 700, color: NAVY, maxWidth: 220 }}>
                          <div translate="no" className="notranslate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.supplier_name_display}</div>
                          {(s.name_cn || s.name_en) && (
                            <div translate="no" className="notranslate" style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name_cn || s.name_en}</div>
                          )}
                        </td>
                        <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{s.short_code}</td>
                        <td style={{ padding: '13px 14px', color: '#475569' }}>{s.supplier_type || '—'}</td>
                        <td style={{ padding: '13px 14px', color: '#475569' }}>{s.country || '—'}</td>
                        <td style={{ padding: '13px 14px' }}>
                          <span style={{ fontWeight: 800, color: RATING_COLOR[s.current_rating ?? 'B'] ?? '#475569' }}>{s.current_rating || '—'}</span>
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.text }}>
                            {STATUS_LABEL[s.status ?? 'active'] ?? s.status}
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', textAlign: 'center' }}>
                          {s.is_preferred ? <span style={{ color: GOLD, fontSize: 16 }}>★</span> : <span style={{ color: '#e2e8f0' }}>—</span>}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <button
                            onClick={e => { e.stopPropagation(); onSelect(s); }}
                            style={{ fontSize: 12, fontWeight: 600, color: NAVY, background: 'none', border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination bar */}
      {total > 0 && (
        <div style={{ padding: '16px 24px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: page <= 1 ? '#f5f3ef' : '#fff', color: page <= 1 ? '#b0bec5' : NAVY, fontWeight: 600, fontSize: 13, cursor: page <= 1 ? 'default' : 'pointer' }}
          >
            上一页
          </button>

          {/* Page number pills — show at most 7 pages */}
          {pageNumbers(page, totalPages).map((n, i) =>
            n === '…' ? (
              <span key={`ellipsis-${i}`} style={{ color: '#b0bec5', fontSize: 13, padding: '0 4px' }}>…</span>
            ) : (
              <button
                key={n}
                onClick={() => setPage(Number(n))}
                disabled={loading}
                style={{
                  padding: '7px 13px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  border: n === page ? 'none' : `1px solid ${CARD_BORDER}`,
                  background: n === page ? NAVY : '#fff',
                  color: n === page ? '#fff' : NAVY,
                }}
              >
                {n}
              </button>
            )
          )}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: page >= totalPages ? '#f5f3ef' : '#fff', color: page >= totalPages ? '#b0bec5' : NAVY, fontWeight: 600, fontSize: 13, cursor: page >= totalPages ? 'default' : 'pointer' }}
          >
            下一页
          </button>

          <span style={{ color: '#b0bec5', fontSize: 13, marginLeft: 8 }}>每页</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 13, color: NAVY, background: '#fff', cursor: 'pointer' }}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} 条</option>)}
          </select>

          <span style={{ color: '#b0bec5', fontSize: 13, marginLeft: 4 }}>
            跳至第
          </span>
          <input
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            key={page}
            onBlur={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setPage(Math.max(1, Math.min(totalPages, v)));
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = parseInt((e.target as HTMLInputElement).value, 10);
                if (!isNaN(v)) setPage(Math.max(1, Math.min(totalPages, v)));
              }
            }}
            style={{ width: 56, padding: '7px 8px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 13, color: NAVY, textAlign: 'center' }}
          />
          <span style={{ color: '#b0bec5', fontSize: 13 }}>页</span>
        </div>
      )}
    </div>
  );
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) add(i);
  if (current < total - 2) pages.push('…');
  add(total);
  return pages;
}

function Sel({ value, onChange, placeholder, children }: {
  value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #b0bec5', fontSize: 13, color: value ? '#0c1b3a' : '#94a3b8', background: '#fff', outline: 'none', cursor: 'pointer' }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
