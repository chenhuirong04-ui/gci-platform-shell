interface ModulePlaceholderProps {
  title: string;
  etaLabel: string;
}

/** Shown at /crm, /trade, /quotation until each module lands here per the
 * 7-day monorepo merge plan (modules/{crm,trade,quotation}). Not a redirect
 * to the legacy domains — the route exists now so the final URL structure
 * (app.globalcareinfo.com/crm etc.) is correct from Day 1. */
export function ModulePlaceholder({ title, etaLabel }: ModulePlaceholderProps) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 48px', textAlign: 'center' }}>
      <div
        className="font-mono-label"
        style={{ fontSize: 11, letterSpacing: '0.16em', color: '#5e677e', marginBottom: 16 }}
      >
        MONOREPO MERGE · IN PROGRESS
      </div>
      <h1
        style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 28,
          fontWeight: 600,
          color: '#f0ead2',
          marginBottom: 12,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 14, color: '#a89878', lineHeight: 1.6 }}>{etaLabel}</p>
    </div>
  );
}
