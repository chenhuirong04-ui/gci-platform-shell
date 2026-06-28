import { colors, fonts } from '../tokens';

export interface PageHeaderProps {
  /** Main page title, e.g. "控制中心". Rendered in the same Space Grotesk
   * style every business page's title has used since the SALES/SUPPLY
   * CHAIN/FINANCE nav cleanup. */
  title: string;
  /** Small gold mono-label line under the title — a timestamp, an English
   * tag, etc. (matches ControlCenter's existing "nowLabel" pattern). */
  eyebrow?: string;
  /** Optional one-line description under the title/eyebrow. */
  description?: string;
  className?: string;
}

export function PageHeader({ title, eyebrow, description, className }: PageHeaderProps) {
  return (
    <div className={className}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: colors.bgBase, fontFamily: fonts.display }}>
        {title}
      </h1>
      {eyebrow && (
        <p className="font-mono-label" style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: colors.goldBase }}>
          {eyebrow}
        </p>
      )}
      {description && (
        <p style={{ fontSize: 13, color: '#64748B', marginTop: eyebrow ? 6 : 4 }}>{description}</p>
      )}
    </div>
  );
}
