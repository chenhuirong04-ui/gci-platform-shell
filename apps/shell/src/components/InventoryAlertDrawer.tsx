import { useEffect, useState } from 'react';

const GOLD   = '#CBA85C';
const NAVY   = '#080D1E';
const TEXT   = '#E8F0FF';
const MUTED  = '#8A97B0';
const SUBTLE = '#5A6A84';

const STATUS_ZH: Record<string, string> = {
  UNSETTLED: '未结算',
  PARTIAL:   '部分结算',
  SETTLED:   '已结算',
};

// ── Consignment row (from check-inventory API) ────────────────────────────────
interface ConsignmentRow {
  productName: string;
  customerName: string;
  soNo: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number | null;
  settlementStatus: string;
  unitPrice: number | null;
  rowAlertType?: 'outOfStock' | 'lowStock' | 'anomaly';
}

// ── Warehouse item (from inventory-table-alerts API) ─────────────────────────
interface WarehouseItem {
  pageId: string;
  productName: string;
  sku: string;
  category: string;
  warehouse: string;
  currentQty: number | null;
  minQty: number | null;
  threshold: number;
  statusVal: string;
  updatedAt: string;
  alertType: 'outOfStock' | 'lowStock' | 'anomaly' | 'normal';
  actionSuggestion: string;
}

interface ConsignmentData {
  alertCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  anomalyCount: number;
  lowStockThreshold: number;
  settledRowsExcluded: number;
  alertRows: ConsignmentRow[];
  asOf: string;
}

interface WarehouseData {
  alertCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  anomalyCount: number;
  lowStockThreshold: number;
  warnings: string[];
  alertItems: WarehouseItem[];
  fieldMap: Record<string, string | null>;
  asOf: string;
}

// ── Row alert type helper (for rows without embedded rowAlertType) ─────────────
function getRowAlertType(row: ConsignmentRow): 'outOfStock' | 'lowStock' | 'anomaly' {
  if (row.rowAlertType) return row.rowAlertType;
  if (row.remainingQty === null) return 'anomaly';
  if (row.remainingQty <= 0) return 'outOfStock';
  return 'lowStock';
}

// ── Alert badge ──────────────────────────────────────────────────────────────
function AlertBadge({ type }: { type: 'outOfStock' | 'lowStock' | 'anomaly' }) {
  const map = {
    outOfStock: { text: '缺货',   color: '#E0846A', bg: 'rgba(224,132,106,0.15)' },
    lowStock:   { text: '低库存', color: '#D4A843', bg: 'rgba(212,168,67,0.12)'  },
    anomaly:    { text: '数据异常',color: '#8FA6D4', bg: 'rgba(143,166,212,0.12)' },
  };
  const { text, color, bg } = map[type];
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, background: bg, padding: '1px 6px', borderRadius: 4 }}>
      {text}
    </span>
  );
}

function ActionHint({ type }: { type: 'outOfStock' | 'lowStock' | 'anomaly' }) {
  const map = {
    outOfStock: { text: '请尽快补货或暂停相关报价',   color: '#E0846A' },
    lowStock:   { text: '建议确认是否需要补货',       color: '#D4A843' },
    anomaly:    { text: '请检查库存记录字段是否完整',  color: '#8FA6D4' },
  };
  const { text, color } = map[type];
  return <span style={{ fontSize: 10, color, fontStyle: 'italic' }}>→ {text}</span>;
}

// ── Consignment row card ──────────────────────────────────────────────────────
function ConsignmentCard({ row }: { row: ConsignmentRow }) {
  const type = getRowAlertType(row);
  const bg  = type === 'outOfStock' ? 'rgba(224,132,106,0.07)' : type === 'anomaly' ? 'rgba(143,166,212,0.05)' : 'rgba(212,168,67,0.06)';
  const bdr = type === 'outOfStock' ? 'rgba(224,132,106,0.25)' : type === 'anomaly' ? 'rgba(143,166,212,0.2)'  : 'rgba(212,168,67,0.22)';
  const qtyColor = type === 'outOfStock' ? '#E0846A' : type === 'anomaly' ? '#8FA6D4' : '#D4A843';
  const settlZh = STATUS_ZH[row.settlementStatus] || row.settlementStatus || '—';

  return (
    <div style={{ padding: '11px 14px', borderRadius: 10, background: bg, border: `1px solid ${bdr}`, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.productName}
        </span>
        <AlertBadge type={type} />
        <span style={{ fontSize: 14, fontWeight: 800, color: qtyColor, whiteSpace: 'nowrap' }}>
          {row.remainingQty === null ? '—' : `剩 ${row.remainingQty}`}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 11, marginBottom: 6 }}>
        {row.customerName && <div><span style={{ color: SUBTLE }}>客户：</span><span style={{ color: MUTED }}>{row.customerName}</span></div>}
        {row.soNo        && <div><span style={{ color: SUBTLE }}>SO：</span><span style={{ color: MUTED }}>{row.soNo}</span></div>}
        <div><span style={{ color: SUBTLE }}>寄售：</span><span style={{ color: MUTED }}>{row.consignedQty}</span></div>
        <div><span style={{ color: SUBTLE }}>已售：</span><span style={{ color: MUTED }}>{row.soldQty}</span></div>
        <div><span style={{ color: SUBTLE }}>结算：</span><span style={{ color: settlZh === '未结算' ? '#E0846A' : MUTED }}>{settlZh}</span></div>
        {row.unitPrice !== null && <div><span style={{ color: SUBTLE }}>单价：</span><span style={{ color: MUTED }}>AED {row.unitPrice.toLocaleString()}</span></div>}
      </div>
      <ActionHint type={type} />
    </div>
  );
}

// ── Warehouse item card ───────────────────────────────────────────────────────
function WarehouseCard({ item }: { item: WarehouseItem }) {
  const type = item.alertType as 'outOfStock' | 'lowStock' | 'anomaly';
  const bg  = type === 'outOfStock' ? 'rgba(224,132,106,0.07)' : type === 'anomaly' ? 'rgba(143,166,212,0.05)' : 'rgba(212,168,67,0.06)';
  const bdr = type === 'outOfStock' ? 'rgba(224,132,106,0.25)' : type === 'anomaly' ? 'rgba(143,166,212,0.2)'  : 'rgba(212,168,67,0.22)';
  const qtyColor = type === 'outOfStock' ? '#E0846A' : type === 'anomaly' ? '#8FA6D4' : '#D4A843';

  return (
    <div style={{ padding: '11px 14px', borderRadius: 10, background: bg, border: `1px solid ${bdr}`, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.productName}
        </span>
        <AlertBadge type={type} />
        <span style={{ fontSize: 14, fontWeight: 800, color: qtyColor, whiteSpace: 'nowrap' }}>
          {item.currentQty === null ? '—' : `剩 ${item.currentQty}`}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 11, marginBottom: 6 }}>
        {item.sku      && <div><span style={{ color: SUBTLE }}>SKU：</span><span style={{ color: MUTED }}>{item.sku}</span></div>}
        {item.category && <div><span style={{ color: SUBTLE }}>分类：</span><span style={{ color: MUTED }}>{item.category}</span></div>}
        {item.warehouse && <div><span style={{ color: SUBTLE }}>仓库：</span><span style={{ color: MUTED }}>{item.warehouse}</span></div>}
        {item.minQty !== null && <div><span style={{ color: SUBTLE }}>安全库存：</span><span style={{ color: MUTED }}>{item.minQty}</span></div>}
        {item.statusVal && <div><span style={{ color: SUBTLE }}>状态：</span><span style={{ color: MUTED }}>{item.statusVal}</span></div>}
        {item.updatedAt && <div><span style={{ color: SUBTLE }}>更新：</span><span style={{ color: MUTED }}>{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span></div>}
      </div>
      <ActionHint type={type} />
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────
function GroupSection<T>({
  title, color, rows, renderCard,
}: {
  title: string; color: string; rows: T[]; renderCard: (item: T, i: number) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.06em' }}>{title}</span>
        <span style={{ fontSize: 11, color: SUBTLE }}>({rows.length})</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${color}44,transparent)` }} />
      </div>
      {rows.map((r, i) => renderCard(r, i))}
    </div>
  );
}

// ── Summary chips ─────────────────────────────────────────────────────────────
function SummaryChips({ oos, low, anom, threshold }: { oos: number; low: number; anom: number; threshold: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {oos > 0 && (
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(224,132,106,0.12)', color: '#E0846A', fontWeight: 700 }}>
          🔴 缺货 {oos}
        </span>
      )}
      {low > 0 && (
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(212,168,67,0.12)', color: '#D4A843', fontWeight: 700 }}>
          🟡 低库存 {low}
        </span>
      )}
      {anom > 0 && (
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(143,166,212,0.1)', color: '#8FA6D4', fontWeight: 700 }}>
          ⚪ 数据异常 {anom}
        </span>
      )}
      <span style={{ fontSize: 10, color: SUBTLE, alignSelf: 'center', marginLeft: 4 }}>
        低库存阈值 ≤ {threshold} 件
      </span>
    </div>
  );
}

// ── Loading / error / empty states ───────────────────────────────────────────
function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{label}</div>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid rgba(255,255,255,0.08)`, borderTopColor: GOLD, margin: '0 auto', animation: 'spin 0.9s linear infinite' }} />
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.2)', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>读取失败</div>
      <div style={{ fontSize: 12, color: MUTED }}>{msg}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 26, marginBottom: 10 }}>✅</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6FBF8E', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: MUTED }}>当前库存状态正常</div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export function InventoryAlertDrawer({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'warehouse' | 'consignment'>('warehouse');

  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError]     = useState<string | null>(null);
  const [whData, setWhData]       = useState<WarehouseData | null>(null);

  const [csLoading, setCsLoading] = useState(true);
  const [csError, setCsError]     = useState<string | null>(null);
  const [csData, setCsData]       = useState<ConsignmentData | null>(null);

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';

    // Warehouse (Notion)
    fetch(`${base}/api/ai/inventory-table-alerts`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || '库存表读取失败');
        setWhData(d);
      })
      .catch(e => setWhError(String(e).replace('Error: ', '')))
      .finally(() => setWhLoading(false));

    // Consignment (Supabase)
    fetch(`${base}/api/trade/check-inventory`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || '寄售库存读取失败');
        setCsData(d);
      })
      .catch(e => setCsError(String(e).replace('Error: ', '')))
      .finally(() => setCsLoading(false));
  }, []);

  const totalAlert = (whData?.alertCount ?? 0) + (csData?.alertCount ?? 0);

  // Warehouse alert rows split by type
  const whOos  = whData?.alertItems.filter(i => i.alertType === 'outOfStock') ?? [];
  const whLow  = whData?.alertItems.filter(i => i.alertType === 'lowStock')   ?? [];
  const whAnom = whData?.alertItems.filter(i => i.alertType === 'anomaly')    ?? [];

  // Consignment alert rows split by type
  const csOos  = csData?.alertRows.filter(r => getRowAlertType(r) === 'outOfStock') ?? [];
  const csLow  = csData?.alertRows.filter(r => getRowAlertType(r) === 'lowStock')   ?? [];
  const csAnom = csData?.alertRows.filter(r => getRowAlertType(r) === 'anomaly')    ?? [];

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '8px 0',
    background: active ? 'rgba(203,168,92,0.12)' : 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
    color: active ? GOLD : MUTED,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    letterSpacing: '0.04em',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480,
        background: '#0B1221', borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 1001, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 22px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>库存预警</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#E0846A' }}>{totalAlert}</span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: MUTED, fontSize: 14, padding: '5px 12px', cursor: 'pointer' }}
            >
              关闭
            </button>
          </div>

          {/* Summary row */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: MUTED, marginBottom: 14 }}>
            <span>库存表预警：<strong style={{ color: TEXT }}>{whLoading ? '…' : (whData?.alertCount ?? '—')}</strong></span>
            <span>寄售库存预警：<strong style={{ color: TEXT }}>{csLoading ? '…' : (csData?.alertCount ?? '—')}</strong></span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex' }}>
            <button style={tabStyle(tab === 'warehouse')} onClick={() => setTab('warehouse')}>
              库存表预警 {!whLoading && whData ? `(${whData.alertCount})` : ''}
            </button>
            <button style={tabStyle(tab === 'consignment')} onClick={() => setTab('consignment')}>
              寄售库存预警 {!csLoading && csData ? `(${csData.alertCount})` : ''}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* ── Warehouse tab ── */}
          {tab === 'warehouse' && (
            <>
              {whLoading && <LoadingState label="正在读取 Notion 库存表…" />}
              {!whLoading && whError && <ErrorState msg={whError} />}
              {!whLoading && !whError && whData && (
                <>
                  {whData.warnings.length > 0 && (
                    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)' }}>
                      {whData.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#D4A843', marginBottom: i < whData.warnings.length - 1 ? 4 : 0 }}>⚠️ {w}</div>
                      ))}
                    </div>
                  )}
                  {whData.alertCount === 0 ? (
                    <EmptyState label="库存表暂无预警" />
                  ) : (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <SummaryChips oos={whData.outOfStockCount} low={whData.lowStockCount} anom={whData.anomalyCount} threshold={whData.lowStockThreshold} />
                      </div>
                      <GroupSection title="🔴 缺货" color="#E0846A" rows={whOos} renderCard={(item, i) => <WarehouseCard key={i} item={item} />} />
                      <GroupSection title="🟡 低库存" color="#D4A843" rows={whLow} renderCard={(item, i) => <WarehouseCard key={i} item={item} />} />
                      <GroupSection title="⚪ 数据异常" color="#8FA6D4" rows={whAnom} renderCard={(item, i) => <WarehouseCard key={i} item={item} />} />
                    </>
                  )}
                  <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                    数据来源：Notion INVENTORY_DB · {whData.fieldMap.qtyField ? `库存字段：${whData.fieldMap.qtyField}` : '未检测到库存字段'} · {new Date(whData.asOf).toLocaleString('zh-CN')}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Consignment tab ── */}
          {tab === 'consignment' && (
            <>
              {csLoading && <LoadingState label="正在读取寄售库存…" />}
              {!csLoading && csError && <ErrorState msg={csError} />}
              {!csLoading && !csError && csData && (
                <>
                  {csData.settledRowsExcluded > 0 && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(143,166,212,0.05)', border: '1px solid rgba(143,166,212,0.15)' }}>
                      <span style={{ fontSize: 11, color: SUBTLE }}>已排除 {csData.settledRowsExcluded} 条已结算记录（不需要补货）</span>
                    </div>
                  )}
                  {csData.alertCount === 0 ? (
                    <EmptyState label="寄售库存暂无预警" />
                  ) : (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <SummaryChips oos={csData.outOfStockCount} low={csData.lowStockCount} anom={csData.anomalyCount} threshold={csData.lowStockThreshold} />
                      </div>
                      <GroupSection title="🔴 缺货" color="#E0846A" rows={csOos} renderCard={(row, i) => <ConsignmentCard key={i} row={row} />} />
                      <GroupSection title="🟡 低库存" color="#D4A843" rows={csLow} renderCard={(row, i) => <ConsignmentCard key={i} row={row} />} />
                      <GroupSection title="⚪ 数据异常" color="#8FA6D4" rows={csAnom} renderCard={(row, i) => <ConsignmentCard key={i} row={row} />} />
                    </>
                  )}
                  <div style={{ fontSize: 10, color: SUBTLE, marginTop: 8 }}>
                    数据来源：consignment_stock（已排除 SETTLED） · {new Date(csData.asOf).toLocaleString('zh-CN')}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
