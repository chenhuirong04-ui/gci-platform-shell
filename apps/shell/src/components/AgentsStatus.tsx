// GCI Executive Desk — AI Agents Status (Task 4.1).
// Read-only summary cards for external agents that continue to run
// independently. No agent execution, no writes, no fabricated data —
// a card shows "待接入" whenever no stable read source is confirmed.
import { colors } from '@gci/design-system';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

export type AgentStatus = 'healthy' | 'warning' | 'error' | 'no_data' | 'deferred';

export interface AgentChannel {
  label: string;
  connected: boolean;
  note?: string;
}

export interface AgentCard {
  name: string;
  status: AgentStatus;
  lastUpdated: string | null;
  todaySummary: string;
  metrics: { label: string; value: string }[];
  issues: string[];
  needsChris: number;
  sourceUrl: string | null;
  channels?: AgentChannel[];
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  error: 'Error',
  no_data: '待接入 / No stable data source',
  deferred: 'Deferred / 后续接入',
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  healthy: '#6FBF8E',
  warning: AMBER,
  error: RED,
  no_data: MUTED,
  deferred: GOLD,
};

// Identification confirmed via direct Vercel/GitHub/Supabase inspection this
// round (Task 4.1) — never guessed. See conversation record for the audit trail.
// Task 13: fixed naming going into the MIA/E-commerce/Growth integration
// rounds (14.1/14.2). Email Assistant is intentionally NOT listed here —
// it's a built-in GCI feature (Task 11.1), not an external agent, and its
// signal already appears as the Home "重要客户邮件" KPI + /email-assistant
// — listing it again here was a duplicate entry point.
export const AGENTS: AgentCard[] = [
  {
    name: 'MIA｜客户开发 AI',
    status: 'no_data',
    lastUpdated: null,
    todaySummary: 'Production 需要登录(邮箱+密码),未提供公开 status API,无法在不接触凭据的前提下读取真实状态。接入前不会显示"今日新开发潜客"等数字。',
    metrics: [],
    issues: ['Production 登录墙(无匿名可读页面)', '仓库内仅有 /api/cron/mia-daily 与 /api/gmail,均非状态查询接口'],
    needsChris: 0,
    sourceUrl: 'https://gci-ai-sales-agent.vercel.app',
  },
  {
    // Task 13: renamed from "NOON Agent" — this is the umbrella e-commerce
    // channel product, of which NOON is only the first channel. No new
    // channel is actually connected/read this round — Amazon/Tradeling/
    // Website are plain NOT CONNECTED labels, not fabricated data.
    name: 'E-commerce Assistant｜电商助理',
    status: 'no_data',
    lastUpdated: null,
    todaySummary: '未在当前 Vercel / GitHub 账号中找到匹配项目,身份未确认(UNKNOWN)。渠道读取本轮均未接入。',
    metrics: [],
    issues: ['未定位到 GitHub repo / Production URL / Supabase project'],
    needsChris: 0,
    sourceUrl: null,
    channels: [
      { label: 'NOON', connected: true, note: '已有基础' },
      { label: 'Amazon', connected: false },
      { label: 'Tradeling', connected: false },
      { label: 'Website', connected: false },
    ],
  },
  {
    name: 'Growth Agent｜内容增长',
    status: 'deferred',
    lastUpdated: null,
    todaySummary: '数据源(growth_job_runs / growth_publish_jobs)真实存在,但与 Chanya / 25H Bridge 共用同一个 Supabase 项目(fieqffsqvptweetfzvkh)。本阶段不为 Executive Desk 扩大对主产品数据库的访问权限,后续单独接入。',
    metrics: [],
    issues: [],
    needsChris: 0,
    sourceUrl: 'https://chanya-growth-agent-v1.vercel.app',
  },
];

function AgentCardView({ agent }: { agent: AgentCard }) {
  const color = STATUS_COLOR[agent.status];
  return (
    <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{agent.name}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 7px', fontFamily: 'IBM Plex Mono,monospace' }}>
          {STATUS_LABEL[agent.status]}
        </span>
      </div>

      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{agent.todaySummary}</div>

      {agent.metrics.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {agent.metrics.map((m, i) => (
            <div key={i} style={{ fontSize: 12, color: colors.textPrimary }}>
              <span style={{ color: MUTED }}>{m.label}: </span>
              <strong>{m.value}</strong>
            </div>
          ))}
        </div>
      )}

      {agent.issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {agent.issues.map((iss, i) => (
            <div key={i} style={{ fontSize: 11, color: RED }}>⚠ {iss}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: MUTED, marginTop: 2 }}>
        <span>Needs Chris: {agent.needsChris}</span>
        <span>Last updated: {agent.lastUpdated ?? '—'}</span>
      </div>
    </div>
  );
}

export function AgentsStatus() {
  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          AI AGENTS STATUS · AI 员工状态
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {AGENTS.map((a) => (
          <AgentCardView key={a.name} agent={a} />
        ))}
      </div>
    </div>
  );
}
