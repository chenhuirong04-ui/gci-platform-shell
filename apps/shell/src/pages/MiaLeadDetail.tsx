// GCI Executive Desk — Task 18.4: MIA Detail Bridge — single lead detail.
// Deep-linkable and refresh-safe: /mia-leads/:leadId re-fetches MIA's
// status fresh and looks up the matching lead by id, rather than relying
// on router state — a page refresh or a direct link never loses context
// and never bounces back to Home. Read-only.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getMiaStatus, type MiaLead, type MiaNeedsChrisItem } from '../lib/mia';

const GOLD = '#CBA85C';
const MUTED = '#7A8494';
const AMBER = '#D4A843';
const RED = '#E0846A';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const MIA_BASE_URL = 'https://gci-ai-sales-agent.vercel.app';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: TEXT }}>{value ?? '—'}</div>
    </div>
  );
}

export function MiaLeadDetail() {
  const navigate = useNavigate();
  const { leadId } = useParams<{ leadId: string }>();
  const [lead, setLead] = useState<MiaLead | null | undefined>(undefined); // undefined = loading
  const [relatedNeedsChris, setRelatedNeedsChris] = useState<MiaNeedsChrisItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLead(undefined);
    setError(null);
    getMiaStatus().then((res) => {
      if (!res.ok) {
        setError(res.error);
        setLead(null);
        return;
      }
      const found = (res.data.recent_leads ?? []).find((l) => l.lead_id === leadId) ?? null;
      setLead(found);
      setRelatedNeedsChris((res.data.needs_chris_items ?? []).filter((it) => it.lead_id === leadId));
    });
  }, [leadId]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button onClick={() => navigate('/mia-leads')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← 返回潜客列表</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>MIA 潜客详情</h1>
        <div style={{ flex: 1 }} />
        <a href={MIA_BASE_URL} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: MUTED, textDecoration: 'none' }}>
          打开 MIA →
        </a>
      </div>

      {lead === undefined && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
      {error && <div style={{ fontSize: 13, color: RED, marginBottom: 16 }}>读取失败:{error}</div>}

      {lead === null && !error && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          未找到该潜客——可能已经不在 MIA 今天返回的列表里，或 MIA 的 /api/executive-status 还没有提供逐条数据。
          <div style={{ marginTop: 10 }}>
            <button onClick={() => navigate('/mia-leads')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD }}>
              返回潜客列表
            </button>
          </div>
        </div>
      )}

      {lead && (
        <div style={{ padding: '20px 22px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{lead.company_name}</div>
            {lead.priority && <span style={{ fontSize: 10.5, color: AMBER, background: 'rgba(212,168,67,0.12)', borderRadius: 4, padding: '3px 8px' }}>{lead.priority}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', marginBottom: 16 }}>
            <Field label="国家" value={lead.country} />
            <Field label="行业" value={lead.industry} />
            <Field label="联系人" value={lead.contact_name} />
            <Field label="Score" value={lead.score ?? '—'} />
            <Field label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} style={{ color: GOLD }}>{lead.email}</a> : '—'} />
            <Field label="WhatsApp" value={lead.whatsapp} />
            <Field label="当前状态" value={lead.status} />
            <Field label="创建时间" value={fmtTime(lead.created_at)} />
          </div>

          <Field label="为什么相关 (why_relevant)" value={lead.why_relevant} />

          {relatedNeedsChris.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 10.5, color: RED, fontWeight: 700, marginBottom: 8 }}>需要 Chris 处理</div>
              {relatedNeedsChris.map((it) => (
                <div key={it.id} style={{ padding: '10px 12px', background: 'rgba(224,132,106,0.06)', border: `1px solid ${RED}30`, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{it.reason}</div>
                  {it.suggested_action && <div style={{ fontSize: 11.5, color: MUTED }}>建议: {it.suggested_action}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
