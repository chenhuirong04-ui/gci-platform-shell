// GCI Executive Desk — Task 8/9: /decisions — Decision Inbox history +
// execution follow-through. Read/record only. Every action here writes only
// to executive_decisions — no external action of any kind.
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  refreshPendingDecisions,
  getDecisions,
  recordDecision,
  setExecutionDetails,
  updateExecutionStatus,
  canTransitionExecutionStatus,
  DECISION_SOURCE_LABEL,
  EXECUTION_STATUS_LABEL,
  type ExecutiveDecision,
  type DecisionSource,
  type ExecutionStatus,
  type RecordDecisionInput,
} from '../lib/decisionInbox';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };

type Filter = 'all' | 'pending' | 'decided' | 'dismissed' | DecisionSource;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: 'Pending' },
  { key: 'decided', label: 'Decided' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'crm', label: 'CRM' },
  { key: 'business', label: 'Business' },
  { key: 'systems', label: 'Systems' },
  { key: 'email', label: 'Email' },
  { key: 'agents', label: 'Agents' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', decided: 'Decided', dismissed: 'Dismissed' };
const STATUS_COLOR: Record<string, string> = { pending: AMBER, decided: GREEN, dismissed: MUTED };
const EXEC_COLOR: Record<ExecutionStatus, string> = { not_required: MUTED, pending: MUTED, in_progress: AMBER, completed: GREEN, blocked: RED };

const inputStyle: CSSProperties = {
  padding: '5px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${BORD}`, color: colors.textPrimary, flex: 1, minWidth: 100,
};
const smallBtn = (active: boolean): CSSProperties => ({
  padding: '5px 11px', borderRadius: 7, fontSize: 11, cursor: 'pointer',
  background: active ? 'rgba(203,168,92,0.14)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(203,168,92,0.4)' : BORD}`,
  color: active ? GOLD : MUTED,
});

// ── Inline optional execution-plan mini-form, shared shape for pending decisions ──
function ExecutionPlanFields({ onChange }: { onChange: (v: RecordDecisionInput) => void }) {
  const [assignee, setAssignee] = useState('');
  const [dueText, setDueText] = useState('');
  const [note, setNote] = useState('');
  const [followUpText, setFollowUpText] = useState('');

  function emit(next: Partial<{ assignee: string; dueText: string; note: string; followUpText: string }>) {
    const merged = { assignee, dueText, note, followUpText, ...next };
    onChange({
      assignee: merged.assignee || undefined,
      executionDueText: merged.dueText || undefined,
      executionNote: merged.note || undefined,
      followUpText: merged.followUpText || undefined,
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <input style={inputStyle} placeholder="负责人" value={assignee} onChange={(e) => { setAssignee(e.target.value); emit({ assignee: e.target.value }); }} />
      <input style={inputStyle} placeholder="完成时间 如: 明天" value={dueText} onChange={(e) => { setDueText(e.target.value); emit({ dueText: e.target.value }); }} />
      <input style={inputStyle} placeholder="执行说明" value={note} onChange={(e) => { setNote(e.target.value); emit({ note: e.target.value }); }} />
      <input style={inputStyle} placeholder="复查时间 如: 周三" value={followUpText} onChange={(e) => { setFollowUpText(e.target.value); emit({ followUpText: e.target.value }); }} />
    </div>
  );
}

function ExecutionStatusPanel({ d, onTransition, onSetDetails }: {
  d: ExecutiveDecision;
  onTransition: (id: string, current: ExecutionStatus, next: ExecutionStatus) => void;
  onSetDetails: (id: string, input: { assignee?: string; executionDueText?: string; executionNote?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [dueText, setDueText] = useState('');
  const [note, setNote] = useState('');

  if (!d.execution_status || d.execution_status === 'not_required') {
    return (
      <div style={{ marginTop: 8 }}>
        <div onClick={() => setExpanded((v) => !v)} style={{ fontSize: 10.5, color: MUTED, cursor: 'pointer', width: 'fit-content' }}>
          {expanded ? '− 收起' : '+ 设置执行安排'}
        </div>
        {expanded && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <input style={inputStyle} placeholder="负责人" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            <input style={inputStyle} placeholder="完成时间 如: 明天" value={dueText} onChange={(e) => setDueText(e.target.value)} />
            <input style={inputStyle} placeholder="执行说明" value={note} onChange={(e) => setNote(e.target.value)} />
            <button
              onClick={() => onSetDetails(d.id, { assignee: assignee || undefined, executionDueText: dueText || undefined, executionNote: note || undefined })}
              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD }}
            >
              保存
            </button>
          </div>
        )}
      </div>
    );
  }

  const color = EXEC_COLOR[d.execution_status];
  const nextOptions: { key: ExecutionStatus; label: string }[] = [
    { key: 'in_progress', label: '开始执行' },
    { key: 'blocked', label: '标记卡住' },
    { key: 'completed', label: '标记完成' },
  ].filter((o) => canTransitionExecutionStatus(d.execution_status as ExecutionStatus, o.key));

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORD}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 6px', fontFamily: 'IBM Plex Mono,monospace' }}>
          执行:{EXECUTION_STATUS_LABEL[d.execution_status]}
        </span>
        {d.assignee && <span style={{ fontSize: 11, color: MUTED }}>负责人:{d.assignee}</span>}
        {d.execution_due_at && <span style={{ fontSize: 11, color: MUTED }}>截止:{formatDate(d.execution_due_at)}</span>}
        {d.completed_at && <span style={{ fontSize: 11, color: GREEN }}>完成于:{formatDate(d.completed_at)}</span>}
      </div>
      {d.execution_note && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{d.execution_note}</div>}
      {nextOptions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {nextOptions.map((o) => (
            <button key={o.key} onClick={() => onTransition(d.id, d.execution_status as ExecutionStatus, o.key)} style={smallBtn(false)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Decisions() {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<ExecutiveDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingInputs, setPendingInputs] = useState<Record<string, RecordDecisionInput>>({});

  function loadAll() {
    // Sync candidates once (idempotent, cooldown-aware), then load the full history.
    refreshPendingDecisions().then((syncRes) => {
      if (!syncRes.ok) { setError(syncRes.error); return; }
      getDecisions().then((res) => {
        if (res.ok) setDecisions(res.rows);
        else setError(res.error);
      });
    });
  }

  useEffect(() => { loadAll(); }, []);

  function reload() {
    getDecisions().then((res) => { if (res.ok) setDecisions(res.rows); });
  }

  async function handleDecide(id: string, optionKey: string) {
    setBusyId(id);
    await recordDecision(id, optionKey, pendingInputs[id] || {});
    setBusyId(null);
    reload();
  }

  async function handleTransition(id: string, current: ExecutionStatus, next: ExecutionStatus) {
    setBusyId(id);
    await updateExecutionStatus(id, current, next);
    setBusyId(null);
    reload();
  }

  async function handleSetDetails(id: string, input: { assignee?: string; executionDueText?: string; executionNote?: string }) {
    setBusyId(id);
    await setExecutionDetails(id, input);
    setBusyId(null);
    reload();
  }

  const filtered = useMemo(() => {
    if (!decisions) return [];
    if (filter === 'all') return decisions;
    if (filter === 'pending' || filter === 'decided' || filter === 'dismissed') {
      return decisions.filter((d) => d.status === filter);
    }
    return decisions.filter((d) => d.source === filter);
  }, [decisions, filter]);

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
          Decision Inbox / 老板审批箱
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              background: filter === f.key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filter === f.key ? 'rgba(203,168,92,0.5)' : BORD}`,
              color: filter === f.key ? GOLD : MUTED,
              fontWeight: filter === f.key ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>
          读取失败:{error}
        </div>
      )}
      {!decisions && !error && <div style={{ color: MUTED, fontSize: 13 }}>加载中…</div>}
      {decisions && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>没有符合条件的事项</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((d) => {
          const pColor = PRIORITY_COLOR[d.priority] ?? MUTED;
          const sColor = STATUS_COLOR[d.status] ?? MUTED;
          return (
            <div key={d.id} style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, opacity: busyId === d.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: pColor, background: `${pColor}18`, border: `1px solid ${pColor}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {d.priority}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {STATUS_LABEL[d.status]}
                </span>
                <span style={{ fontSize: 9.5, color: '#8FA6D4', background: 'rgba(143,166,212,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                  {DECISION_SOURCE_LABEL[d.source]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{d.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: MUTED, fontFamily: 'IBM Plex Mono,monospace' }}>{formatDate(d.created_at)}</span>
              </div>

              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 6 }}>
                <span style={{ color: GOLD, fontWeight: 700 }}>Reason: </span>{d.reason}
              </div>
              {d.summary && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 6 }}>{d.summary}</div>}
              {d.follow_up_at && (
                <div style={{ fontSize: 11, color: GOLD, marginBottom: 6 }}>复查时间:{formatDate(d.follow_up_at)}</div>
              )}

              {d.status === 'pending' ? (
                <>
                  <ExecutionPlanFields onChange={(v) => setPendingInputs((prev) => ({ ...prev, [d.id]: v }))} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {d.decision_options.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => handleDecide(d.id, opt.key)}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                          background: opt.key === 'later' ? 'rgba(255,255,255,0.04)' : 'rgba(203,168,92,0.12)',
                          border: `1px solid ${opt.key === 'later' ? BORD : 'rgba(203,168,92,0.4)'}`,
                          color: opt.key === 'later' ? MUTED : GOLD,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : d.status === 'decided' ? (
                <>
                  <div style={{ fontSize: 11.5, color: GREEN, marginTop: 4 }}>
                    已选择:{d.decision_options.find((o) => o.key === d.selected_option)?.label ?? d.selected_option} · {formatDate(d.decided_at)}
                  </div>
                  <ExecutionStatusPanel d={d} onTransition={handleTransition} onSetDetails={handleSetDetails} />
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>已忽略</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
