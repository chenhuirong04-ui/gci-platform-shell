import React, { useCallback, useEffect, useState } from 'react';
import CountryDistributionChart from './CountryDistributionChart';
import CategoryDistributionChart from './CategoryDistributionChart';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const CARD_BORDER = '#e8e0d0';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplierFlags {
  missingCountry: boolean;
  missingCity: boolean;
  missingCategory: boolean;
  missingContact: boolean;
  missingContactMethod: boolean;
  missingWebsite: boolean;
  missingBizLicense: boolean;
  missingCatalog: boolean;
  missingQuotation: boolean;
  missingCertification: boolean;
}

interface PendingSupplier {
  id: string;
  supplier_name_display: string;
  short_code: string;
  country: string | null;
  city: string | null;
  product_categories: string[];
  is_preferred: boolean;
  status: string;
  primaryContact: { name: string | null; whatsapp: string | null; email: string | null } | null;
  completeness: number;
  completenessLabel: string;
  missingFields: string[];
  flags: SupplierFlags;
}

interface DuplicateRecord {
  id: string;
  supplier_name_display: string;
  short_code: string;
  country: string | null;
  import_source: string;
  status: string;
  created_at: string;
  hasContact: boolean;
  contactName: string | null;
  categories: string[];
  notes: string | null;
}

interface DuplicateGroup {
  groupId: string;
  reason: string;
  records: DuplicateRecord[];
}

interface SummaryData {
  stats: {
    total: number;
    preferred: number;
    missingCountry: number;
    missingCategory: number;
    missingContact: number;
    duplicateGroups: number;
  };
  countryDistribution: any;
  categoryDistribution: any;
  duplicates: DuplicateGroup[];
  pendingCleanup: PendingSupplier[];
}

// ── Completeness bar ──────────────────────────────────────────────────────────

function CompletenessBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 110 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{pct}%</span>
      </div>
      <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, onClick, active }: {
  label: string; value: number; sub?: string; accent?: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? '#f0f4ff' : '#fff',
        border: `1.5px solid ${active ? NAVY : CARD_BORDER}`,
        borderRadius: 14,
        padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        flex: 1,
        minWidth: 120,
        transition: 'border-color .15s, background .15s',
        boxShadow: '0 1px 4px rgba(12,27,58,0.05)',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = NAVY; }}
      onMouseLeave={e => { if (onClick && !active) (e.currentTarget as HTMLDivElement).style.borderColor = CARD_BORDER; }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: accent ? '#dc2626' : NAVY, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────

const FLAG_CHIPS: { key: keyof SupplierFlags; label: string }[] = [
  { key: 'missingCountry',       label: '缺国家' },
  { key: 'missingCity',          label: '缺城市' },
  { key: 'missingCategory',      label: '缺产品类别' },
  { key: 'missingContact',       label: '缺联系人' },
  { key: 'missingContactMethod', label: '缺联系方式' },
  { key: 'missingWebsite',       label: '缺网站' },
  { key: 'missingBizLicense',    label: '缺营业执照' },
  { key: 'missingCatalog',       label: '缺产品目录' },
  { key: 'missingQuotation',     label: '缺报价' },
  { key: 'missingCertification', label: '缺认证' },
];

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onOpenDetail: (id: string) => void;
}

export default function SupplierCleanupPage({ onBack, onOpenDetail }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryData | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'duplicates' | 'pending'>('pending');
  const [activeFlags, setActiveFlags] = useState<Set<keyof SupplierFlags>>(new Set());
  const [preferredFirst, setPreferredFirst] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Archive state
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/cleanup-summary`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived: filtered pending list ────────────────────────────────────────
  const filteredPending: PendingSupplier[] = data?.pendingCleanup
    .filter(s => {
      if (archivedIds.has(s.id)) return false;
      // Flag filters (AND)
      for (const f of activeFlags) {
        if (!s.flags[f]) return false;
      }
      // Country filter
      if (selectedCountry) {
        if (selectedCountry === '未填写' && s.country) return false;
        if (selectedCountry !== '未填写' && s.country !== selectedCountry) return false;
      }
      // Category filter
      if (selectedCategory) {
        if (selectedCategory === '未分类' && s.product_categories.length > 0) return false;
        if (selectedCategory !== '未分类' && !s.product_categories.includes(selectedCategory)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (preferredFirst) {
        if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
      }
      return a.completeness - b.completeness;
    }) ?? [];

  // ── Stat card click → jump to pending tab with chip ──────────────────────
  const jumpToFlag = (flag: keyof SupplierFlags) => {
    setActiveTab('pending');
    setActiveFlags(new Set([flag]));
  };
  const jumpToDuplicates = () => setActiveTab('duplicates');

  // ── Archive handler ────────────────────────────────────────────────────────
  const handleArchive = async (id: string) => {
    setArchivingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/archive-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: id }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? 'Archive failed');
      setArchivedIds(prev => new Set([...prev, id]));
      setConfirmArchiveId(null);
      if (data) {
        data.stats.duplicateGroups = Math.max(0, data.stats.duplicateGroups - 1);
      }
    } catch (e: any) {
      alert(`归档失败：${e.message}`);
    } finally {
      setArchivingId(null);
    }
  };

  const toggleFlag = (key: keyof SupplierFlags) => {
    setActiveFlags(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        加载数据中…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 12 }}>加载失败：{error}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}>重试</button>
      </div>
    );
  }

  if (!data) return null;
  const { stats, countryDistribution, categoryDistribution, duplicates, pendingCleanup } = data;

  // Active duplicate groups (filter out fully archived ones)
  const activeDuplicates = duplicates.map(g => ({
    ...g,
    records: g.records.filter(r => !archivedIds.has(r.id)),
  })).filter(g => g.records.length > 1);

  return (
    <div style={{ minHeight: 'calc(100vh - 49px)', background: '#f5f3ef' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${CARD_BORDER}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onBack}
          style={{ fontSize: 13, color: '#64748b', background: 'none', border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
        >
          ← 返回列表
        </button>
        <div style={{ fontWeight: 800, fontSize: 16, color: NAVY }}>供应商数据概览与清洗</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
          资料完整度只代表档案资料，不代表供应商质量
        </div>
        <button
          onClick={load}
          style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', background: 'none', border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          刷新
        </button>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── 区域1：核心数据卡 ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="供应商总数" value={stats.total} />
          <StatCard label="常用供应商" value={stats.preferred} sub="is_preferred = true" onClick={() => { setActiveTab('pending'); setPreferredFirst(true); }} active={preferredFirst && activeTab === 'pending'} />
          <StatCard label="缺国家" value={stats.missingCountry} accent onClick={() => jumpToFlag('missingCountry')} active={activeTab === 'pending' && activeFlags.has('missingCountry')} />
          <StatCard label="缺产品类别" value={stats.missingCategory} accent onClick={() => jumpToFlag('missingCategory')} active={activeTab === 'pending' && activeFlags.has('missingCategory')} />
          <StatCard label="缺联系人" value={stats.missingContact} accent onClick={() => jumpToFlag('missingContact')} active={activeTab === 'pending' && activeFlags.has('missingContact')} />
          <StatCard label="重复供应商组" value={activeDuplicates.length} accent={activeDuplicates.length > 0} onClick={jumpToDuplicates} active={activeTab === 'duplicates'} sub="点击查看详情" />
        </div>

        {/* ── 区域2+3：两栏图表 ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <CountryDistributionChart
            data={countryDistribution}
            selectedCountry={selectedCountry}
            onSelect={c => { setSelectedCountry(c); setActiveTab('pending'); }}
          />
          <CategoryDistributionChart
            data={categoryDistribution}
            selectedCategory={selectedCategory}
            onSelect={c => { setSelectedCategory(c); setActiveTab('pending'); }}
          />
        </div>

        {/* ── 区域4：数据清洗 ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.05)', overflow: 'hidden' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${CARD_BORDER}`, padding: '0 24px' }}>
            {([
              { key: 'pending',    label: `待补资料（${filteredPending.length}）` },
              { key: 'duplicates', label: `重复供应商（${activeDuplicates.length}组）` },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '12px 20px',
                  fontSize: 13,
                  fontWeight: activeTab === t.key ? 700 : 500,
                  color: activeTab === t.key ? NAVY : '#64748b',
                  border: 'none',
                  borderBottom: activeTab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}

            {/* Active chart filter indicators */}
            {(selectedCountry || selectedCategory) && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                {selectedCountry && (
                  <span style={{ background: '#e8f0fa', color: NAVY, borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                    国家: {selectedCountry}
                    <button onClick={() => setSelectedCountry(null)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>✕</button>
                  </span>
                )}
                {selectedCategory && (
                  <span style={{ background: '#e8f0fa', color: NAVY, borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                    行业: {selectedCategory}
                    <button onClick={() => setSelectedCategory(null)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>✕</button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Tab①: 重复供应商 ────────────────────────────────────────── */}
          {activeTab === 'duplicates' && (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {activeDuplicates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 14 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                  暂无重复供应商
                </div>
              ) : activeDuplicates.map(group => (
                <div key={group.groupId} style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#fef9ec', padding: '10px 16px', fontSize: 12, color: '#92400e', fontWeight: 600, borderBottom: `1px solid ${CARD_BORDER}` }}>
                    重复组 · {group.reason} · {group.records.length} 条记录
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.records.length}, 1fr)`, gap: 0 }}>
                    {group.records.map((rec, idx) => (
                      <div
                        key={rec.id}
                        style={{
                          padding: '16px 20px',
                          borderLeft: idx > 0 ? `1px solid ${CARD_BORDER}` : 'none',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 14, color: NAVY, marginBottom: 10 }}>{rec.supplier_name_display}</div>
                        <table style={{ fontSize: 12, color: '#475569', width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {[
                              ['编码', rec.short_code],
                              ['国家', rec.country ?? '—'],
                              ['来源', rec.import_source],
                              ['联系人', rec.hasContact ? (rec.contactName ?? '有') : '无'],
                              ['品类', rec.categories.join(', ') || '—'],
                              ['备注', rec.notes ?? '—'],
                              ['创建时间', rec.created_at ? rec.created_at.slice(0, 10) : '—'],
                            ].map(([k, v]) => (
                              <tr key={k}>
                                <td style={{ padding: '3px 0', color: '#94a3b8', width: 60, verticalAlign: 'top' }}>{k}</td>
                                <td style={{ padding: '3px 0', fontWeight: 500 }}>{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => onOpenDetail(rec.id)}
                            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600 }}
                          >
                            查看详情
                          </button>
                          {confirmArchiveId === rec.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: '#dc2626' }}>确认归档？</span>
                              <button
                                onClick={() => handleArchive(rec.id)}
                                disabled={archivingId === rec.id}
                                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                              >
                                {archivingId === rec.id ? '…' : '确认'}
                              </button>
                              <button
                                onClick={() => setConfirmArchiveId(null)}
                                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmArchiveId(rec.id)}
                              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                            >
                              归档此条
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Tab②: 待补资料 ──────────────────────────────────────────── */}
          {activeTab === 'pending' && (
            <div>
              {/* Filter chips */}
              <div style={{ padding: '14px 24px', borderBottom: `1px solid ${CARD_BORDER}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {FLAG_CHIPS.map(chip => {
                  const active = activeFlags.has(chip.key);
                  const count = pendingCleanup.filter(s => s.flags[chip.key]).length;
                  return (
                    <button
                      key={chip.key}
                      onClick={() => toggleFlag(chip.key)}
                      style={{
                        fontSize: 12, padding: '5px 12px', borderRadius: 20,
                        border: `1.5px solid ${active ? NAVY : CARD_BORDER}`,
                        background: active ? NAVY : '#fff',
                        color: active ? '#fff' : '#475569',
                        cursor: 'pointer', fontWeight: active ? 700 : 500,
                        transition: 'all .15s',
                      }}
                    >
                      {chip.label} <span style={{ opacity: 0.7 }}>{count}</span>
                    </button>
                  );
                })}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="checkbox" checked={preferredFirst} onChange={e => setPreferredFirst(e.target.checked)} style={{ accentColor: GOLD }} />
                    常用优先
                  </label>
                  {(activeFlags.size > 0 || preferredFirst) && (
                    <button
                      onClick={() => { setActiveFlags(new Set()); setPreferredFirst(false); }}
                      style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f3ef' }}>
                      {['供应商名称', '编码', '国家/城市', '产品类别', '主联系人', '常用', '完整度', '缺失项', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                          无符合条件的供应商
                        </td>
                      </tr>
                    ) : filteredPending.map(s => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: `1px solid ${CARD_BORDER}`, transition: 'background .1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: NAVY, maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.is_preferred && <span style={{ color: GOLD, marginRight: 4 }}>★</span>}
                            {s.supplier_name_display}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{s.short_code}</td>
                        <td style={{ padding: '12px 14px', color: s.country ? '#475569' : '#dc2626' }}>
                          {s.country ?? <span style={{ fontStyle: 'italic' }}>缺国家</span>}
                          {s.city && <span style={{ color: '#94a3b8' }}> / {s.city}</span>}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', maxWidth: 160 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.product_categories.length > 0 ? s.product_categories.join(', ') : <span style={{ color: '#dc2626', fontStyle: 'italic' }}>缺品类</span>}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: s.primaryContact ? '#475569' : '#dc2626' }}>
                          {s.primaryContact?.name ?? (s.primaryContact ? '—' : <span style={{ fontStyle: 'italic' }}>缺联系人</span>)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {s.is_preferred ? <span style={{ color: GOLD, fontWeight: 700 }}>★</span> : <span style={{ color: '#e2e8f0' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <CompletenessBar pct={s.completeness} label={s.completenessLabel} />
                        </td>
                        <td style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 11, maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.missingFields.join(' · ')}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <button
                            onClick={() => onOpenDetail(s.id)}
                            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            补资料
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredPending.length > 0 && (
                <div style={{ padding: '10px 24px', fontSize: 11, color: '#94a3b8', borderTop: `1px solid ${CARD_BORDER}` }}>
                  显示 {filteredPending.length} / {pendingCleanup.length} 家供应商
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Archive confirmation dialog */}
      {confirmArchiveId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: NAVY, marginBottom: 10 }}>确认归档？</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
              此操作将把该供应商状态设为 <strong>archived（封存）</strong>，不删除数据，随时可在供应商详情中恢复。
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmArchiveId(null)} style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>取消</button>
              <button
                onClick={() => handleArchive(confirmArchiveId)}
                disabled={!!archivingId}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {archivingId ? '归档中…' : '确认归档'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
