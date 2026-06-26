import { WorkspaceCard } from '../components/WorkspaceCard';
import { FactTile } from '../components/FactTile';
import { AlertItem } from '../components/AlertItem';
import { factTiles, priorityAlerts, quickActions } from '../data/mock';

export function Home() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {factTiles.map((f) => (
          <FactTile key={f.id} fact={f} />
        ))}
      </div>

      <WorkspaceCard title="重点提醒" subtitle={`共 ${priorityAlerts.length} 项，按优先级排序`}>
        <div className="flex flex-col">
          {priorityAlerts.map((a) => (
            <AlertItem key={a.id} alert={a} />
          ))}
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="快捷操作" subtitle="常用操作直达">
        <div className="flex flex-wrap gap-3">
          {quickActions.map((q) => (
            <button
              key={q.id}
              type="button"
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-[#dfe4ee] hover:border-white/[0.18] hover:bg-white/[0.05] transition-colors"
            >
              <span className="font-mono-label text-[#e2c988]">{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
      </WorkspaceCard>
    </div>
  );
}
