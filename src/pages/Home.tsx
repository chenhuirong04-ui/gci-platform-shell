import { WorkspaceCard } from '../components/WorkspaceCard';
import { SystemEntryCard } from '../components/SystemEntryCard';
import { systems } from '../config/systems';
import { factReminders, highlights, quickLinks } from '../data/mock';

const SEVERITY_COLOR: Record<string, string> = {
  high: '#e0846a',
  mid: '#d9b45a',
  low: '#7fa8c9',
};

export function Home() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkspaceCard title="今日事实提醒" subtitle="跨系统的待处理事实，不做判断，只做提醒">
          <ul className="flex flex-col gap-3">
            {factReminders.map((f) => (
              <li key={f.id} className="flex items-start gap-3">
                <span
                  className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: SEVERITY_COLOR[f.severity] }}
                />
                <div>
                  <div className="text-[#dfe4ee] text-sm">{f.text}</div>
                  <div className="font-mono-label text-[10px] tracking-[0.12em] text-[#5e677e] mt-1">
                    {f.source}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </WorkspaceCard>

        <WorkspaceCard title="重点提醒" subtitle="本周值得特别关注的事项">
          <ul className="flex flex-col gap-4">
            {highlights.map((h) => (
              <li key={h.id} className="border-l-2 border-[#cba85c]/40 pl-4">
                <div className="text-[#e2c988] text-sm font-medium">{h.title}</div>
                <div className="text-[#8b95ad] text-xs mt-1">{h.detail}</div>
              </li>
            ))}
          </ul>
        </WorkspaceCard>
      </div>

      <WorkspaceCard title="快捷入口" subtitle="常用操作直达">
        <div className="flex flex-wrap gap-3">
          {quickLinks.map((q) => (
            <a
              key={q.id}
              href={q.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-sm text-[#bcc5d6] hover:border-white/[0.18] hover:bg-white/[0.04] transition-colors"
            >
              {q.label}
            </a>
          ))}
        </div>
      </WorkspaceCard>

      <div>
        <div className="font-mono-label text-[11px] tracking-[0.16em] text-[#cba85c] mb-3">
          模块入口
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {systems.map((s) => (
            <SystemEntryCard key={s.code} system={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
