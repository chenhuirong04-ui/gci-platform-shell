// Small status badges for Knowledge & Rules rows and Ask GCI knowledge answers.
const VERIFICATION: Record<string, { zh: string; en: string; color: string }> = {
  OFFICIAL:  { zh: '官方来源', en: 'Official',       color: '#6FBF8E' },
  CONFIRMED: { zh: '已确认',   en: 'Confirmed',      color: '#6FBF8E' },
  INTERNAL:  { zh: '内部经验', en: 'Internal',       color: '#8FA8D8' },
  PENDING:   { zh: '待复核',   en: 'Pending review', color: '#D4A843' },
  EXPIRED:   { zh: '已过期',   en: 'Expired',        color: '#E0846A' },
};
const LEVEL: Record<string, { zh: string; en: string; color: string }> = {
  PUBLIC:       { zh: '公开',   en: 'Public',       color: '#7A8494' },
  INTERNAL:     { zh: '内部',   en: 'Internal',     color: '#8FA8D8' },
  CONFIDENTIAL: { zh: '机密',   en: 'Confidential', color: '#E0846A' },
  ADMIN_ONLY:   { zh: '仅管理员', en: 'Admin only',  color: '#E0846A' },
};

function Badge({ label, color, title }: { label: string; color: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      color, border: `1px solid ${color}55`, background: `${color}14`,
    }}>{label}</span>
  );
}

export function VerificationBadge({ value, lang = 'zh' }: { value: string | null | undefined; lang?: string }) {
  if (!value) return null;
  const v = VERIFICATION[value] ?? { zh: value, en: value, color: '#7A8494' };
  return <Badge label={lang === 'en' ? v.en : v.zh} color={v.color} title={`verification_status: ${value}`} />;
}

export function LevelBadge({ value, lang = 'zh' }: { value: string | null | undefined; lang?: string }) {
  if (!value) return null;
  const v = LEVEL[value] ?? { zh: value, en: value, color: '#7A8494' };
  return <Badge label={lang === 'en' ? v.en : v.zh} color={v.color} title={`confidentiality: ${value}`} />;
}

export function DraftBadge({ status, lang = 'zh' }: { status: string | null | undefined; lang?: string }) {
  if (status !== 'DRAFT') return null;
  return <Badge label={lang === 'en' ? 'Draft' : '草稿'} color="#C8BDA8" title="status: DRAFT — not a final official conclusion" />;
}
