import { StatCard, AlertRow, QuickActionCard, colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { statCardSpecs, alertSpecs, quickActionSpecs } from '../data/mock';

function getGreetingKey(hour: number) {
  if (hour < 5) return 'night' as const;
  if (hour < 11) return 'morning' as const;
  if (hour < 14) return 'noon' as const;
  if (hour < 18) return 'afternoon' as const;
  return 'evening' as const;
}

function SectionHeader({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <div className="flex items-center" style={{ gap: 14, marginBottom: 20 }}>
      <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: colors.goldBase }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),rgba(203,168,92,0))' }} />
      {trailing && (
        <span className="font-mono-label" style={{ fontSize: 10.5, color: '#505A70' }}>
          {trailing}
        </span>
      )}
    </div>
  );
}

export function Home({ onFlash }: { onFlash: (msg: string) => void }) {
  const { dict, lang } = useI18n();
  const greeting = dict.greeting[getGreetingKey(new Date().getHours())];
  const greetingLine = lang === 'zh' ? `${greeting}，Chris` : `${greeting}, Chris`;

  return (
    <div style={{ maxWidth: 'var(--content-max-w)', margin: '0 auto', padding: '48px 48px 60px' }}>
      <div style={{ marginBottom: 50 }}>
        <h1
          style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          {greetingLine}
        </h1>
        <p style={{ fontSize: 15.5, color: '#7A8494', marginTop: 12, lineHeight: 1.6, maxWidth: 620 }}>
          {dict.workspace.summary}
        </p>
      </div>

      <SectionHeader label={dict.workspace.today} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 52 }}>
        {statCardSpecs.map((f, i) => (
          <StatCard
            key={i}
            data={{ ...f, label: dict.facts[f.labelKey] }}
            onClick={() => onFlash(dict.toast.enterModule(f.mod))}
          />
        ))}
      </div>

      <SectionHeader label={dict.workspace.priorityAlerts} trailing={`${alertSpecs.length} ${dict.workspace.items}`} />
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.065)',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 52,
          backdropFilter: 'blur(4px)',
        }}
      >
        {alertSpecs.map((a, i) => (
          <AlertRow
            key={i}
            data={{ ...a, text: dict.alerts[a.textKey], action: dict.alerts[a.actionKey] }}
            onClick={() => onFlash(dict.toast.enterModule(a.src))}
          />
        ))}
      </div>

      <SectionHeader label={dict.workspace.quickActions} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
        {quickActionSpecs.map((q, i) => (
          <QuickActionCard
            key={i}
            data={{ ...q, label: dict.quickActions[q.labelKey] }}
            onClick={() => onFlash(dict.toast.quickAction(dict.quickActions[q.labelKey]))}
          />
        ))}
      </div>
    </div>
  );
}
