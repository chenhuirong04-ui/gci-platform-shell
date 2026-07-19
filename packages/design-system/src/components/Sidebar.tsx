import type { ReactNode } from 'react';
import { logoGradient, colors } from '../tokens';

export interface NavTopItem {
  code: string;
  name: string;
  /** Defaults to true — gci-platform-shell/Quotation always show navTop as the
   * permanent highlighted anchor. Apps with internal tab-switching (e.g. Trade OS)
   * should pass `activeTab === 'home'` here instead. */
  active?: boolean;
  onClick?: () => void;
}

export interface NavModItem {
  code: string;
  name: string;
  count?: string;
  badgeColor?: string;
  badgeBg?: string;
  href?: string;
  onClick?: () => void;
  /** Highlights this row the same way navTop is highlighted — for apps where
   * navMods are internal tabs rather than external links/disabled items. */
  active?: boolean;
}

export interface NavSection {
  /** Section header label, e.g. "SALES", "SUPPLY CHAIN". */
  label: string;
  items: NavModItem[];
}

interface SidebarProps {
  /** WORKSPACE is always rendered as the first section, with its single
   * item styled as the permanent highlighted anchor (legacy navTop look). */
  navTop: NavTopItem;
  workspaceLabel: string;
  /** Remaining sections, rendered in order below WORKSPACE — SALES, SUPPLY
   * CHAIN, OPERATIONS, FINANCE, PLATFORM, etc. */
  sections: NavSection[];
  userName: string;
  userRole: string;
  /** When provided, only nav items whose `code` is in this set are rendered.
   * Pass undefined (or omit) to show all items (e.g. during loading). */
  visibleModules?: string[];
  /** Called when user clicks the sign-out icon in the user card. */
  onSignOut?: () => void;
  footer?: ReactNode;
  className?: string;
}

function NavRow({ item }: { item: NavModItem }) {
  const inner = (
    <>
      <span
        translate="no"
        className="notranslate font-mono-label flex items-center justify-center shrink-0"
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          fontSize: 9.5,
          fontWeight: 600,
          color: item.active ? colors.bgBase : '#9AAABA',
          background: item.active ? logoGradient : 'rgba(255,255,255,0.08)',
        }}
      >
        {item.code}
      </span>
      <span style={{ fontSize: 13, color: item.active ? colors.textPrimary : '#D0CBC0', fontWeight: item.active ? 500 : 400, flex: 1 }}>
        {item.name}
      </span>
      {item.count && (
        <span
          className="font-mono-label"
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: item.badgeColor,
            background: item.badgeBg,
            borderRadius: 8,
            minWidth: 20,
            textAlign: 'center',
            padding: '1px 5px',
          }}
        >
          {item.count}
        </span>
      )}
    </>
  );

  const rowStyle: React.CSSProperties = {
    gap: 11,
    padding: '9px 11px',
    borderRadius: 9,
    marginBottom: 2,
    ...(item.active
      ? { background: 'rgba(203,168,92,0.10)', border: '1px solid rgba(203,168,92,0.28)' }
      : {}),
  };

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className="nv flex items-center" style={rowStyle}>
        {inner}
      </a>
    );
  }
  return (
    <div className="nv flex items-center" style={rowStyle} onClick={item.onClick}>
      {inner}
    </div>
  );
}

export function Sidebar({ navTop, workspaceLabel, sections, userName, userRole, visibleModules, onSignOut, footer, className }: SidebarProps) {
  // When visibleModules is provided, filter nav items by module path prefix.
  // Items without a path (e.g. AI, Settings) are always shown.
  // Section headers are hidden when all their items are filtered out.
  // Maps module keys (from user_profiles.modules[]) to the path prefix they gate.
  // Paths NOT listed here are platform-level pages (AI, Invoice, etc.) and are
  // always visible to any authenticated user — no module key required.
  const MODULE_PATH_MAP: Record<string, string> = {
    crm: '/crm', trade: '/trade', quotation: '/quotation',
    finance: '/trade?tab=finance', warehouse: '/trade?tab=inventory',
  };
  const GATED_PREFIXES = Object.values(MODULE_PATH_MAP).map(p => p.split('?')[0]);

  function itemVisible(item: NavModItem): boolean {
    if (!visibleModules) return true;
    if (!item.href && !item.onClick) return true;
    const itemPath = (item as any).path as string | undefined;
    if (!itemPath) return true;
    // If this path is not claimed by any module gate, it is a platform-level page — always show.
    const isClaimed = GATED_PREFIXES.some(prefix => itemPath.startsWith(prefix));
    if (!isClaimed) return true;
    return visibleModules.some(mod => {
      const prefix = MODULE_PATH_MAP[mod];
      return prefix && itemPath.startsWith(prefix.split('?')[0]);
    });
  }
  return (
    <aside
      translate="no"
      className={`notranslate shrink-0 hidden md:flex md:flex-col relative sticky top-0 overflow-y-auto gci-sidebar${className ? ` ${className}` : ''}`}
      style={{
        width: 'var(--sidebar-w)',
        height: '100vh',
        background: 'var(--bg-shell)',
        borderRight: '1px solid rgba(203,168,92,0.07)',
        padding: '22px 14px',
      }}
    >
      <div
        className="absolute"
        style={{
          top: '20%',
          right: 0,
          width: 1,
          height: '60%',
          background: 'linear-gradient(180deg,transparent,rgba(203,168,92,0.12),transparent)',
        }}
      />

      <div
        className="flex items-center"
        style={{ gap: 11, padding: '4px 8px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 20 }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: logoGradient,
            fontFamily: "'Space Grotesk',sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: colors.bgBase,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          G
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.1 }}>
            GCI Platform
          </div>
          <div className="font-mono-label" style={{ fontSize: 9, letterSpacing: '0.16em', color: '#505A70', marginTop: 2 }}>
            UNIFIED · v1
          </div>
        </div>
      </div>

      <div className="font-mono-label" style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#4A5268', padding: '0 8px 8px' }}>
        {workspaceLabel}
      </div>
      <div
        className="nv flex items-center"
        onClick={navTop.onClick}
        style={{
          gap: 11,
          padding: '10px 11px',
          borderRadius: 10,
          marginBottom: 3,
          ...(navTop.active !== false
            ? { background: 'rgba(203,168,92,0.10)', border: '1px solid rgba(203,168,92,0.28)' }
            : { border: '1px solid transparent' }),
        }}
      >
        <span
          translate="no"
          className="notranslate font-mono-label flex items-center justify-center shrink-0"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            fontSize: 9.5,
            fontWeight: 600,
            color: navTop.active !== false ? colors.bgBase : '#9AAABA',
            background: navTop.active !== false ? logoGradient : 'rgba(255,255,255,0.08)',
          }}
        >
          {navTop.code}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: navTop.active !== false ? colors.textPrimary : '#D0CBC0', flex: 1 }}>
          {navTop.name}
        </span>
      </div>

      {sections.map((section) => {
        const visibleItems = section.items.filter(itemVisible);
        if (visibleItems.length === 0) return null;
        return (
          <div key={section.label}>
            <div className="font-mono-label" style={{ fontSize: 8.5, letterSpacing: '0.2em', color: '#4A5268', padding: '16px 8px 8px' }}>
              {section.label}
            </div>
            <nav>
              {visibleItems.map((n) => (
                <NavRow key={n.code} item={n} />
              ))}
            </nav>
          </div>
        );
      })}

      <div
        className="flex items-center"
        style={{
          marginTop: 'auto',
          gap: 10,
          padding: '11px 12px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 11,
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#3D5288,#2A3A60)', fontWeight: 600, fontSize: 12, color: '#A0B0D4' }}
        >
          {userName.charAt(0)}
        </div>
        <div className="min-w-0" style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#D8D0B8', lineHeight: 1.1 }}>{userName}</div>
          <div style={{ fontSize: 10, color: '#505A70', marginTop: 1 }}>{userRole}</div>
        </div>
        {onSignOut && (
          <span
            title="退出登录"
            onClick={onSignOut}
            style={{ color: '#4A5268', fontSize: 14, cursor: 'pointer', transition: 'color 0.14s' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#E0846A')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#4A5268')}
          >
            ⏻
          </span>
        )}
      </div>
      {footer}
    </aside>
  );
}
