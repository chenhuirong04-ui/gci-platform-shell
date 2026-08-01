/**
 * ConsignmentManager — 寄售管理台账
 * Storage: localStorage('icare_consignment')
 * TODO: Migrate to Supabase table 'consignment_records'
 *   Schema: id, customer_name, product_name, sku, consign_date, consign_qty,
 *           sold_qty, unit_price, settled_amount, expected_settle_date,
 *           note, created_at, updated_at
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Edit3, Trash2, Save, X, Truck
} from 'lucide-react';
import { persistence } from '../services/persistenceService';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

// ── Types ──────────────────────────────────────────────────────────────────
export interface ConsignmentRecord {
  id: string;
  customerName: string;
  productName: string;
  sku: string;
  consignDate: string;
  consignQty: number;
  soldQty: number;
  unitPrice: number;
  settledAmount: number;
  expectedSettleDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

type ConStatus = 'active' | 'partial' | 'settled' | 'overdue' | 'exception';

// ── Storage ─────────────────────────────────────────────────────────────────
// TODO: Replace with Supabase upsert/query when consignment_records table is ready
const STORAGE_KEY = 'icare_consignment';
const loadRecords  = (): ConsignmentRecord[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};
const saveRecords = (records: ConsignmentRecord[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

// ── Helpers ──────────────────────────────────────────────────────────────────
const genId     = () => `CON-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
const today     = () => new Date().toISOString().split('T')[0];
const daysSince = (d: string) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;
const fmt2      = (n: number) => Number(n || 0).toFixed(2);
const r2        = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const computeStatus = (rec: ConsignmentRecord): ConStatus => {
  const consignAmt = r2((Number(rec.consignQty) || 0) * (Number(rec.unitPrice) || 0));
  if (r2(Number(rec.settledAmount) || 0) >= consignAmt && consignAmt > 0) return 'settled';
  const days = daysSince(rec.consignDate);
  if (days > 90) return 'overdue';
  if ((Number(rec.settledAmount) || 0) > 0) return 'partial';
  return 'active';
};

// Display-only label mapping for the in-app-computed ConStatus enum
// (never persisted; the underlying record data is untouched).
type ConsignmentDict = {
  statusActiveManual: string; statusPartialManual: string; statusSettledManual: string;
  statusOverdue: string; statusException: string;
};
const statusLabel = (t: ConsignmentDict): Record<ConStatus, string> => ({
  active:    t.statusActiveManual,
  partial:   t.statusPartialManual,
  settled:   t.statusSettledManual,
  overdue:   t.statusOverdue,
  exception: t.statusException,
});
// Status pill colors -- mapped onto the 5 allowed status colors (info/
// warning/success/danger/neutral) instead of ad-hoc Tailwind blue/amber/
// emerald/red.
const STATUS_CLASS: Record<ConStatus, string> = {
  active:   'bg-[#8FA6D4]/15 text-[#4A6090] border-[#8FA6D4]/30',
  partial:  'bg-[#D9B45A]/15 text-[#8A6D2F] border-[#D9B45A]/30',
  settled:  'bg-[#6FBF8E]/15 text-[#3F7D58] border-[#6FBF8E]/30',
  overdue:  'bg-[#E0846A]/15 text-[#A85D45] border-[#E0846A]/30',
  exception:'bg-gray-100  text-gray-600   border-gray-200',
};

const ROW_BG: Record<ConStatus, string> = {
  active:   '',
  partial:  '',
  settled:  'bg-[#6FBF8E]/5',
  overdue:  'bg-[#E0846A]/5',
  exception:'bg-gray-50',
};

const EMPTY_FORM: Omit<ConsignmentRecord, 'id' | 'createdAt' | 'updatedAt'> = {
  customerName: '', productName: '', sku: '',
  consignDate: today(), consignQty: 0, soldQty: 0,
  unitPrice: 0, settledAmount: 0, expectedSettleDate: '', note: '',
};

// ── Component ─────────────────────────────────────────────────────────────────
const ConsignmentManager: React.FC = () => {
  const { dict } = useI18n();
  const t = dict.trade.consignment;
  const STATUS_LABEL = statusLabel(t);
  const [records, setRecords]       = useState<ConsignmentRecord[]>([]);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState<'ALL' | ConStatus>('ALL');
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── SO自动生成寄售库存（来源：icar_bookkeeping_consignment_stock）─────────
  const [soConsignStock, setSoConsignStock] = useState<any[]>([]);

  // Quick-input modal: update soldQty or settledAmount inline
  const [quickModal, setQuickModal] = useState<{
    id: string; field: 'soldQty' | 'settledAmount'; label: string; current: number;
  } | null>(null);
  const [quickVal, setQuickVal]     = useState('');

  // SO寄售库存 销售登记 / 校正 modal
  const [editingStock, setEditingStock] = useState<any | null>(null);
  const [editStockForm, setEditStockForm] = useState({
    soldQty: 0, remainingQty: 0, receivedAmount: 0,
    settlementStatus: 'UNSETTLED' as 'UNSETTLED' | 'PARTIAL' | 'SETTLED',
    memo: '',
  });

  useEffect(() => {
    setRecords(loadRecords());
    persistence.getConsignmentStock()
      .then(stock => setSoConsignStock(stock))
      .catch(() => setSoConsignStock([]));
  }, []);

  const persist = useCallback((next: ConsignmentRecord[]) => {
    setRecords(next);
    saveRecords(next);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => {
      const matchSearch = !q ||
        r.customerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || computeStatus(r) === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records, search, statusFilter]);

  const summary = useMemo(() => {
    const totalOut = r2(records
      .filter(r => computeStatus(r) !== 'settled')
      .reduce((s, r) => {
        const amt = r2((Number(r.consignQty) || 0) * (Number(r.unitPrice) || 0));
        return s + r2(amt - (Number(r.settledAmount) || 0));
      }, 0));
    const count30 = records.filter(r =>
      daysSince(r.consignDate) > 30 && computeStatus(r) !== 'settled'
    ).length;
    return { totalOut, count30 };
  }, [records]);

  // ── 寄售概览 KPI（汇总 SO库存 + 手动台账）────────────────────────────────────
  const kpi = useMemo(() => {
    const so = soConsignStock.reduce(
      (a, r) => {
        const rem = r.remainingQty ?? Math.max(0, (Number(r.consignedQty) || 0) - (Number(r.soldQty) || 0));
        // Use tax-inclusive amount: prefer stored taxInclusiveUnitPrice; fallback unitPrice × 1.05
        const inclUnitPrice = (r as any).taxInclusiveUnitPrice ?? r2((Number(r.unitPrice) || 0) * 1.05);
        const amt = (r as any).vatIncluded
          ? (r.amount ?? r2((Number(r.consignedQty) || 0) * inclUnitPrice))
          : r2((Number(r.consignedQty) || 0) * inclUnitPrice);
        const isSettled = (r.settlementStatus || '') === 'SETTLED';
        return {
          consigned: a.consigned + (Number(r.consignedQty) || 0),
          sold:      a.sold      + (Number(r.soldQty)      || 0),
          remaining: a.remaining + rem,
          unsettled: a.unsettled + (isSettled ? 0 : amt),
        };
      },
      { consigned: 0, sold: 0, remaining: 0, unsettled: 0 }
    );
    const man = records.reduce(
      (a, r) => {
        const tot = r2((Number(r.consignQty) || 0) * (Number(r.unitPrice) || 0));
        return {
          consigned: a.consigned + (Number(r.consignQty)  || 0),
          sold:      a.sold      + (Number(r.soldQty)     || 0),
          remaining: a.remaining + Math.max(0, (Number(r.consignQty) || 0) - (Number(r.soldQty) || 0)),
          unsettled: a.unsettled + r2(Math.max(0, tot - (Number(r.settledAmount) || 0))),
          collected: a.collected + (Number(r.settledAmount) || 0),
        };
      },
      { consigned: 0, sold: 0, remaining: 0, unsettled: 0, collected: 0 }
    );
    return {
      totalConsigned: so.consigned + man.consigned,
      totalSold:      so.sold      + man.sold,
      totalRemaining: so.remaining + man.remaining,
      totalUnsettled: r2(so.unsettled + man.unsettled),
      totalCollected: r2(man.collected),
    };
  }, [soConsignStock, records]);

  // ── 按客户分组（仅 SO 自动库存）────────────────────────────────────────────
  const customerGroups = useMemo(() => {
    const map = new Map<string, {
      customerName: string;
      soNos: string[];
      totalConsigned: number;
      totalSold: number;
      totalRemaining: number;
      unsettledAmount: number;
      items: any[];
      overallStatus: 'SETTLED' | 'PARTIAL' | 'ACTIVE';
    }>();
    for (const r of soConsignStock) {
      const cn  = (r.customerName || t.unknownCustomer).trim();
      const rem = r.remainingQty ?? Math.max(0, (Number(r.consignedQty) || 0) - (Number(r.soldQty) || 0));
      // Tax-inclusive amount for client-facing display
      const inclUnitPrice = (r as any).taxInclusiveUnitPrice ?? r2((Number(r.unitPrice) || 0) * 1.05);
      const amt = (r as any).vatIncluded
        ? (r.amount ?? r2((Number(r.consignedQty) || 0) * inclUnitPrice))
        : r2((Number(r.consignedQty) || 0) * inclUnitPrice);
      const ss  = r.settlementStatus || 'UNSETTLED';
      if (!map.has(cn)) {
        map.set(cn, {
          customerName: cn, soNos: [], totalConsigned: 0, totalSold: 0,
          totalRemaining: 0, unsettledAmount: 0, items: [], overallStatus: 'ACTIVE',
        });
      }
      const g = map.get(cn)!;
      if (r.soNo && !g.soNos.includes(r.soNo)) g.soNos.push(r.soNo);
      g.totalConsigned  += Number(r.consignedQty) || 0;
      g.totalSold       += Number(r.soldQty)      || 0;
      g.totalRemaining  += rem;
      g.unsettledAmount += ss === 'SETTLED' ? 0 : amt;
      g.items.push(r);
    }
    for (const g of map.values()) {
      const allSettled = g.items.every(i => (i.settlementStatus || '') === 'SETTLED');
      g.overallStatus  = allSettled ? 'SETTLED' : g.totalSold > 0 ? 'PARTIAL' : 'ACTIVE';
    }
    return Array.from(map.values());
  }, [soConsignStock, t.unknownCustomer]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowModal(true);
  };
  const openEdit = (rec: ConsignmentRecord) => {
    const { id, createdAt, updatedAt, ...rest } = rec;
    setForm(rest);
    setEditingId(id);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleSave = () => {
    if (!form.customerName.trim()) { alert(t.customerRequiredMsg); return; }
    if (!form.productName.trim())  { alert(t.productRequiredMsg); return; }
    const now = new Date().toISOString();
    if (editingId) {
      persist(records.map(r =>
        r.id === editingId ? { ...r, ...form, updatedAt: now } : r
      ));
    } else {
      persist([{ id: genId(), ...form, createdAt: now, updatedAt: now }, ...records]);
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    persist(records.filter(r => r.id !== id));
    setDeleteConfirm(null);
  };

  const openQuick = (rec: ConsignmentRecord, field: 'soldQty' | 'settledAmount') => {
    const label = field === 'soldQty' ? t.quickLabelSold : t.quickLabelSettle;
    setQuickModal({ id: rec.id, field, label, current: Number(rec[field]) || 0 });
    setQuickVal(String(Number(rec[field]) || 0));
  };

  const handleQuickSave = () => {
    if (!quickModal) return;
    const val = Number(quickVal);
    if (isNaN(val) || val < 0) { alert(t.invalidNumberMsg); return; }
    const now = new Date().toISOString();
    persist(records.map(r =>
      r.id === quickModal.id ? { ...r, [quickModal.field]: val, updatedAt: now } : r
    ));
    setQuickModal(null);
  };

  const setF = (k: keyof typeof EMPTY_FORM, v: any) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // ── SO库存人工校正 handlers ────────────────────────────────────────────────
  const openEditStock = (item: any) => {
    setEditingStock(item);
    setEditStockForm({
      soldQty:          Number(item.soldQty)        || 0,
      remainingQty:     Number(item.remainingQty) ??
                        Math.max(0, (Number(item.consignedQty) || 0) - (Number(item.soldQty) || 0)),
      receivedAmount:   Number(item.receivedAmount) || 0,
      settlementStatus: (item.settlementStatus || 'UNSETTLED') as any,
      memo:             (item as any).memo || '',
    });
  };

  const handleSaveEditStock = async () => {
    if (!editingStock) return;
    const consignedQty  = Number(editingStock.consignedQty) || 0;
    const newSold       = Number(editStockForm.soldQty)       || 0;
    const newRemaining  = Number(editStockForm.remainingQty)  || 0;
    const newReceived   = Number(editStockForm.receivedAmount) || 0;
    if (newSold < 0 || newRemaining < 0 || newReceived < 0) {
      alert(t.negativeNotAllowedMsg); return;
    }
    if (newSold + newRemaining > consignedQty) {
      alert(t.exceedsShippedMsg.replace('{n}', String(newSold)).replace('{m}', String(newRemaining)).replace('{sum}', String(newSold + newRemaining)).replace('{total}', String(consignedQty)));
      return;
    }
    const inclUnitPrice = Number((editingStock as any).taxInclusiveUnitPrice) || r2((Number(editingStock.unitPrice) || 0) * 1.05);
    const grossValue    = r2(consignedQty * inclUnitPrice);
    if (newReceived > grossValue) {
      alert(t.exceedsGrossValueMsg.replace('{n}', fmt2(newReceived)).replace('{m}', fmt2(grossValue))); return;
    }
    await persistence.updateConsignmentStock({
      ...editingStock,
      soldQty:          newSold,
      remainingQty:     newRemaining,
      receivedAmount:   newReceived,
      settlementStatus: editStockForm.settlementStatus,
      ...(editStockForm.memo ? { memo: editStockForm.memo } as any : {}),
    });
    const fresh = await persistence.getConsignmentStock();
    setSoConsignStock(Array.isArray(fresh) ? fresh : []);
    setEditingStock(null);
  };

  // Computed display for a record
  const compute = (r: ConsignmentRecord) => {
    const consignAmt  = r2((Number(r.consignQty) || 0) * (Number(r.unitPrice) || 0));
    const remainQty   = Math.max(0, (Number(r.consignQty) || 0) - (Number(r.soldQty) || 0));
    const unsettled   = r2(Math.max(0, consignAmt - (Number(r.settledAmount) || 0)));
    const days        = daysSince(r.consignDate);
    const status      = computeStatus(r);
    return { consignAmt, remainQty, unsettled, days, status };
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#080D1E]">{t.pageTitle}</h2>
          <p className="text-sm text-gray-500 font-bold mt-1">
            {t.pendingSettlementLabel} AED {fmt2(summary.totalOut)}
            {summary.count30 > 0 && (
              <span className="ml-2" style={{ color: colors.statusWarning }}>· {t.overdueSuffix.replace('{n}', String(summary.count30))}</span>
            )}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#080D1E] text-white rounded-xl text-xs font-black uppercase tracking-wide shadow hover:bg-black transition-all"
        >
          <Plus className="w-4 h-4" />{t.addConsignment}
        </button>
      </div>

      {/* ── 第一层：寄售概览 KPI ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t.statTotalShipped,      value: kpi.totalConsigned,                    unit: t.unitItems, color: 'text-[#080D1E]'   },
          { label: t.statTotalSold,         value: kpi.totalSold,                         unit: t.unitItems, color: 'text-[#6FBF8E]' },
          { label: t.statRemainingTransit,  value: kpi.totalRemaining,                    unit: t.unitItems, color: 'text-[#CBA85C]'  },
          { label: t.statPendingAmount,     value: `AED ${fmt2(kpi.totalUnsettled)}`,     unit: '',   color: 'text-[#D9B45A]'   },
          { label: t.statReceivedAmount,    value: `AED ${fmt2(kpi.totalCollected)}`,     unit: '',   color: 'text-[#6FBF8E]' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
            <p className="text-base font-bold text-gray-500 mb-3">{k.label}</p>
            <p className={`text-4xl font-black font-mono leading-none ${k.color}`}>{k.value}</p>
            {k.unit && <p className="text-base text-gray-400 mt-2">{k.unit}</p>}
          </div>
        ))}
      </div>

      {/* ── 第二层：按客户寄售状态 ── */}
      <div className="flex items-center gap-2.5 px-1 pt-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
        <span className="text-base font-black text-gray-700">{t.customerStatusTitle}</span>
        <span className="ml-auto text-sm font-bold" style={{ color: GOLD }}>{t.customersUnit.replace('{n}', String(customerGroups.length))}</span>
      </div>

      {customerGroups.length === 0 ? (
        <div className="bg-white rounded-2xl py-16 text-center border border-gray-100 shadow-sm">
          <Truck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-base font-black text-gray-400">{t.noRecords}</p>
          <p className="text-sm text-gray-400 mt-1">{t.noRecordsHint}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {customerGroups.map(g => {
            const statusConf =
              g.overallStatus === 'SETTLED' ? { label: t.statusSettled, cls: STATUS_CLASS.settled } :
              g.overallStatus === 'PARTIAL' ? { label: t.statusPartial, cls: STATUS_CLASS.partial } :
                                              { label: t.statusActive,  cls: STATUS_CLASS.active };
            return (
              <div key={g.customerName} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                {/* 客户标题栏 */}
                <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: `${GOLD}0C`, borderBottom: `1px solid ${GOLD}20` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#080D1E] flex items-center justify-center text-white font-black text-xl shrink-0">
                      {g.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900">{g.customerName}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {g.soNos.slice(0, 3).join(' · ')}
                        {g.soNos.length > 3 && <span className="text-gray-400"> · {t.ordersMoreSuffix.replace('{n}', String(g.soNos.length - 3))}</span>}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-black border ${statusConf.cls}`}>
                    {statusConf.label}
                  </span>
                </div>

                {/* 4个核心数字 */}
                <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                  {[
                    { label: t.groupShipped,     value: g.totalConsigned,                         unit: t.unitItems, color: 'text-gray-800'    },
                    { label: t.groupSold,        value: g.totalSold,                               unit: t.unitItems, color: 'text-[#6FBF8E]' },
                    { label: t.groupRemaining,   value: g.totalRemaining,                          unit: t.unitItems, color: 'text-[#CBA85C]'  },
                    { label: t.groupReceivable,  value: `AED ${fmt2(g.unsettledAmount)}`,           unit: '',   color: g.unsettledAmount > 0 ? 'text-[#D9B45A]' : 'text-gray-400' },
                  ].map(stat => (
                    <div key={stat.label} className="px-5 py-6 text-center">
                      <p className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">{stat.label}</p>
                      <p className={`text-3xl font-black font-mono leading-none ${stat.color}`}>{stat.value}</p>
                      {stat.unit && <p className="text-base text-gray-400 mt-2">{stat.unit}</p>}
                    </div>
                  ))}
                </div>

                {/* 产品明细（简要列表，不展开） */}
                {g.items.length > 0 && (
                  <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/40">
                    <p className="text-sm font-bold text-gray-400 mb-2">{t.productDetails}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((item: any, idx: number) => {
                        const rem = item.remainingQty ?? Math.max(0, (Number(item.consignedQty) || 0) - (Number(item.soldQty) || 0));
                        const ss  = item.settlementStatus || 'UNSETTLED';
                        return (
                          <span key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 transition-colors">
                            <span className="text-base font-bold text-gray-700">{item.productName}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-base font-black" style={{ color: GOLD }}>{t.remainingUnitsPrefix} {rem} {t.unitItems}</span>
                            <span className={`text-sm font-black px-1.5 py-0.5 rounded ${
                              ss === 'SETTLED' ? 'text-[#3F7D58] bg-[#6FBF8E]/15' :
                              ss === 'PARTIAL' ? 'text-[#8A6D2F] bg-[#D9B45A]/15'     :
                                                'text-[#4A6090] bg-[#8FA6D4]/15'
                            }`}>
                              {ss === 'SETTLED' ? t.settlementSettled : ss === 'PARTIAL' ? t.settlementPartial : t.settlementUnsettled}
                            </span>
                            <button
                              onClick={() => openEditStock(item)}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                              title={t.registerSalesTooltip}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Section 2: 手动补录记录（降级保留）── */}
      <div className="flex items-center gap-2.5 px-1 pt-2">
        <div className="w-2 h-2 rounded-full bg-[#D9B45A]" />
        <span className="text-base font-black text-gray-600">{t.manualRecordsTitle}</span>
        <span className="ml-auto text-sm font-bold bg-[#D9B45A]/15 text-[#8A6D2F] border border-[#D9B45A]/30 px-3 py-0.5 rounded-full">
          {t.legacyLedgerBadge}
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#CBA85C]"
          />
        </div>
        <select
          value={statusFilter} onChange={e => setStatus(e.target.value as any)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#CBA85C]"
        >
          <option value="ALL">{t.allStatuses}</option>
          <option value="active">{t.statusActiveManual}</option>
          <option value="partial">{t.statusPartialManual}</option>
          <option value="settled">{t.statusSettledManual}</option>
          <option value="overdue">{t.statusOverdue}</option>
          <option value="exception">{t.statusException}</option>
        </select>
        <span className="text-xs font-black text-gray-500 uppercase tracking-wide">
          {t.showingXofY.replace('{shown}', String(filtered.length)).replace('{total}', String(records.length))}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">
              {records.length === 0 ? t.emptyNoRecordsCTA : t.emptyNoMatch}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[t.colCustomer, t.colProduct, t.colConsignDate, t.colConsignQty, t.colSold, t.colRemaining, t.colUnitPrice, t.colTotalAmount, t.colSettled, t.colUnsettled, t.colDays, t.colStatus, t.colActions].map((h, i) => (
                    <th key={i} className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(rec => {
                  const { consignAmt, remainQty, unsettled, days, status } = compute(rec);
                  const rowBg = ROW_BG[status];
                  const is30  = days > 30 && status !== 'settled';
                  const is90  = days > 90;
                  return (
                    <tr key={rec.id} className={`transition-colors hover:bg-gray-50/80 text-sm ${rowBg}`}>
                      <td className="px-3 py-3 font-black text-gray-800 whitespace-nowrap">{rec.customerName}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-[140px] truncate" title={rec.productName}>{rec.productName}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{rec.consignDate}</td>
                      <td className="px-3 py-3 font-mono text-gray-700">{rec.consignQty}</td>
                      <td className="px-3 py-3 font-mono text-[#3F7D58] font-black">{rec.soldQty}</td>
                      <td className="px-3 py-3 font-mono text-gray-600">{remainQty}</td>
                      <td className="px-3 py-3 font-mono text-gray-600">AED {fmt2(rec.unitPrice)}</td>
                      <td className="px-3 py-3 font-mono font-black text-[#080D1E] text-base">AED {fmt2(consignAmt)}</td>
                      <td className="px-3 py-3 font-mono text-[#3F7D58]">AED {fmt2(rec.settledAmount)}</td>
                      <td className={`px-3 py-3 font-mono font-black text-base ${is90 ? 'text-[#A85D45]' : is30 ? 'text-[#8A6D2F]' : 'text-gray-700'}`}>
                        AED {fmt2(unsettled)}
                      </td>
                      <td className={`px-3 py-3 font-mono font-black ${is90 ? 'text-[#A85D45]' : is30 ? 'text-[#CBA85C]' : 'text-gray-600'}`}>
                        {days}d
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black border ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={() => openQuick(rec, 'soldQty')}
                            className="px-2 py-1 rounded text-xs font-black border whitespace-nowrap"
                            style={{ backgroundColor: 'rgba(111,191,142,0.12)', color: '#3F7D58', borderColor: 'rgba(111,191,142,0.3)' }}
                            title={t.recordSoldTooltip}
                          >{t.soldBtn}</button>
                          <button
                            onClick={() => openQuick(rec, 'settledAmount')}
                            className="px-2 py-1 rounded text-xs font-black border whitespace-nowrap"
                            style={{ backgroundColor: `${GOLD}15`, color: '#8A6D2F', borderColor: `${GOLD}30` }}
                            title={t.recordSettleTooltip}
                          >{t.settleBtn}</button>
                          <button
                            onClick={() => openEdit(rec)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          ><Edit3 className="w-3.5 h-3.5" /></button>
                          {deleteConfirm === rec.id ? (
                            <>
                              <button onClick={() => handleDelete(rec.id)} className="px-2 py-1 text-white rounded text-xs font-black" style={{ backgroundColor: colors.statusDanger }}>{t.confirmBtn}</button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-black">{t.cancelBtn}</button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(rec.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            ><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Input Modal (已售 / 结算) ── */}
      {quickModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#080D1E]">{quickModal.label}</h3>
              <button onClick={() => setQuickModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
                {t.currentValueArrow.replace('{n}', String(quickModal.current))}
              </p>
              <input
                type="number" min={0} step={quickModal.field === 'settledAmount' ? '0.01' : '1'}
                value={quickVal} onChange={e => setQuickVal(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleQuickSave()}
                className="w-full px-4 py-3 text-lg font-black border-2 border-[#CBA85C]/40 rounded-xl focus:outline-none focus:border-[#CBA85C] text-center"
              />
              {quickModal.field === 'settledAmount' && (
                <p className="text-xs text-gray-400 mt-1 text-center">{t.unitAED}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setQuickModal(null)}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-gray-100 text-gray-600">
                {t.cancelBtn}
              </button>
              <button onClick={handleQuickSave}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-[#080D1E] text-white shadow">
                <Save className="w-3.5 h-3.5" />{t.confirmEntry}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl my-6 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#080D1E]">
                {editingId ? t.editRecordTitle : t.addRecordTitle}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t.fieldCustomer}>
                <input value={form.customerName} onChange={e => setF('customerName', e.target.value)}
                  className={INPUT} placeholder={t.customerNamePlaceholder} />
              </Field>
              <Field label={t.fieldProduct}>
                <input value={form.productName} onChange={e => setF('productName', e.target.value)}
                  className={INPUT} placeholder={t.productNamePlaceholder} />
              </Field>
              <Field label={t.fieldSku}>
                <input value={form.sku} onChange={e => setF('sku', e.target.value)}
                  className={INPUT} placeholder={t.optionalPlaceholder} />
              </Field>
              <Field label={t.fieldConsignDate}>
                <input type="date" value={form.consignDate}
                  onChange={e => setF('consignDate', e.target.value)} className={INPUT} />
              </Field>
              <Field label={t.fieldConsignQty}>
                <input type="number" min={0} value={form.consignQty}
                  onChange={e => setF('consignQty', Number(e.target.value))} className={INPUT} />
              </Field>
              <Field label={t.fieldUnitPrice}>
                <input type="number" min={0} step="0.01" value={form.unitPrice}
                  onChange={e => setF('unitPrice', Number(e.target.value))} className={INPUT} />
              </Field>
              <Field label={t.fieldSoldQty}>
                <input type="number" min={0} value={form.soldQty}
                  onChange={e => setF('soldQty', Number(e.target.value))} className={INPUT} />
              </Field>
              <Field label={t.fieldSettledAmount}>
                <input type="number" min={0} step="0.01" value={form.settledAmount}
                  onChange={e => setF('settledAmount', Number(e.target.value))} className={INPUT} />
              </Field>
              <Field label={t.fieldExpectedSettleDate}>
                <input type="date" value={form.expectedSettleDate}
                  onChange={e => setF('expectedSettleDate', e.target.value)} className={INPUT} />
              </Field>
              <Field label={t.fieldNote}>
                <input value={form.note} onChange={e => setF('note', e.target.value)}
                  className={INPUT} placeholder={t.optionalPlaceholder} />
              </Field>

              {/* Preview */}
              {form.consignQty > 0 && form.unitPrice > 0 && (
                <div className="md:col-span-2 rounded-xl p-3 grid grid-cols-3 gap-3 text-center" style={{ backgroundColor: `${GOLD}15` }}>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide" style={{ color: GOLD }}>{t.previewTotalAmount}</div>
                    <div className="text-base font-black font-mono text-[#080D1E]">
                      AED {r2(form.consignQty * form.unitPrice).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide" style={{ color: GOLD }}>{t.previewRemainingQty}</div>
                    <div className="text-base font-black font-mono text-gray-700">
                      {Math.max(0, form.consignQty - form.soldQty)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide" style={{ color: GOLD }}>{t.previewUnsettled}</div>
                    <div className="text-base font-black font-mono" style={{ color: colors.statusWarning }}>
                      AED {r2(Math.max(0, r2(form.consignQty * form.unitPrice) - form.settledAmount)).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeModal}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-gray-100 text-gray-600">
                {t.cancelBtn}
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-[#080D1E] text-white shadow">
                <Save className="w-3.5 h-3.5" />{editingId ? t.saveChanges : t.addConsignment}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 登记寄售销售 / Update Consignment Sales Modal ── */}
      {editingStock && (() => {
        const cQty       = Number(editingStock.consignedQty) || 0;
        const inclPrice  = Number((editingStock as any).taxInclusiveUnitPrice) || r2((Number(editingStock.unitPrice) || 0) * 1.05);
        const grossValue = r2(cQty * inclPrice);
        const pending    = r2(Math.max(0, grossValue - (editStockForm.receivedAmount || 0)));
        const overTotal  = editStockForm.soldQty + editStockForm.remainingQty > cQty;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#080D1E]">
                    {t.registerSalesTitle}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{editingStock.soNo} · {editingStock.customerName}</p>
                </div>
                <button onClick={() => setEditingStock(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* 只读信息栏 */}
                <div className="rounded-xl p-3 space-y-1.5" style={{ backgroundColor: `${GOLD}0D` }}>
                  <div className="text-xs font-black text-gray-700">{editingStock.productName}</div>
                  <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-500">
                    <span>{t.shippedQtyLabel} <span className="font-black text-gray-800">{cQty} {t.unitItems}</span></span>
                    <span>{t.inclUnitPriceLabel} <span className="font-black text-gray-800">AED {fmt2(inclPrice)}</span></span>
                    <span>{t.grossValueLabel} <span className="font-black" style={{ color: GOLD }}>AED {fmt2(grossValue)}</span></span>
                  </div>
                </div>

                {/* 可编辑字段 */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.fieldSoldQtyCumulative}>
                    <input
                      type="number" min={0} max={cQty}
                      value={editStockForm.soldQty}
                      onChange={e => setEditStockForm(p => ({ ...p, soldQty: Math.max(0, Number(e.target.value) || 0) }))}
                      className={INPUT}
                    />
                  </Field>
                  <Field label={t.fieldRemainingQtyField}>
                    <input
                      type="number" min={0}
                      value={editStockForm.remainingQty}
                      onChange={e => setEditStockForm(p => ({ ...p, remainingQty: Math.max(0, Number(e.target.value) || 0) }))}
                      className={INPUT}
                    />
                  </Field>
                </div>

                {overTotal && (
                  <p className="text-xs font-black text-[#A85D45] text-center">
                    {t.overTotalWarning.replace('{n}', String(editStockForm.soldQty)).replace('{m}', String(editStockForm.remainingQty)).replace('{sum}', String(editStockForm.soldQty + editStockForm.remainingQty)).replace('{total}', String(cQty))}
                  </p>
                )}

                <Field label={t.fieldReceivedAmountCumulative}>
                  <input
                    type="number" min={0} step="0.01"
                    value={editStockForm.receivedAmount}
                    onChange={e => setEditStockForm(p => ({ ...p, receivedAmount: Math.max(0, Number(e.target.value) || 0) }))}
                    className={INPUT}
                  />
                </Field>

                {/* 待结算金额实时显示 */}
                <div className="flex items-center justify-between rounded-lg px-4 py-2.5 text-xs font-bold"
                  style={{ backgroundColor: pending > 0 ? 'rgba(224,132,106,0.08)' : 'rgba(111,191,142,0.1)' }}>
                  <span className="text-gray-500">{t.pendingSettlementAmountLabel}</span>
                  <span className="text-base font-black font-mono" style={{ color: pending > 0 ? '#A85D45' : '#3F7D58' }}>
                    AED {fmt2(pending)}
                  </span>
                </div>

                <Field label={t.fieldSettlementStatus}>
                  <select
                    value={editStockForm.settlementStatus}
                    onChange={e => setEditStockForm(p => ({ ...p, settlementStatus: e.target.value as any }))}
                    className={INPUT}
                  >
                    <option value="UNSETTLED">{t.statusUnsettledOption}</option>
                    <option value="PARTIAL">{t.statusPartialOption}</option>
                    <option value="SETTLED">{t.statusSettledOption}</option>
                  </select>
                </Field>

                <Field label={t.fieldNotesOptional}>
                  <input
                    value={editStockForm.memo}
                    onChange={e => setEditStockForm(p => ({ ...p, memo: e.target.value }))}
                    className={INPUT}
                    placeholder={t.optionalPlaceholder}
                  />
                </Field>

                <p className="text-xs rounded-lg px-3 py-2 text-gray-500" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                  {t.settledInfoHint}
                </p>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button onClick={() => setEditingStock(null)}
                  className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-gray-100 text-gray-600">
                  {t.cancelBtn}
                </button>
                <button onClick={handleSaveEditStock} disabled={overTotal}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide shadow ${overTotal ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-[#080D1E] text-white'}`}>
                  <Save className="w-3.5 h-3.5" />{t.saveRegistration}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

const INPUT = 'w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#CBA85C]';

const Field: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({ label, children, full }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className="block text-xs font-black uppercase tracking-wide text-gray-400 mb-1">{label}</label>
    {children}
  </div>
);

export default ConsignmentManager;
