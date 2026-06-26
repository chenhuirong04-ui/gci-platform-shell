import { FactCard } from '../components/FactCard';
import { AlertRow } from '../components/AlertRow';
import { QuickActionCard } from '../components/QuickActionCard';
import { factTiles, priorityAlerts, quickActions, summaryLine } from '../data/mock';
import { aLabel, aLine } from '../theme/accent';

function getGreeting(hour: number) {
  if (hour < 5) return '凌晨好';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function SectionHeader({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <div className="flex items-center" style={{ gap: 14, marginBottom: 20 }}>
      <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: aLabel }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: aLine }} />
      {trailing && (
        <span className="font-mono-label" style={{ fontSize: 10.5, color: '#505A70' }}>
          {trailing}
        </span>
      )}
    </div>
  );
}

export function Home({ onFlash }: { onFlash: (msg: string) => void }) {
  const greeting = getGreeting(new Date().getHours());
  const go = (name: string) => onFlash(`进入 ${name} 模块 — 待接入`);

  return (
    <main className="flex-1 min-w-0 overflow-y-auto relative" style={{ animation: 'fadeUp .4s ease both' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 48px 60px' }}>
        <div style={{ marginBottom: 50 }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
              color: '#F0EAD2',
              margin: 0,
            }}
          >
            {greeting}，Chris
          </h1>
          <p style={{ fontSize: 15.5, color: '#7A8494', marginTop: 12, lineHeight: 1.6, maxWidth: 620 }}>
            {summaryLine}
          </p>
        </div>

        <SectionHeader label="TODAY" />
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 52 }}
        >
          {factTiles.map((f) => (
            <FactCard key={f.id} fact={f} onClick={() => go(f.mod)} />
          ))}
        </div>

        <SectionHeader label="PRIORITY ALERTS" trailing={`${priorityAlerts.length} ITEMS`} />
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
          {priorityAlerts.map((a) => (
            <AlertRow key={a.id} alert={a} onClick={() => go(a.mod)} />
          ))}
        </div>

        <SectionHeader label="QUICK ACTIONS" />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
          {quickActions.map((q) => (
            <QuickActionCard
              key={q.id}
              action={q}
              onClick={() => onFlash(`${q.label} · 已触发（原型）— 待接入`)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
