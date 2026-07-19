import React, { useState } from 'react';
import { useI18n } from '@gci/i18n';
import { getCountryLabel } from '../lib/labelMaps';

const NAVY = '#0c1b3a';
const GOLD = '#C9A84C';
const CARD_BORDER = '#e8e0d0';

interface CountryBar {
  country: string;
  count: number;
  isBlank: boolean;
  isOther: boolean;
  detail: Array<{ country: string; count: number }> | null;
}

interface CountryDistribution {
  hasCountryCount: number;
  noCountryCount: number;
  countryCount: number;
  bars: CountryBar[];
}

interface Props {
  data: CountryDistribution;
  selectedCountry: string | null;
  onSelect: (country: string | null) => void;
}

export default function CountryDistributionChart({ data, selectedCountry, onSelect }: Props) {
  const { lang } = useI18n();
  const [otherExpanded, setOtherExpanded] = useState(false);

  const maxCount = Math.max(...data.bars.map(b => b.count), 1);

  const barColor = (bar: CountryBar, isSelected: boolean) => {
    if (isSelected) return NAVY;
    if (bar.isBlank) return '#94a3b8';
    if (bar.isOther) return '#b0bec5';
    return '#4e7fa8';
  };

  const handleBarClick = (bar: CountryBar) => {
    if (bar.isOther) {
      setOtherExpanded(e => !e);
      return;
    }
    const key = bar.isBlank ? '未填写' : bar.country;
    onSelect(selectedCountry === key ? null : key);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${CARD_BORDER}`, padding: '20px 24px', boxShadow: '0 1px 4px rgba(12,27,58,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>按国家分布</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
          <span>已填写 <strong style={{ color: NAVY }}>{data.hasCountryCount}</strong></span>
          <span>未填写 <strong style={{ color: '#e53e3e' }}>{data.noCountryCount}</strong></span>
          <span>覆盖国家 <strong style={{ color: NAVY }}>{data.countryCount}</strong> 个</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.bars.map(bar => {
          const key = bar.isBlank ? '未填写' : bar.country;
          const isSelected = selectedCountry === key;
          const widthPct = (bar.count / maxCount) * 100;

          return (
            <div key={key}>
              <div
                onClick={() => handleBarClick(bar)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 6, padding: '3px 0', transition: 'opacity .15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {/* Label — display only, filter key stays as DB value */}
                <div style={{ width: 130, textAlign: 'right', fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? NAVY : '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {bar.isBlank ? '未填写' : bar.isOther ? (lang === 'zh' ? '其他' : 'Other') : getCountryLabel(bar.country, lang)}
                  {bar.isOther && <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8' }}>{otherExpanded ? '▲' : '▼'}</span>}
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

              {/* "其他" expanded detail */}
              {bar.isOther && otherExpanded && bar.detail && (
                <div style={{ marginLeft: 140, marginTop: 4, marginBottom: 4, background: '#f8fafc', borderRadius: 8, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                  {bar.detail.map(d => (
                    <div
                      key={d.country}
                      onClick={() => onSelect(selectedCountry === d.country ? null : d.country)}
                      style={{ fontSize: 12, color: '#475569', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: selectedCountry === d.country ? '#e8f0fa' : 'transparent', fontWeight: selectedCountry === d.country ? 700 : 400 }}
                    >
                      {getCountryLabel(d.country, lang)} <span style={{ color: '#94a3b8' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedCountry && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            onClick={() => { onSelect(null); setOtherExpanded(false); }}
            style={{ fontSize: 11, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕ 清除国家筛选
          </button>
        </div>
      )}
    </div>
  );
}
