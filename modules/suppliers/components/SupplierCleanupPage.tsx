import React, { useCallback, useEffect, useState } from 'react';
import { useI18n, type Dictionary } from '@gci/i18n';
import CountryDistributionChart from './CountryDistributionChart';
import CategoryDistributionChart from './CategoryDistributionChart';
import { getCountryLabel, getCategoryLabel } from '../lib/labelMaps';

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

interface CountryTableRow {
  country: string;
  supplierCount: number;
  percentage: number;
  preferredCount: number;
  contactCount: number;
  missingCategoryCount: number;
  missingBizLicenseCount: number;
  missingCatalogCount: number;
}

interface CategoryTableRow {
  category: string;
  supplierCount: number;
  preferredCount: number;
  contactCount: number;
  catalogCount: number;
  certificationCount: number;
  missingCountryCount: number;
}

interface SummaryData {
  stats: {
    total: number;
    dbTotal?: number;
    archivedCount?: number;
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
  countryTable: CountryTableRow[];
  categoryTable: CategoryTableRow[];
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

function buildFlagChips(t: Dictionary['suppliers']['dashboard']): { key: keyof SupplierFlags; label: string }[] {
  return [
    { key: 'missingCountry',       label: t.flagMissingCountry },
    { key: 'missingCity',          label: t.flagMissingCity },
    { key: 'missingCategory',      label: t.flagMissingCategory },
    { key: 'missingContact',       label: t.flagMissingContact },
    { key: 'missingContactMethod', label: t.flagMissingContactMethod },
    { key: 'missingWebsite',       label: t.flagMissingWebsite },
    { key: 'missingBizLicense',    label: t.flagMissingBizLicense },
    { key: 'missingCatalog',       label: t.flagMissingCatalog },
    { key: 'missingQuotation',     label: t.flagMissingQuotation },
    { key: 'missingCertification', label: t.flagMissingCertification },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onOpenDetail: (id: string) => void;
  onGoToFilteredList?: (filters: { country?: string; category?: string }) => void;
}

export default function SupplierCleanupPage({ onBack, onOpenDetail, onGoToFilteredList }: Props) {
  const { lang, dict } = useI18n();
  const t = dict.suppliers.dashboard;
  const FLAG_CHIPS = buildFlagChips(t);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryData | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'duplicates' | 'pending'>('pending');
  const [activeFlags, setActiveFlags] = useState<Set<keyof SupplierFlags>>(new Set());
  const [preferredFirst, setPreferredFirst] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Analysis table state
  const [analysisTab, setAnalysisTab] = useState<'country' | 'category'>('country');
  type CtyKey = keyof CountryTableRow;
  type CatKey = keyof CategoryTableRow;
  const [ctySort, setCtySort] = useState<{ key: CtyKey; dir: 'asc' | 'desc' }>({ key: 'supplierCount', dir: 'desc' });
  const [catSort, setCatSort] = useState<{ key: CatKey; dir: 'asc' | 'desc' }>({ key: 'supplierCount', dir: 'desc' });

  const toggleCtySort = (key: CtyKey) =>
    setCtySort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  const toggleCatSort = (key: CatKey) =>
    setCatSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });

  // Data maintenance section
  const [dupSectionOpen, setDupSectionOpen] = useState(false);

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
      alert(t.archiveFailed(e.message));
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
        {t.loadingText}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 12 }}>{t.loadFailed(error)}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}>{t.retry}</button>
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
          {dict.suppliers.common.back}
        </button>
        <div style={{ fontWeight: 800, fontSize: 16, color: NAVY }}>{t.title}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
          {t.scopeNote}
        </div>
        <button
          onClick={load}
          style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', background: 'none', border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          {t.refresh}
        </button>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── 区域1：核心数据卡 ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label={t.statTotal} value={stats.total} />
          <StatCard label={t.statPreferred} value={stats.preferred} sub="is_preferred = true" onClick={() => { setActiveTab('pending'); setPreferredFirst(true); }} active={preferredFirst && activeTab === 'pending'} />
          <StatCard label={t.statMissingCountry} value={stats.missingCountry} accent onClick={() => jumpToFlag('missingCountry')} active={activeTab === 'pending' && activeFlags.has('missingCountry')} />
          <StatCard label={t.statMissingCategory} value={stats.missingCategory} accent onClick={() => jumpToFlag('missingCategory')} active={activeTab === 'pending' && activeFlags.has('missingCategory')} />
          <StatCard label={t.statMissingContact} value={stats.missingContact} accent onClick={() => jumpToFlag('missingContact')} active={activeTab === 'pending' && activeFlags.has('missingContact')} />
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

        {/* ── 区域4：分析表格 ───────────────────────────────────────────── */}
        {(data.countryTable?.length > 0 || data.categoryTable?.length > 0) && (
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.05)', overflow: 'hidden' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${CARD_BORDER}`, padding: '0 24px' }}>
              {([
                { key: 'country' as const,  label: `${t.analysisByCountry}（${data.countryTable?.length ?? 0}）` },
                { key: 'category' as const, label: `${t.analysisByCategory}（${data.categoryTable?.length ?? 0}）` },
              ]).map(tb => (
                <button key={tb.key} onClick={() => setAnalysisTab(tb.key)} style={{
                  padding: '12px 20px', fontSize: 13,
                  fontWeight: analysisTab === tb.key ? 700 : 500,
                  color: analysisTab === tb.key ? NAVY : '#64748b',
                  border: 'none',
                  borderBottom: analysisTab === tb.key ? `2px solid ${GOLD}` : '2px solid transparent',
                  background: 'none', cursor: 'pointer', marginBottom: -1,
                }}>{tb.label}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {t.scopeRangeLabel(stats.total)}
                {stats.dbTotal != null && stats.archivedCount != null && stats.archivedCount > 0
                  ? t.archivedNote(stats.dbTotal, stats.archivedCount)
                  : ''}
              </span>
            </div>

            {/* 按国家 */}
            {analysisTab === 'country' && (() => {
              const sorted = [...(data.countryTable ?? [])].sort((a, b) => {
                if (a.country === '未填写') return 1;
                if (b.country === '未填写') return -1;
                const av = a[ctySort.key]; const bv = b[ctySort.key];
                if (typeof av === 'string') return ctySort.dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
                return ctySort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
              });
              const SH = ({ col, label }: { col: CtyKey; label: string }) => (
                <th onClick={() => toggleCtySort(col)} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                  {label}{ctySort.key === col ? (ctySort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              );
              const totals = {
                countryCount: sorted.length,
                supplierCount: sorted.reduce((s, r) => s + r.supplierCount, 0),
                preferredCount: sorted.reduce((s, r) => s + r.preferredCount, 0),
                contactCount: sorted.reduce((s, r) => s + r.contactCount, 0),
                missingCategoryCount: sorted.reduce((s, r) => s + r.missingCategoryCount, 0),
                missingBizLicenseCount: sorted.reduce((s, r) => s + r.missingBizLicenseCount, 0),
                missingCatalogCount: sorted.reduce((s, r) => s + r.missingCatalogCount, 0),
              };
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ background: '#f5f3ef' }}>
                        <SH col="country" label={t.colCountry} />
                        <SH col="supplierCount" label={t.colSupplierCount} />
                        <SH col="percentage" label={t.colPercentage} />
                        <SH col="preferredCount" label={t.colPreferred} />
                        <SH col="contactCount" label={t.colWithContact} />
                        <SH col="missingCategoryCount" label={t.colMissingCategory} />
                        <SH col="missingBizLicenseCount" label={t.colMissingBizLicense} />
                        <SH col="missingCatalogCount" label={t.colMissingCatalog} />
                        <th style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap', background: '#f5f3ef' }}>{t.colAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(row => (
                        <tr key={row.country} style={{ borderBottom: `1px solid ${CARD_BORDER}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: row.country === '未填写' ? '#94a3b8' : NAVY }}>
                            {row.country === '未填写' ? t.notSpecified : getCountryLabel(row.country, lang)}
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: NAVY }}>{row.supplierCount}</td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 48, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${row.percentage}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
                              </div>
                              <span>{row.percentage}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', color: row.preferredCount > 0 ? GOLD : '#94a3b8', fontWeight: row.preferredCount > 0 ? 700 : 400 }}>{row.preferredCount}</td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>{row.contactCount}</td>
                          <td style={{ padding: '11px 14px', color: row.missingCategoryCount > 0 ? '#dc2626' : '#94a3b8', fontWeight: row.missingCategoryCount > 0 ? 700 : 400 }}>{row.missingCategoryCount}</td>
                          <td style={{ padding: '11px 14px', color: row.missingBizLicenseCount > 0 ? '#d97706' : '#94a3b8', fontWeight: row.missingBizLicenseCount > 0 ? 700 : 400 }}>{row.missingBizLicenseCount}</td>
                          <td style={{ padding: '11px 14px', color: row.missingCatalogCount > 0 ? '#d97706' : '#94a3b8', fontWeight: row.missingCatalogCount > 0 ? 700 : 400 }}>{row.missingCatalogCount}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <button
                              onClick={() => onGoToFilteredList?.({ country: row.country })}
                              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              {t.viewSuppliers}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f0f4ff', borderTop: `2px solid ${NAVY}` }}>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: NAVY, fontSize: 12 }}>
                          {t.totalRowLabel(totals.countryCount)}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: NAVY }}>{totals.supplierCount}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>100%</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: GOLD }}>{totals.preferredCount}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>{totals.contactCount}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: totals.missingCategoryCount > 0 ? '#dc2626' : '#94a3b8' }}>{totals.missingCategoryCount}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: totals.missingBizLicenseCount > 0 ? '#d97706' : '#94a3b8' }}>{totals.missingBizLicenseCount}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: totals.missingCatalogCount > 0 ? '#d97706' : '#94a3b8' }}>{totals.missingCatalogCount}</td>
                        <td style={{ padding: '10px 14px' }} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}

            {/* 按行业 */}
            {analysisTab === 'category' && (() => {
              const sorted = [...(data.categoryTable ?? [])].sort((a, b) => {
                const av = a[catSort.key]; const bv = b[catSort.key];
                if (typeof av === 'string') return catSort.dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
                return catSort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
              });
              const SH = ({ col, label }: { col: CatKey; label: string }) => (
                <th onClick={() => toggleCatSort(col)} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                  {label}{catSort.key === col ? (catSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              );
              return (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ padding: '8px 24px 0', fontSize: 11, color: '#94a3b8' }}>
                    {t.categoryNote}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ background: '#f5f3ef' }}>
                        <SH col="category" label={t.colCategory} />
                        <SH col="supplierCount" label={t.colSupplierCount} />
                        <SH col="preferredCount" label={t.colPreferred} />
                        <SH col="contactCount" label={t.colWithContact} />
                        <SH col="catalogCount" label={t.colWithCatalog} />
                        <SH col="certificationCount" label={t.colWithCertification} />
                        <SH col="missingCountryCount" label={t.colMissingCountry} />
                        <th style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap', background: '#f5f3ef' }}>{t.colAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(row => (
                        <tr key={row.category} style={{ borderBottom: `1px solid ${CARD_BORDER}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#faf8f5')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: NAVY }}>{row.category === '未分类' ? t.uncategorized : getCategoryLabel(row.category, lang)}</td>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: NAVY }}>{row.supplierCount}</td>
                          <td style={{ padding: '11px 14px', color: row.preferredCount > 0 ? GOLD : '#94a3b8', fontWeight: row.preferredCount > 0 ? 700 : 400 }}>{row.preferredCount}</td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>{row.contactCount}</td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>{row.catalogCount}</td>
                          <td style={{ padding: '11px 14px', color: '#475569' }}>{row.certificationCount}</td>
                          <td style={{ padding: '11px 14px', color: row.missingCountryCount > 0 ? '#d97706' : '#94a3b8', fontWeight: row.missingCountryCount > 0 ? 700 : 400 }}>{row.missingCountryCount}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <button
                              onClick={() => onGoToFilteredList?.({ category: row.category })}
                              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              {t.viewSuppliers}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 区域5：待补资料 ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.05)', overflow: 'hidden' }}>
          {/* Tab switcher — only pending tab shown as primary */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${CARD_BORDER}`, padding: '0 24px' }}>
            <button
              onClick={() => setActiveTab('pending')}
              style={{
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 700,
                color: NAVY,
                border: 'none',
                borderBottom: `2px solid ${GOLD}`,
                background: 'none',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.pendingTabLabel(filteredPending.length)}
            </button>

            {/* Active chart filter indicators */}
            {(selectedCountry || selectedCategory) && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                {selectedCountry && (
                  <span style={{ background: '#e8f0fa', color: NAVY, borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                    {t.countryFilterChip(selectedCountry === '未填写' ? t.notSpecified : selectedCountry)}
                    <button onClick={() => setSelectedCountry(null)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>✕</button>
                  </span>
                )}
                {selectedCategory && (
                  <span style={{ background: '#e8f0fa', color: NAVY, borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                    {t.categoryFilterChip(selectedCategory === '未分类' ? t.uncategorized : selectedCategory)}
                    <button onClick={() => setSelectedCategory(null)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700 }}>✕</button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── 待补资料 ──────────────────────────────────────────────── */}
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
                    {t.preferredFirst}
                  </label>
                  {(activeFlags.size > 0 || preferredFirst) && (
                    <button
                      onClick={() => { setActiveFlags(new Set()); setPreferredFirst(false); }}
                      style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {t.clearFilters}
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f3ef' }}>
                      {[t.pendingColName, t.pendingColCode, t.pendingColLocation, t.pendingColCategory, t.pendingColContact, t.pendingColPreferred, t.pendingColCompleteness, t.pendingColMissing, t.pendingColAction].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                          {t.noMatchingSuppliers}
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
                          {s.country ?? <span style={{ fontStyle: 'italic' }}>{t.missingCountryInline}</span>}
                          {s.city && <span style={{ color: '#94a3b8' }}> / {s.city}</span>}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', maxWidth: 160 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.product_categories.length > 0 ? s.product_categories.join(', ') : <span style={{ color: '#dc2626', fontStyle: 'italic' }}>{t.missingCategoryInline}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: s.primaryContact ? '#475569' : '#dc2626' }}>
                          {s.primaryContact?.name ?? (s.primaryContact ? '—' : <span style={{ fontStyle: 'italic' }}>{t.missingContactInline}</span>)}
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
                            {t.fixInfoBtn}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredPending.length > 0 && (
                <div style={{ padding: '10px 24px', fontSize: 11, color: '#94a3b8', borderTop: `1px solid ${CARD_BORDER}` }}>
                  {t.showingCountLabel(filteredPending.length, pendingCleanup.length)}
                </div>
              )}
            </div>
          )}
        </div>
        {/* ── 区域6：数据维护（重复供应商，折叠，低优先级）─────────── */}
        {activeDuplicates.length > 0 && (
            <div style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
              <button
                onClick={() => setDupSectionOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                  {t.dupSectionTitle(activeDuplicates.length)}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{dupSectionOpen ? t.dupCollapse : t.dupExpand}</span>
              </button>
              {dupSectionOpen && (
                <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16, borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 16 }}>
                  {activeDuplicates.map(group => (
                    <div key={group.groupId} style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ background: '#f8fafc', padding: '8px 16px', fontSize: 11, color: '#64748b', fontWeight: 600, borderBottom: `1px solid ${CARD_BORDER}` }}>
                        {group.reason} · {t.dupRecordsLabel(group.records.length)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.records.length}, 1fr)`, gap: 0 }}>
                        {group.records.map((rec, idx) => (
                          <div key={rec.id} style={{ padding: '14px 18px', borderLeft: idx > 0 ? `1px solid ${CARD_BORDER}` : 'none' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, marginBottom: 8 }}>{rec.supplier_name_display}</div>
                            <table style={{ fontSize: 11, color: '#475569', width: '100%', borderCollapse: 'collapse' }}>
                              <tbody>
                                {[
                                  [t.dupColCode, rec.short_code],
                                  [t.dupColCountry, rec.country ?? '—'],
                                  [t.dupColSource, rec.import_source],
                                  [t.dupColContact, rec.hasContact ? (rec.contactName ?? t.contactHas) : t.contactNone],
                                  [t.dupColCreatedAt, rec.created_at ? rec.created_at.slice(0, 10) : '—'],
                                ].map(([k, v]) => (
                                  <tr key={k}>
                                    <td style={{ padding: '2px 0', color: '#94a3b8', width: 56, verticalAlign: 'top' }}>{k}</td>
                                    <td style={{ padding: '2px 0', fontWeight: 500 }}>{v}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                              <button onClick={() => onOpenDetail(rec.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontWeight: 600 }}>{t.viewBtn}</button>
                              {confirmArchiveId === rec.id ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 10, color: '#dc2626' }}>{t.confirmArchiveQ}</span>
                                  <button onClick={() => handleArchive(rec.id)} disabled={archivingId === rec.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{archivingId === rec.id ? t.archiving : t.confirmBtn}</button>
                                  <button onClick={() => setConfirmArchiveId(null)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}>{t.cancelBtn}</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmArchiveId(rec.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>{t.archiveBtn}</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        )}
      </div>

      {/* Archive confirmation dialog */}
      {confirmArchiveId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: NAVY, marginBottom: 10 }}>{t.archiveDialogTitle}</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
              {t.archiveDialogDesc}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmArchiveId(null)} style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>{t.cancelBtn}</button>
              <button
                onClick={() => handleArchive(confirmArchiveId)}
                disabled={!!archivingId}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {archivingId ? t.archiving : t.confirmArchiveBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
