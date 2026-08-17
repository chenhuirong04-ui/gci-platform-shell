// GCI Executive Desk — Task 16: /tasks — Business To-Do list.
// Not a project management system: Today/Overdue/This Week/No Date/
// Completed views + business-area filter, mark in-progress/completed/
// cancelled. All writes are direct user actions on this page (no AI
// involved here) — reused by the Boss Action Center / Daily Brief / chat
// capture, never a second source of truth.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  getExecutiveTasks, updateExecutiveTaskStatus, taskUrgency, BUSINESS_AREA_LABEL,
  type ExecutiveTask, type TaskBusinessArea, type TaskStatus,
} from '../lib/executiveTasks';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type ViewFilter = 'today' | 'overdue' | 'week' | 'nodate' | 'completed';
type AreaFilter = 'all' | TaskBusinessArea;

const VIEWS: { key: ViewFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This Week' },
  { key: 'nodate', label: 'No Date' },
  { key: 'completed', label: 'Completed' },
];

const AREAS: { key: AreaFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '25H_AI', label: '25H / AI' },
  { key: 'TRADE', label: 'Trade' },
  { key: 'WORKFORCE', label: 'Workforce' },
  { key: 'ECOMMERCE', label: 'Ecommerce' },
  { key: 'COMPANY_ADMIN', label: 'Company' },
  { key: 'OTHER', label: 'Other' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  return `${mo}/${da}`;
}

function dubaiDateStr(ms: number): string {
  return new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ExecutiveTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewFilter>('today');
  const [area, setArea] = useState<AreaFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    getExecutiveTasks().then((res) => { if (res.ok) setTasks(res.rows); else setError(res.error); });
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: TaskStatus) {
    setBusyId(id);
    const res = await updateExecutiveTaskStatus(id, status);
    setBusyId(null);
    if (res.ok) load();
  }

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const nowMs = Date.now();
    const todayDubai = dubaiDateStr(nowMs);
    const weekEndMs = nowMs + 7 * 86400000;

    let list = tasks;
    if (area !== 'all') list = list.filter((t) => t.business_area === area);

    if (view === 'completed') {
      return list.filter((t) => t.status === 'completed' || t.status === 'cancelled');
    }
    list = list.filter((t) => t.status === 'open' || t.status === 'in_progress');

    if (view === 'overdue') {
      return list.filter((t) => t.due_at && new Date(t.due_at).getTime() < nowMs);
    }
    if (view === 'today') {
      return list.filter((t) => t.due_at && dubaiDateStr(new Date(t.due_at).getTime()) === todayDubai);
    }
    if (view === 'week') {
      return list.filter((t) => t.due_at && new Date(t.due_at).getTime() >= nowMs && new Date(t.due_at).getTime() <= weekEndMs);
    }
    if (view === 'nodate') {
      return list.filter((t) => !t.due_at);
    }
    return list;
  }, [tasks, view, area]);

  const nowMs = Date.now();

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
          ← 返回
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          Business To-Do / 商务待办
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', background: view === v.key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${view === v.key ? 'rgba(203,168,92,0.5)' : BORD}`, color: view === v.key ? GOLD : MUTED, fontWeight: view === v.key ? 700 : 400 }}>
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {AREAS.map((a) => (
          <button key={a.key} onClick={() => setArea(a.key)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer', background: area === a.key ? 'rgba(143,166,212,0.16)' : 'rgba(255,255,255,0.03)', border: `1px solid ${area === a.key ? 'rgba(143,166,212,0.4)' : BORD}`, color: area === a.key ? '#8FA6D4' : MUTED }}>
            {a.label}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>读取失败:{error}</div>}
      {!tasks && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}
      {tasks && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>没有符合条件的待办</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((t) => {
          const urgency = taskUrgency(t, nowMs);
          const color = urgency === 'P1' ? RED : urgency === 'P2' ? AMBER : MUTED;
          const isDone = t.status === 'completed' || t.status === 'cancelled';
          return (
            <div key={t.id} style={{ padding: '14px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, opacity: busyId === t.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                {!isDone && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                    {urgency}
                  </span>
                )}
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                  {BUSINESS_AREA_LABEL[t.business_area]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, textDecoration: isDone ? 'line-through' : 'none' }}>{t.title}</span>
                {t.due_at && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace' }}>{formatDate(t.due_at)}</span>}
              </div>
              {t.description && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>{t.description}</div>}
              {!isDone && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {t.status === 'open' && (
                    <button disabled={busyId === t.id} onClick={() => setStatus(t.id, 'in_progress')} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>标记进行中</button>
                  )}
                  <button disabled={busyId === t.id} onClick={() => setStatus(t.id, 'completed')} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>标记完成</button>
                  <button disabled={busyId === t.id} onClick={() => setStatus(t.id, 'cancelled')} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
