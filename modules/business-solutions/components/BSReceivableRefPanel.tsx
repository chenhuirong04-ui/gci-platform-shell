import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { BSLang } from '../types';

// Uses the same project URL/anon key — supabase-js picks up the auth session
// stored in localStorage by the main app client (same storage key = same session)
const _supa = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL as string,
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string
);

interface RefRecord {
  ref_biz_id: string;
  receivable_id: string;
  invoice_draft_id: string;
  notes?: string;
}

interface InvoiceDraft {
  id: string;
  invoice_no: string;
  invoice_date: string;
  currency: string;
  total: number;
  status: string;
  customer_name: string;
}

interface LinkedItem {
  ref: RefRecord;
  invoice: InvoiceDraft | null;
}

interface Props {
  lang: BSLang;
  receivableId: string;
  quoteId?: string;
  customerId?: string;
  customerName: string;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

const INV_STATUS: Record<string, { zh: string; en: string; color: string }> = {
  draft:            { zh: '草稿',   en: 'Draft',    color: '#94a3b8' },
  waiting_approval: { zh: '待审批', en: 'Pending',  color: '#d97706' },
  approved:         { zh: '已批准', en: 'Approved', color: '#3b82f6' },
  issued:           { zh: '已开出', en: 'Issued',   color: '#6366f1' },
  paid:             { zh: '已收款', en: 'Paid',     color: '#16a34a' },
  cancelled:        { zh: '已取消', en: 'Cancelled',color: '#94a3b8' },
};

function fmtMoney(n: number, cur: string) {
  return `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BSReceivableRefPanel({ lang, receivableId, quoteId, customerId, customerName, onToast }: Props) {
  const isZh = lang === 'zh';
  const [linked, setLinked] = useState<LinkedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InvoiceDraft[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const loadRefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: refRows, error } = await _supa
        .from('service_receivable_refs')
        .select('id, payload')
        .eq('state', 'active')
        .filter('payload->>receivable_id', 'eq', receivableId);

      if (error) {
        // Table doesn't exist yet
        if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
          setTableMissing(true);
          return;
        }
        return;
      }

      if (!refRows?.length) { setLinked([]); return; }

      const items: LinkedItem[] = await Promise.all(
        (refRows as { id: string; payload: Record<string, string> }[]).map(async row => {
          const ref: RefRecord = {
            ref_biz_id: row.payload.id,
            receivable_id: row.payload.receivable_id,
            invoice_draft_id: row.payload.invoice_draft_id,
            notes: row.payload.notes,
          };
          const { data: invData } = await _supa
            .from('invoice_drafts')
            .select('id, invoice_no, invoice_date, currency, total, status, customer_name')
            .eq('id', ref.invoice_draft_id)
            .single();
          return { ref, invoice: invData as InvoiceDraft | null };
        })
      );
      setLinked(items);
    } catch {
      setTableMissing(true);
    } finally {
      setLoading(false);
    }
  }, [receivableId]);

  useEffect(() => { loadRefs(); }, [loadRefs]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const { data } = await _supa
        .from('invoice_drafts')
        .select('id, invoice_no, invoice_date, currency, total, status, customer_name')
        .ilike('invoice_no', `%${searchTerm.trim()}%`)
        .limit(8);
      setSearchResults((data as InvoiceDraft[]) || []);
    } finally {
      setSearching(false);
    }
  };

  const handleLink = async (inv: InvoiceDraft) => {
    if (linked.some(l => l.ref.invoice_draft_id === inv.id)) {
      onToast?.(isZh ? '该发票已关联' : 'Already linked', 'info');
      return;
    }
    setLinking(true);
    try {
      const res = await fetch('/api/bs/service-receivable-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          receivable_id: receivableId,
          invoice_draft_id: inv.id,
          quote_id: quoteId,
          customer_id: customerId,
          created_by: 'user',
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        onToast?.(
          data.error === 'duplicate_ref'
            ? (isZh ? '该发票已关联' : 'Already linked')
            : (isZh ? '关联失败' : 'Link failed'),
          data.error === 'duplicate_ref' ? 'info' : 'error'
        );
        return;
      }
      onToast?.(isZh ? '发票已关联' : 'Invoice linked', 'success');
      setShowSearch(false);
      setSearchTerm('');
      setSearchResults([]);
      await loadRefs();
    } catch {
      onToast?.(isZh ? '网络错误' : 'Network error', 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (refBizId: string) => {
    setUnlinking(refBizId);
    try {
      const res = await fetch('/api/bs/service-receivable-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ref_id: refBizId }),
      });
      const data = await res.json();
      if (!data.ok) { onToast?.(isZh ? '解除关联失败' : 'Unlink failed', 'error'); return; }
      onToast?.(isZh ? '已解除关联' : 'Unlinked', 'success');
      await loadRefs();
    } catch {
      onToast?.(isZh ? '网络错误' : 'Network error', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  // ── Table not yet migrated ────────────────────────────────────────────────────
  if (tableMissing) {
    return (
      <div className="mt-3 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e' }}>
        ⚠ {isZh
          ? '发票关联模块尚未初始化。请先在 Supabase SQL Editor 执行 service_receivable_refs 迁移，再使用此功能。'
          : 'Invoice linking module not initialized. Run the service_receivable_refs migration in Supabase SQL Editor first.'}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: '#e0d8cc' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#f5f0e8' }}>
        <div className="text-xs font-bold" style={{ color: NAVY }}>
          {isZh ? '关联 Tax Invoice' : 'Linked Tax Invoices'}
          {linked.length > 0 && <span className="ml-1.5 text-gray-400">({linked.length})</span>}
        </div>
        {!showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs px-2.5 py-1 rounded-md font-semibold"
            style={{ background: GOLD + '22', color: NAVY }}
          >
            {isZh ? '+ 关联发票' : '+ Link Invoice'}
          </button>
        )}
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="px-4 py-3 bg-white border-b" style={{ borderColor: '#e8e0d0' }}>
          <p className="text-xs text-gray-400 mb-2">
            {isZh
              ? '请先在「发票」模块创建 Tax Invoice，再在此处输入发票编号进行关联。'
              : 'Create a Tax Invoice in the Invoice module first, then search by invoice number to link it here.'}
          </p>
          <div className="flex gap-2">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={isZh ? '输入发票编号，如：GCI-2026-001' : 'Invoice no., e.g. GCI-2026-001'}
              className="flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
              style={{ borderColor: '#d1c9b8' }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: NAVY, color: 'white' }}
            >
              {searching ? '…' : (isZh ? '搜索' : 'Search')}
            </button>
            <button
              onClick={() => { setShowSearch(false); setSearchTerm(''); setSearchResults([]); }}
              className="text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: '#f0ede8', color: '#64748b' }}
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: '#e8e0d0' }}>
              {searchResults.map((inv, i) => {
                const sl = INV_STATUS[inv.status] || INV_STATUS.draft;
                const alreadyLinked = linked.some(l => l.ref.invoice_draft_id === inv.id);
                return (
                  <div
                    key={inv.id}
                    className={`px-3 py-2 flex items-center justify-between bg-white ${i > 0 ? 'border-t' : ''}`}
                    style={{ borderColor: '#f0ede8' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate" style={{ color: NAVY }}>{inv.invoice_no}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {inv.customer_name} · {inv.invoice_date} · {fmtMoney(inv.total, inv.currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: sl.color + '18', color: sl.color }}>
                        {isZh ? sl.zh : sl.en}
                      </span>
                      {alreadyLinked ? (
                        <span className="text-xs text-green-600">✓ {isZh ? '已关联' : 'Linked'}</span>
                      ) : (
                        <button
                          onClick={() => handleLink(inv)}
                          disabled={linking}
                          className="text-xs px-2.5 py-1 rounded-md font-medium"
                          style={{ background: NAVY, color: 'white' }}
                        >
                          {linking ? '…' : (isZh ? '关联' : 'Link')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {searchResults.length === 0 && searchTerm && !searching && (
            <div className="mt-2 text-xs text-center text-gray-400 py-2">
              {isZh ? '未找到匹配发票，请先在发票模块创建。' : 'No matching invoice. Create it in the Invoice module first.'}
            </div>
          )}
        </div>
      )}

      {/* Linked list */}
      {loading ? (
        <div className="text-xs text-gray-400 text-center py-3 bg-white">{isZh ? '加载中…' : 'Loading…'}</div>
      ) : linked.length === 0 && !showSearch ? (
        <div className="text-xs text-gray-400 text-center py-3 bg-white">
          {isZh ? '暂未关联任何 Tax Invoice' : 'No Tax Invoices linked yet'}
        </div>
      ) : (
        linked.map(({ ref, invoice }, idx) => {
          const sl = invoice ? (INV_STATUS[invoice.status] || INV_STATUS.draft) : null;
          return (
            <div
              key={ref.ref_biz_id}
              className={`px-4 py-2.5 flex items-start gap-3 bg-white ${idx > 0 ? 'border-t' : ''}`}
              style={{ borderColor: '#f0ede8' }}
            >
              {invoice ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-bold" style={{ color: NAVY }}>{invoice.invoice_no}</span>
                      {sl && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: sl.color + '18', color: sl.color }}>
                          {isZh ? sl.zh : sl.en}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{invoice.invoice_date}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {invoice.customer_name} · {fmtMoney(invoice.total, invoice.currency)}
                      {ref.notes && <span className="ml-1 text-gray-400">· {ref.notes}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlink(ref.ref_biz_id)}
                    disabled={unlinking === ref.ref_biz_id}
                    className="text-xs px-2 py-1 rounded-md flex-shrink-0"
                    style={{ background: '#fef2f2', color: '#dc2626' }}
                  >
                    {unlinking === ref.ref_biz_id ? '…' : (isZh ? '解除关联' : 'Unlink')}
                  </button>
                </>
              ) : (
                <div className="flex-1 text-xs text-gray-400">
                  {isZh ? `发票数据无法读取 (${ref.invoice_draft_id})` : `Invoice not readable (${ref.invoice_draft_id})`}
                  <button
                    onClick={() => handleUnlink(ref.ref_biz_id)}
                    className="ml-2 underline text-red-400 hover:text-red-600"
                  >
                    {isZh ? '解除关联' : 'Unlink'}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
