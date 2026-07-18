import React, { useState } from 'react';
import type { SupplierSearchResponse, SupplierSearchResultItem } from './supplierSearchTypes';

const GOLD = '#CBA85C';
const NAVY = '#080D1E';
const TEXT = '#E8EAF0';
const MUTED = '#8A97B0';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';

const MATCH_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  exact_product:       { label: '精准产品', color: '#6FBF8E' },
  similar_product:     { label: '相近产品', color: '#9FD4B0' },
  category_only:       { label: '品类匹配', color: GOLD },
  service_match:       { label: '服务匹配', color: '#7BB3D4' },
  certification_match: { label: '认证匹配', color: '#C48BE8' },
  profile_match:       { label: '档案匹配', color: MUTED },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#6FBF8E' : score >= 50 ? GOLD : MUTED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{score}</span>
    </div>
  );
}

function ContactChip({ contact }: { contact: NonNullable<SupplierSearchResultItem['primaryContact']> }) {
  if (!contact.whatsapp && !contact.email && !contact.name) return null;
  return (
    <div style={{ fontSize: 11, color: '#9FD4B0', marginTop: 4 }}>
      {contact.name && <span>{contact.name}</span>}
      {contact.whatsapp && <span style={{ marginLeft: contact.name ? 6 : 0 }}>· WA: {contact.whatsapp}</span>}
      {!contact.whatsapp && contact.email && <span style={{ marginLeft: contact.name ? 6 : 0 }}>· {contact.email}</span>}
    </div>
  );
}

function CertBadge({ cert }: { cert: SupplierSearchResultItem['certifications'][0] }) {
  const isExpired = cert.status === 'expired';
  const isAvailable = cert.status === 'available';
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10,
      background: isExpired ? 'rgba(220,88,88,0.15)' : isAvailable ? 'rgba(111,191,142,0.15)' : 'rgba(255,255,255,0.06)',
      color: isExpired ? '#E07070' : isAvailable ? '#6FBF8E' : MUTED,
      border: `1px solid ${isExpired ? 'rgba(220,88,88,0.3)' : isAvailable ? 'rgba(111,191,142,0.3)' : CARD_BORDER}`,
      marginRight: 4,
    }}>
      {cert.type}{isExpired ? ' (过期)' : ''}
    </span>
  );
}

function SupplierCard({ item, onOpenDetail }: { item: SupplierSearchResultItem; onOpenDetail: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const matchStyle = MATCH_TYPE_LABELS[item.matchType] ?? MATCH_TYPE_LABELS.profile_match;

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
      {/* Row 1: name + score + preferred + open */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {item.isPreferred && (
              <span style={{ fontSize: 12, color: GOLD }}>★</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{item.supplierName}</span>
            <span style={{ fontSize: 10, color: MUTED }}>{item.shortCode}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: matchStyle.color, border: `1px solid ${matchStyle.color}33` }}>
              {matchStyle.label}
            </span>
            {item.currentRating && (
              <span style={{ fontSize: 10, fontWeight: 800, color: item.currentRating === 'A' ? '#6FBF8E' : GOLD }}>评级 {item.currentRating}</span>
            )}
            {item.certStatus === 'confirmed' && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(111,191,142,0.15)', color: '#6FBF8E', border: '1px solid rgba(111,191,142,0.3)' }}>✓ 认证已录</span>
            )}
            {item.certStatus === 'not_recorded' && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(224,160,96,0.1)', color: '#E0A060', border: '1px solid rgba(224,160,96,0.3)' }}>认证待核实</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{item.matchReason}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <ScoreBar score={item.matchScore} />
          <button
            onClick={() => onOpenDetail(item.supplierId)}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, background: 'rgba(203,168,92,0.12)', border: `1px solid ${GOLD}44`, color: GOLD, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            查看详情 →
          </button>
        </div>
      </div>

      {/* Row 2: meta info */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: MUTED, marginBottom: 6 }}>
        {(item.country || item.city) && (
          <span>📍 {[item.country, item.city].filter(Boolean).join(' / ')}</span>
        )}
        {/* Always show supplier type with status label */}
        <span style={{ color: item.typeMatchStatus === 'exact' ? '#6FBF8E' : item.typeMatchStatus === 'non_factory' ? '#E07070' : MUTED }}>
          🏭 {item.supplierType ?? '类型未知'}{' '}
          <span style={{ fontSize: 10 }}>
            {item.typeMatchStatus === 'exact' ? '（已记录为工厂）' : item.typeMatchStatus === 'unknown' ? '（类型待确认）' : '（非工厂）'}
          </span>
        </span>
        {item.profileCompleteness > 0 && (
          <span style={{ color: item.profileCompleteness >= 70 ? '#6FBF8E' : item.profileCompleteness >= 40 ? GOLD : '#E07070' }}>
            档案完整度 {item.profileCompleteness}%
          </span>
        )}
      </div>

      {/* Row 3: matched categories/products */}
      {(item.matchedCategories.length > 0 || item.matchedProducts.length > 0) && (
        <div style={{ marginBottom: 6 }}>
          {item.matchedProducts.length > 0 && (
            <div style={{ fontSize: 11, color: '#9FD4B0', marginBottom: 2 }}>
              产品：{item.matchedProducts.slice(0, 3).join(' · ')}{item.matchedProducts.length > 3 ? ` 等${item.matchedProducts.length}项` : ''}
            </div>
          )}
          {item.matchedCategories.length > 0 && (
            <div style={{ fontSize: 11, color: MUTED }}>
              品类：{item.matchedCategories.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Row 4: contact */}
      {item.primaryContact && <ContactChip contact={item.primaryContact} />}

      {/* Expandable: certs + quote + warnings */}
      {(item.certifications.length > 0 || item.latestQuote || item.warnings.length > 0) && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {expanded ? '▲ 收起' : `▼ 查看认证/报价/提示${item.warnings.length > 0 ? ` (${item.warnings.length}个提示)` : ''}`}
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {item.certifications.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>认证</div>
                  {item.certifications.map((c, i) => <CertBadge key={i} cert={c} />)}
                </div>
              )}
              {item.latestQuote && (
                <div style={{ fontSize: 11, color: MUTED }}>
                  最新报价：{item.latestQuote.quoteNo}
                  {item.latestQuote.quoteDate && ` · ${item.latestQuote.quoteDate}`}
                  {item.latestQuote.totalCost && ` · ${item.latestQuote.currency ?? ''} ${item.latestQuote.totalCost.toLocaleString()}`}
                  {item.latestQuote.expired && <span style={{ color: '#E07070', marginLeft: 6 }}>（已过期）</span>}
                </div>
              )}
              {item.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: '#E0A060', background: 'rgba(224,160,96,0.08)', borderRadius: 6, padding: '4px 8px' }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  data: SupplierSearchResponse;
  onOpenDetail: (supplierId: string) => void;
  onClose: () => void;
}

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 10, color, background: `${color}22`, borderRadius: 10, padding: '1px 8px' }}>{count} 家</span>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
    </div>
  );
}

function ResultList({ items, onOpenDetail, showAllDefault }: { items: SupplierSearchResultItem[]; onOpenDetail: (id: string) => void; showAllDefault?: boolean }) {
  const [showAll, setShowAll] = useState(!!showAllDefault);
  const visible = showAll ? items : items.slice(0, 10);
  if (items.length === 0) return null;
  return (
    <>
      {visible.map(item => <SupplierCard key={item.supplierId} item={item} onOpenDetail={onOpenDetail} />)}
      {items.length > 10 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${CARD_BORDER}`, borderRadius: 10, color: MUTED, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
          显示更多（剩余 {items.length - 10} 家）
        </button>
      )}
    </>
  );
}

export default function SupplierSearchResult({ data, onOpenDetail, onClose }: Props) {
  const intent = data.extractedIntent;

  const totalShown = data.hasFactoryIntent
    ? data.exactTypeMatches.length + data.relatedTypeCandidates.length
    : data.results.length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>
          供应商搜索结果 · 共找到 <span style={{ color: GOLD }}>{data.total}</span> 家
        </div>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.7 }}>
          {intent.matchedSynonym && <span>产品：{intent.matchedSynonym}　</span>}
          {intent.expandedCategories.length > 0 && <span>品类：{intent.expandedCategories.join(' / ')}　</span>}
          {intent.keywords.length > 0 && !intent.matchedSynonym && <span>关键词：{intent.keywords.join('、')}　</span>}
          {intent.country && <span>国家：{intent.country}　</span>}
          {intent.certificationKeyword && <span>认证要求：{intent.certificationKeyword}　</span>}
          {intent.supplierTypePreference && <span>类型筛选：{intent.supplierTypePreference}　</span>}
          {intent.preferredOnly && <span>仅常用　</span>}
          {intent.requiresContact && <span>需有联系人　</span>}
        </div>

        {/* Cert fallback banner */}
        {data.certFallback && intent.certificationKeyword && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(224,160,96,0.1)', border: '1px solid rgba(224,160,96,0.3)', borderRadius: 8, fontSize: 12, color: '#E0A060' }}>
            ⚠ 数据库暂无已记录 <strong>{intent.certificationKeyword}</strong> 认证的供应商。以下为品类相关候选，认证状态待核实，请直接向供应商确认。
          </div>
        )}

        {/* Notes (filter out the cert fallback note — shown in banner above) */}
        {data.notes.filter(n => !n.startsWith('没有找到已记录')).map((n, i) => (
          <div key={i} style={{ fontSize: 11, color: '#8A97B0', marginTop: 4 }}>ℹ {n}</div>
        ))}
      </div>

      {/* ── Factory intent: two-section layout ── */}
      {data.hasFactoryIntent ? (
        <>
          {/* Section 1: confirmed Factory */}
          <SectionHeader title="✓ 已确认工厂（supplier_type = Factory）" count={data.exactTypeMatches.length} color="#6FBF8E" />
          {data.exactTypeMatches.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, padding: '10px 0 6px', fontStyle: 'italic' }}>
              暂无已确认类型为 Factory 的供应商。如需确认，请在供应商档案中更新 supplier_type 字段。
            </div>
          ) : (
            <ResultList items={data.exactTypeMatches} onOpenDetail={onOpenDetail} />
          )}

          {/* Section 2: Unknown / non-factory candidates */}
          {data.relatedTypeCandidates.length > 0 && (
            <>
              <SectionHeader title="相关候选（类型待确认或非工厂）" count={data.relatedTypeCandidates.length} color="#E0A060" />
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, fontStyle: 'italic' }}>
                以下供应商产品或品类相关，但供应商类型尚未确认或当前记录不是工厂。请核实后再采购。
              </div>
              <ResultList items={data.relatedTypeCandidates} onOpenDetail={onOpenDetail} />
            </>
          )}

          {totalShown === 0 && (
            <div style={{ fontSize: 13, color: MUTED, padding: '24px 0' }}>
              暂无匹配供应商。建议在供应商档案中补充产品资料或供应商类型。
            </div>
          )}
        </>
      ) : (
        /* ── Non-factory intent: flat list ── */
        <>
          {data.results.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED, padding: '24px 0' }}>
              暂无匹配供应商。建议放宽筛选条件，或在供应商档案中补充产品资料。
            </div>
          ) : (
            <ResultList items={data.results} onOpenDetail={onOpenDetail} />
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
          关闭
        </button>
        <span style={{ fontSize: 11, color: MUTED }}>— 或继续追问以缩小范围</span>
      </div>
    </div>
  );
}
