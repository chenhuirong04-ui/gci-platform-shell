// GCI Executive Desk — Task 6: Development Systems Registry list page.
// Read-only. No delete/edit actions anywhere on this page.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { getSystemRegistry, type SystemRegistryRow } from '../lib/systemRegistry';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const LIFECYCLE_COLOR: Record<string, string> = {
  production: GREEN,
  development: AMBER,
  paused: MUTED,
  legacy: RED,
  archived: MUTED,
  unknown: MUTED,
};

const DELETION_COLOR: Record<string, string> = {
  do_not_delete: GREEN,
  review: AMBER,
  safe_candidate: RED,
  unknown: MUTED,
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ fontSize: 12, display: 'flex', gap: 6 }}>
      <span style={{ color: MUTED, minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ color: value ? colors.textPrimary : MUTED, wordBreak: 'break-all' }}>{value ?? 'UNKNOWN'}</span>
    </div>
  );
}

export function Systems() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SystemRegistryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSystemRegistry().then((res) => {
      if (res.ok) setRows(res.rows);
      else setError(res.error);
    });
  }, []);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          Systems / 开发资产
        </h1>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>
          读取失败:{error}
        </div>
      )}
      {!rows && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows?.map((r) => {
          const lc = LIFECYCLE_COLOR[r.lifecycle_status || 'unknown'] ?? MUTED;
          const dc = DELETION_COLOR[r.deletion_status || 'unknown'] ?? MUTED;
          return (
            <div key={r.id} style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>{r.system_name}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: lc, background: `${lc}18`, border: `1px solid ${lc}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {r.lifecycle_status ?? 'UNKNOWN'}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: dc, background: `${dc}18`, border: `1px solid ${dc}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  deletion: {r.deletion_status ?? 'unknown'}
                </span>
                {r.category && <span style={{ fontSize: 9.5, color: MUTED }}>{r.category}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                <Field label="Production" value={r.production_url} />
                <Field label="GitHub" value={r.github_repo} />
                <Field label="Vercel" value={r.vercel_project} />
                <Field label="Supabase" value={r.supabase_project_name ? `${r.supabase_project_name} (${r.supabase_project_ref ?? 'UNKNOWN'})` : null} />
                <Field label="Last verified" value={r.last_verified_at ? new Date(r.last_verified_at).toLocaleDateString('zh-CN') : null} />
                <Field label="Replaced by" value={r.replaced_by} />
              </div>
              {r.notes && (
                <div style={{ marginTop: 10, fontSize: 12, color: MUTED, lineHeight: 1.5, borderTop: `1px solid ${BORD}`, paddingTop: 8 }}>
                  {r.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
