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

interface AlertRow {
  productName: string;
  customerName: string;
  soNo: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number | null;
  settlementStatus: string;
  unitPrice: number | null;
}

interface DrawerData {
  alertCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  anomalyCount: number;
  lowStockThreshold: number;
  alertRows: AlertRow[];
  asOf: string;
}

function rowAlertType(row: AlertRow): 'outOfStock' | 'lowStock' | 'anomaly' {
  if (row.remainingQty === null) return 'anomaly';
  if (row.remainingQty <= 0)    return 'outOfStock';
  return 'lowStock';
}

function ActionSuggestion({ type }: { type: 'outOfStock' | 'lowStock' | 'anomaly' }) {
  const map = {
    outOfStock: { text: '请尽快补货或暂停相关报价', color: '#E0846A' },
    lowStock:   { text: '建议确认是否需要补货',     color: '#D4A843' },
    anomaly:    { text: '请检查库存记录字段是否完整', color: '#8FA6D4' },
  };
  const { text, color } = map[type];
  return (
    <span style={{ fontSize: 10, color, fontStyle: 'italic' }}>→ {text}</span>
  );
}

function RowCard({ row }: { row: AlertRow }) {
  const type = rowAlertType(row);
  const bg  = type === 'outOfStock' ? 'rgba(224,132,106,0.07)'
             : type === 'anomaly'   ? 'rgba(143,166,212,0.05)'
             :                        'rgba(212,168,67,0.06)';
  const bdr = type === 'outOfStock' ? 'rgba(224,132,106,0.25)'
             : type === 'anomaly'   ? 'rgba(143,166,212,0.2)'
             :                        'rgba(212,168,67,0.22)';
  const qtyColor = type === 'outOfStock' ? '#E0846A'
                 : type === 'anomaly'    ? '#8FA6D4'
                 :                         '#D4A843';
  const badge = type === 'outOfStock'
    ? <span style={{ fontSize: 9, fontWeight: 700, color: '#E0846A', background: 'rgba(224,132,106,0.15)', padding: '1px 6px', borderRadius: 4 }}>缺货</span>
    : type === 'anomaly'
    ? <span style={{ fontSize: 9, fontWeight: 700, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', padding: '1px 6px', borderRadius: 4 }}>数据异常</span>
    : <span style={{ fontSize: 9, fontWeight: 700, color: '#D4A843', background: 'rgba(212,168,67,0.12)', padding: '1px 6px', borderRadius: 4 }}>低库存</span>;

  const settlZh = STATUS_ZH[row.settlementStatus] || row.settlementStatus || '—';

  return (
    <div style={{ padding: '11px 14px', borderRadius: 10, background: bg, border: `1px solid ${bdr}`, marginBottom: 6 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.productName}
        </span>
        {badge}
        <span style={{ fontSize: 14, fontWeight: 800, color: qtyColor, whiteSpace: 'nowrap' }}>
          {row.remainingQty === null ? '—' : `剩 ${row.remainingQty}`}
        </span>
      </div>

      {/* Detail grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 11, marginBottom: 6 }}>
        {row.customerName && (
          <div><span style={{ color: SUBTLE }}>客户：</span><span style={{ color: MUTED }}>{row.customerName}</span></div>
        )}
        {row.soNo && (
          <div><span style={{ color: SUBTLE }}>SO：</span><span style={{ color: MUTED }}>{row.soNo}</span></div>
        )}
        <div><span style={{ color: SUBTLE }}>寄售：</span><span style={{ color: MUTED }}>{row.consignedQty}</span></div>
        <div><span style={{ color: SUBTLE }}>已售：</span><span style={{ color: MUTED }}>{row.soldQty}</span></div>
        <div><span style={{ color: SUBTLE }}>结算：</span><span style={{ color: settlZh === '未结算' ? '#E0846A' : MUTED }}>{settlZh}</span></div>
        {row.unitPrice !== null && (
          <div><span style={{ color: SUBTLE }}>单价：</span><span style={{ color: MUTED }}>AED {row.unitPrice.toLocaleString()}</span></div>
        )}
      </div>

      <ActionSuggestion type={type} />
    </div>
  );
}

function GroupSection({
  title, color, rows, emptyMsg,
}: {
  title: string; color: string; rows: AlertRow[]; emptyMsg?: string;
}) {
  if (rows.length === 0 && !emptyMsg) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.06em' }}>{title}</span>
        <span style={{ fontSize: 11, color: SUBTLE }}>({rows.length})</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${color}44,transparent)` }} />
      </div>
      {rows.length === 0
        ? <div style={{ fontSize: 12, color: SUBTLE, padding: '6px 0' }}>{emptyMsg}</div>
        : rows.map((r, i) => <RowCard key={i} row={r} />)
      }
    </div>
  );
}

export function InventoryAlertDrawer({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DrawerData | null>(null);

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    fetch(`${base}/api/trade/check-inventory`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || '库存预警读取失败');
        setData(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const outOfStock = data?.alertRows.filter(r => rowAlertType(r) === 'outOfStock') ?? [];
  const lowStock   = data?.alertRows.filter(r => rowAlertType(r) === 'lowStock')   ?? [];
  const anomaly    = data?.alertRows.filter(r => rowAlertType(r) === 'anomaly')    ?? [];

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
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>库存预警</span>
              {data && (
                <span style={{ marginLeft: 10, fontSize: 20, fontWeight: 800, color: '#E0846A' }}>
                  {data.alertCount}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: MUTED, fontSize: 14, padding: '5px 12px', cursor: 'pointer' }}
            >
              关闭
            </button>
          </div>

          {/* Sub-counts */}
          {data && data.alertCount > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.outOfStockCount > 0 && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(224,132,106,0.12)', color: '#E0846A', fontWeight: 700 }}>
                  🔴 缺货 {data.outOfStockCount}
                </span>
              )}
              {data.lowStockCount > 0 && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(212,168,67,0.12)', color: '#D4A843', fontWeight: 700 }}>
                  🟡 低库存 {data.lowStockCount}
                </span>
              )}
              {data.anomalyCount > 0 && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(143,166,212,0.1)', color: '#8FA6D4', fontWeight: 700 }}>
                  ⚪ 数据异常 {data.anomalyCount}
                </span>
              )}
              <span style={{ fontSize: 10, color: SUBTLE, alignSelf: 'center', marginLeft: 4 }}>
                低库存阈值 ≤ {data.lowStockThreshold} 件
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>正在读取库存预警…</div>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid rgba(255,255,255,0.08)`, borderTopColor: GOLD, margin: '0 auto', animation: 'spin 0.9s linear infinite' }} />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(224,132,106,0.07)', border: '1px solid rgba(224,132,106,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#E0846A', fontWeight: 600, marginBottom: 4 }}>库存预警读取失败</div>
              <div style={{ fontSize: 12, color: MUTED }}>请稍后重试</div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && data && data.alertCount === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6FBF8E', marginBottom: 6 }}>暂无库存预警</div>
              <div style={{ fontSize: 12, color: MUTED }}>当前库存状态正常</div>
            </div>
          )}

          {/* Groups */}
          {!loading && !error && data && data.alertCount > 0 && (
            <>
              <GroupSection title="🔴 缺货" color="#E0846A" rows={outOfStock} />
              <GroupSection title="🟡 低库存" color="#D4A843" rows={lowStock} />
              <GroupSection title="⚪ 数据异常" color="#8FA6D4" rows={anomaly} />
            </>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div style={{ padding: '12px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: SUBTLE, flexShrink: 0 }}>
            数据来源：consignment_stock · {new Date(data.asOf).toLocaleString('zh-CN')}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
