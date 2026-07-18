import React from 'react';

const NAVY = '#0c1b3a';
const GOLD = '#C9A84C';
const CARD_BORDER = '#e8e0d0';

interface CategoryBar {
  category: string;
  count: number;
  isUnclassified: boolean;
}

interface CategoryDistribution {
  noCategory: number;
  bars: CategoryBar[];
}

interface Props {
  data: CategoryDistribution;
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryDistributionChart({ data, selectedCategory, onSelect }: Props) {
  const maxCount = Math.max(...data.bars.map(b => b.count), 1);

  const barColor = (bar: CategoryBar, isSelected: boolean) => {
    if (isSelected) return NAVY;
    if (bar.isUnclassified) return '#94a3b8';
    return '#5b8db8';
  };

  const handleClick = (bar: CategoryBar) => {
    const key = bar.isUnclassified ? '未分类' : bar.category;
    onSelect(selectedCategory === key ? null : key);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '20px 24px', boxShadow: '0 1px 4px rgba(12,27,58,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>按行业分布</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          未分类 <strong style={{ color: '#e53e3e' }}>{data.noCategory}</strong> 家
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        按品类标签统计，同一供应商可能计入多个行业
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.bars.map(bar => {
          const key = bar.isUnclassified ? '未分类' : bar.category;
          const isSelected = selectedCategory === key;
          const widthPct = (bar.count / maxCount) * 100;

          return (
            <div
              key={key}
              onClick={() => handleClick(bar)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 6, padding: '3px 0', transition: 'opacity .15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              {/* Label */}
              <div style={{ width: 130, textAlign: 'right', fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? NAVY : '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {bar.isUnclassified ? '未分类' : bar.category}
              </div>

              {/* Bar track */}
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 20, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${widthPct}%`,
                  background: barColor(bar, isSelected),
                  borderRadius: 4,
                  transition: 'width .3s ease, background .15s',
                }} />
                {isSelected && (
                  <div style={{ position: 'absolute', inset: 0, border: `2px solid ${GOLD}`, borderRadius: 4, pointerEvents: 'none' }} />
                )}
              </div>

              {/* Count */}
              <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: isSelected ? NAVY : '#64748b', textAlign: 'right', flexShrink: 0 }}>
                {bar.count}
              </div>
            </div>
          );
        })}
      </div>

      {selectedCategory && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            onClick={() => onSelect(null)}
            style={{ fontSize: 11, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕ 清除行业筛选
          </button>
        </div>
      )}
    </div>
  );
}
