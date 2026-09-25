// Ask GCI — search_knowledge result. Answers only from knowledge_search() hits (no web, no LLM, no guessing).
// Verification is always shown: OFFICIAL / CONFIRMED / INTERNAL / PENDING. PENDING and DRAFT entries are
// explicitly flagged as not reviewed / not a final official conclusion.
import type { KnowledgeHit } from '../../lib/knowledge';
import { VerificationBadge, LevelBadge, DraftBadge } from '../../components/KnowledgeBadges';

export interface KnowledgeSearchData {
  ok: true;
  question: string;
  terms: string[];
  hits: KnowledgeHit[];
  noAccess: boolean;
}

export const KNOWLEDGE_NOT_FOUND = '知识库中暂未找到可确认的条目。';
export const KNOWLEDGE_PENDING_NOTE = '该条目尚未完成复核。';

const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const KIND: Record<string, string> = { rule: '规则', item: '知识点', activity: '经营活动' };
const GROUPS: { key: string; title: string }[] = [
  { key: 'OFFICIAL', title: '官方来源（OFFICIAL）' },
  { key: 'CONFIRMED', title: '已确认（CONFIRMED）' },
  { key: 'INTERNAL', title: '内部经验（INTERNAL）' },
  { key: 'PENDING', title: '待复核（PENDING）' },
  { key: 'OTHER', title: '其他' },
];

export default function KnowledgeSearchResult({ data, onClose }: { data: KnowledgeSearchData; onClose: () => void }) {
  const { hits } = data;
  const link = `/business-solutions/knowledge?tab=search&q=${encodeURIComponent(data.terms[0] ?? data.question)}`;
  const anyDraft = hits.some((h) => h.status === 'DRAFT');
  const groupOf = (h: KnowledgeHit) => (GROUPS.some((g) => g.key === h.verification_status) ? h.verification_status! : 'OTHER');

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        知识库检索 · 关键词：{data.terms.length ? data.terms.join(' / ') : data.question}
      </div>

      {hits.length === 0 ? (
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{KNOWLEDGE_NOT_FOUND}</div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>在知识库中找到 {hits.length} 条相关条目：</div>
          {GROUPS.map((g) => {
            const list = hits.filter((h) => groupOf(h) === g.key);
            if (list.length === 0) return null;
            return (
              <div key={g.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.06em', marginBottom: 6 }}>{g.title}</div>
                {list.map((h) => (
                  <div key={`${h.kind}-${h.id}`} style={{ padding: '8px 10px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: GOLD }}>{KIND[h.kind] ?? h.kind}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{h.title}</span>
                      <VerificationBadge value={h.verification_status} />
                      <DraftBadge status={h.status} />
                      <LevelBadge value={h.confidentiality} />
                    </div>
                    {h.snippet && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{h.snippet}</div>}
                    {h.verification_status === 'PENDING' && (
                      <div style={{ fontSize: 12, color: '#D4A843', marginTop: 4 }}>{KNOWLEDGE_PENDING_NOTE}</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {anyDraft && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              以上条目在知识库中仍为草稿（DRAFT），仅供参考，不构成官方最终结论；请以主管机构最新规定为准。
            </div>
          )}
        </>
      )}

      {data.noAccess && (
        <div style={{ fontSize: 12, color: '#D4A843', marginTop: 6 }}>
          你的账号尚未开通知识库权限（knowledge_public / knowledge / knowledge_confidential），因此看不到任何条目。
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        <a href={link} style={{ color: GOLD, fontSize: 12 }}>在「知识与规则」中查看 →</a>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 12, cursor: 'pointer' }}>关闭</button>
      </div>
    </div>
  );
}
