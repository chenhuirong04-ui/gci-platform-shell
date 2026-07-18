import React, { useState, useCallback } from 'react';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const CARD_BORDER = '#e8e0d0';
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

// ── Types ────────────────────────────────────────────────────────────────────

type ImportStatus = 'new' | 'exists' | 'duplicate_suspect';

interface NotionImportItem {
  notionPageId: string;
  name: string;
  supplierCode: string;
  supplierType: string;
  country: string | null;
  city: string | null;
  countryRaw: string;
  categories: string[];
  isPreferred: boolean;
  status: string;
  contactName: string;
  contactRaw: string;
  whatsapp: string | null;
  wechat: string | null;
  email: string;
  website: string;
  strengthNotes: string;
  certificates: string[];
  attachmentCount: number;
  importStatus: ImportStatus;
  duplicateReason: string | null;
  existingSupplierId?: string;
}

interface PreviewStats {
  total: number;
  toCreate: number;
  alreadyExists: number;
  suspectDuplicate: number;
  missingName: number;
  missingContact: number;
  missingCategory: number;
  hasAttachments: number;
  hasCertificates: number;
}

interface ImportResult {
  notionPageId: string;
  supplierName: string;
  supplierId?: string;
  result: 'created' | 'skipped' | 'failed';
  error?: string;
  warnings: string[];
  contactsCreated: number;
  certsCreated: number;
  docsCreated: number;
  docsFailedDownload: number;
}

type DuplicateAction = 'create_new' | 'skip';

interface Props {
  onBack: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '14px 18px', minWidth: 100 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? NAVY }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ImportStatus }) {
  const map: Record<ImportStatus, { label: string; bg: string; text: string }> = {
    new:               { label: '可导入', bg: '#dcfce7', text: '#166534' },
    exists:            { label: '已存在', bg: '#f1f5f9', text: '#475569' },
    duplicate_suspect: { label: '疑似重复', bg: '#fef9ec', text: '#92400e' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotionImportPage({ onBack }: Props) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'preview' | 'importing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [items, setItems] = useState<NotionImportItem[]>([]);

  // Selection state: pageId → checked (only 'new' items can be checked; 'exists' always off; 'duplicate_suspect' default off)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Duplicate action choices: pageId → 'create_new' | 'skip'
  const [dupActions, setDupActions] = useState<Map<string, DuplicateAction>>(new Map());

  // Filter state
  const [filterStatus, setFilterStatus] = useState<ImportStatus | 'all'>('all');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPreferred, setFilterPreferred] = useState(false);

  // Import progress
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  // ── Load preview ────────────────────────────────────────────────────────────
  const loadPreview = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/suppliers/notion-import-preview`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Preview failed');
      setStats(data.stats);
      setItems(data.items);
      // Default: check all 'new' items
      const defaultSelected = new Set<string>();
      for (const item of data.items as NotionImportItem[]) {
        if (item.importStatus === 'new') defaultSelected.add(item.notionPageId);
      }
      setSelected(defaultSelected);
      // Default duplicate actions: all 'skip'
      const defaultDupActions = new Map<string, DuplicateAction>();
      for (const item of data.items as NotionImportItem[]) {
        if (item.importStatus === 'duplicate_suspect') defaultDupActions.set(item.notionPageId, 'skip');
      }
      setDupActions(defaultDupActions);
      setPhase('preview');
    } catch (e: any) {
      setError(e?.message ?? '加载失败');
      setPhase('idle');
    }
  }, []);

  // ── Toggle selection ─────────────────────────────────────────────────────────
  const toggleItem = (pageId: string, status: ImportStatus) => {
    if (status === 'exists') return; // cannot select
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const all = new Set(filteredItems.filter(i => i.importStatus !== 'exists').map(i => i.notionPageId));
      setSelected(all);
    } else {
      setSelected(new Set());
    }
  };

  const setDupAction = (pageId: string, action: DuplicateAction) => {
    setDupActions(prev => new Map(prev).set(pageId, action));
    if (action === 'skip') {
      setSelected(prev => { const next = new Set(prev); next.delete(pageId); return next; });
    } else {
      setSelected(prev => new Set(prev).add(pageId));
    }
  };

  // ── Filtered items ───────────────────────────────────────────────────────────
  const countries = [...new Set(items.map(i => i.country).filter(Boolean))] as string[];
  const allCategories = [...new Set(items.flatMap(i => i.categories))].sort();

  const filteredItems = items.filter(item => {
    if (filterStatus !== 'all' && item.importStatus !== filterStatus) return false;
    if (filterCountry && item.country !== filterCountry) return false;
    if (filterCategory && !item.categories.includes(filterCategory)) return false;
    if (filterPreferred && !item.isPreferred) return false;
    return true;
  });

  // ── Run import ────────────────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    // Build items to import
    const toImport: Array<{ pageId: string; duplicateAction: DuplicateAction }> = [];
    for (const item of items) {
      if (item.importStatus === 'exists') continue;
      if (!selected.has(item.notionPageId)) continue;
      const dupAction = item.importStatus === 'duplicate_suspect'
        ? (dupActions.get(item.notionPageId) ?? 'skip')
        : 'create_new';
      toImport.push({ pageId: item.notionPageId, duplicateAction: dupAction });
    }

    if (toImport.length === 0) return;

    setPhase('importing');
    setImportResults([]);
    setImportProgress(0);
    setImportTotal(toImport.length);

    // Split into batches of 5
    const allResults: ImportResult[] = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${API_BASE}/api/suppliers/notion-import-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch }),
        });
        const data = await res.json();
        if (data.details) {
          allResults.push(...data.details);
          setImportResults(prev => [...prev, ...data.details]);
        }
      } catch (e: any) {
        // Mark entire batch as failed
        for (const b of batch) {
          allResults.push({
            notionPageId: b.pageId,
            supplierName: '',
            result: 'failed',
            error: e?.message ?? 'Network error',
            warnings: [],
            contactsCreated: 0,
            certsCreated: 0,
            docsCreated: 0,
            docsFailedDownload: 0,
          });
        }
        setImportResults(prev => [...prev, ...allResults.slice(prev.length)]);
      }
      setImportProgress(Math.min(i + BATCH_SIZE, toImport.length));
    }

    setPhase('done');
  }, [items, selected, dupActions]);

  // ── Selection count for current filter ──────────────────────────────────────
  const selectedInView = filteredItems.filter(i => selected.has(i.notionPageId)).length;
  const selectableInView = filteredItems.filter(i => i.importStatus !== 'exists').length;

  // ── Report summary ───────────────────────────────────────────────────────────
  const reportCreated = importResults.filter(r => r.result === 'created').length;
  const reportSkipped = importResults.filter(r => r.result === 'skipped').length;
  const reportFailed = importResults.filter(r => r.result === 'failed').length;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: 'calc(100vh - 49px)', background: '#f5f3ef', padding: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          ← 返回列表
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>从 Notion 导入供应商</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>读取 Notion 供应商数据库，与现有记录比对，按需导入</div>
        </div>
      </div>

      {/* Idle state */}
      {phase === 'idle' && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '48px', textAlign: 'center' }}>
          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ fontSize: 32, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>读取 Notion 供应商数据库</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            将读取全部 Notion 供应商记录，与现有数据库比对幂等性，返回分类预览。不会自动写入任何数据。
          </div>
          <button
            onClick={loadPreview}
            style={{ padding: '11px 32px', borderRadius: 10, background: NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            读取 Notion 数据
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>正在读取 Notion 数据库（含分页）…</div>
          <div style={{ marginTop: 16, height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: GOLD, width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {/* Preview */}
      {(phase === 'preview' || phase === 'done') && stats && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label="Notion 总记录" value={stats.total} />
            <StatCard label="可新增" value={stats.toCreate} color="#166534" />
            <StatCard label="已存在（跳过）" value={stats.alreadyExists} color="#475569" />
            <StatCard label="疑似重复" value={stats.suspectDuplicate} color="#92400e" />
            <StatCard label="有附件" value={stats.hasAttachments} />
            <StatCard label="有证书" value={stats.hasCertificates} />
            <StatCard label="缺联系方式" value={stats.missingContact} color={stats.missingContact > 0 ? '#dc2626' : undefined} />
          </div>

          {/* Filter bar */}
          <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {(['all', 'new', 'exists', 'duplicate_suspect'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${filterStatus === s ? NAVY : CARD_BORDER}`,
                  background: filterStatus === s ? NAVY : '#fff', color: filterStatus === s ? '#fff' : '#475569',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {s === 'all' ? '全部' : s === 'new' ? '可新增' : s === 'exists' ? '已存在' : '疑似重复'}
              </button>
            ))}
            <select
              value={filterCountry}
              onChange={e => setFilterCountry(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 12, color: NAVY }}
            >
              <option value="">全部国家</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 12, color: NAVY }}
            >
              <option value="">全部品类</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={filterPreferred} onChange={e => setFilterPreferred(e.target.checked)} />
              仅常用
            </label>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
              已选 <strong style={{ color: NAVY }}>{selected.size}</strong> 家
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f3ef' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${CARD_BORDER}` }}>
                      <input
                        type="checkbox"
                        checked={selectableInView > 0 && selectedInView === selectableInView}
                        onChange={e => toggleAll(e.target.checked)}
                      />
                    </th>
                    {['供应商名称', '编码', '类型', '位置', '品类', '联系人', '证书', '附件', '状态', '操作'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${CARD_BORDER}`, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const isExists = item.importStatus === 'exists';
                    const isDup = item.importStatus === 'duplicate_suspect';
                    const isChecked = selected.has(item.notionPageId);
                    const dupAction = dupActions.get(item.notionPageId) ?? 'skip';

                    return (
                      <tr
                        key={item.notionPageId}
                        style={{
                          background: isExists ? '#fafafa' : isChecked ? '#f0fdf4' : '#fff',
                          opacity: isExists ? 0.6 : 1,
                          borderBottom: idx < filteredItems.length - 1 ? `1px solid ${CARD_BORDER}` : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked && !isExists}
                            disabled={isExists}
                            onChange={() => toggleItem(item.notionPageId, item.importStatus)}
                          />
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY, maxWidth: 200 }}>
                          <div>{item.name}</div>
                          {item.isPreferred && <span style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>★ 常用</span>}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{item.supplierCode || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{item.supplierType || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>
                          {item.country
                            ? <>{item.country}{item.city ? ` · ${item.city}` : ''}</>
                            : <span style={{ color: '#94a3b8' }}>{item.countryRaw || '—'}</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, maxWidth: 160 }}>
                          {item.categories.length > 0
                            ? item.categories.slice(0, 3).join(', ') + (item.categories.length > 3 ? `+${item.categories.length - 3}` : '')
                            : <span style={{ color: '#94a3b8' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>
                          {item.contactName || <span style={{ color: '#94a3b8' }}>—</span>}
                          {(item.whatsapp || item.wechat || item.email) && (
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                              {item.whatsapp && `WA: ${item.whatsapp.slice(0, 12)}`}
                              {item.wechat && `WX: ${item.wechat.slice(0, 12)}`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>
                          {item.certificates.length > 0 ? item.certificates.slice(0, 2).join(', ') : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'center' }}>
                          {item.attachmentCount > 0
                            ? <span style={{ background: '#f0f9ff', color: '#0369a1', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>{item.attachmentCount}</span>
                            : <span style={{ color: '#94a3b8' }}>0</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <StatusBadge status={item.importStatus} />
                          {isDup && item.duplicateReason && (
                            <div style={{ fontSize: 10, color: '#92400e', marginTop: 2 }}>{item.duplicateReason}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', minWidth: 120 }}>
                          {isDup && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => setDupAction(item.notionPageId, 'skip')}
                                style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${dupAction === 'skip' ? '#dc2626' : CARD_BORDER}`, background: dupAction === 'skip' ? '#fee2e2' : '#fff', color: dupAction === 'skip' ? '#dc2626' : '#475569', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                              >
                                跳过
                              </button>
                              <button
                                onClick={() => setDupAction(item.notionPageId, 'create_new')}
                                style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${dupAction === 'create_new' ? GOLD : CARD_BORDER}`, background: dupAction === 'create_new' ? '#fef9ec' : '#fff', color: dupAction === 'create_new' ? '#92400e' : '#475569', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                              >
                                仍新增
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        当前筛选条件下无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action bar */}
          {phase === 'preview' && (
            <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>
                已勾选 <strong style={{ color: NAVY }}>{selected.size}</strong> 家供应商，将分 {Math.ceil(selected.size / 5)} 批导入（每批最多5家）
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button
                  onClick={loadPreview}
                  style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  重新读取
                </button>
                <button
                  onClick={runImport}
                  disabled={selected.size === 0}
                  style={{ padding: '9px 24px', borderRadius: 10, background: selected.size === 0 ? '#94a3b8' : NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}
                >
                  开始导入 ({selected.size} 家)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Importing progress */}
      {phase === 'importing' && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '32px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
            正在导入… {importProgress} / {importTotal}
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ height: '100%', background: GOLD, width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%`, transition: 'width 0.4s ease', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>每批最多5家，分批完成后汇总报告。请勿关闭页面。</div>
        </div>
      )}

      {/* Done — Report */}
      {phase === 'done' && (
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '24px', marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 16 }}>导入报告</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="成功新增" value={reportCreated} color="#166534" />
            <StatCard label="已跳过" value={reportSkipped} color="#475569" />
            <StatCard label="失败" value={reportFailed} color={reportFailed > 0 ? '#dc2626' : undefined} />
            <StatCard label="联系人" value={importResults.reduce((s, r) => s + r.contactsCreated, 0)} />
            <StatCard label="认证记录" value={importResults.reduce((s, r) => s + r.certsCreated, 0)} />
            <StatCard label="文件记录" value={importResults.reduce((s, r) => s + r.docsCreated, 0)} />
            <StatCard label="附件待上传" value={importResults.reduce((s, r) => s + r.docsFailedDownload, 0)} color="#92400e" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f5f3ef' }}>
                  {['供应商名称', '结果', '联系人', '认证', '文件', '警告'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, borderBottom: `1px solid ${CARD_BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importResults.map((r, idx) => (
                  <tr key={r.notionPageId} style={{ borderBottom: idx < importResults.length - 1 ? `1px solid ${CARD_BORDER}` : undefined }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: NAVY }}>{r.supplierName || r.notionPageId.slice(0, 8)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: r.result === 'created' ? '#dcfce7' : r.result === 'skipped' ? '#f1f5f9' : '#fee2e2',
                        color: r.result === 'created' ? '#166534' : r.result === 'skipped' ? '#475569' : '#991b1b',
                      }}>
                        {r.result === 'created' ? '✓ 已新增' : r.result === 'skipped' ? '— 跳过' : '✗ 失败'}
                      </span>
                      {r.error && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{r.error}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.contactsCreated || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.certsCreated || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.docsCreated || '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: '#64748b', maxWidth: 260 }}>
                      {r.warnings.length > 0 ? r.warnings.join(' / ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button
              onClick={onBack}
              style={{ padding: '9px 20px', borderRadius: 10, background: NAVY, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              返回供应商列表
            </button>
            <button
              onClick={loadPreview}
              style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${CARD_BORDER}`, background: '#fff', color: NAVY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              重新读取 Notion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
