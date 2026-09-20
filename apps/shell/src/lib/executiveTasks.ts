// GCI Executive Desk — Task 16: Business To-Do (executive_tasks).
// Lightweight capture pool — not a project management system. No writes
// happen without an explicit Chris confirmation from the caller.
import { supabase } from './supabase';

export type TaskBusinessArea = '25H_AI' | 'TRADE' | 'WORKFORCE' | 'ECOMMERCE' | 'COMPANY_ADMIN' | 'OTHER';
export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'P1' | 'P2' | 'P3';

export interface ExecutiveTask {
  id: string;
  title: string;
  description: string | null;
  business_area: TaskBusinessArea;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  reminder_at: string | null;
  related_customer_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Added by 20260921000200_icare_tasks_schema.sql. Optional so rows read before that
  // migration (or built elsewhere) stay valid; `select('*')` returns them once present.
  owner?: string | null;
  blocker?: string | null;
  logs?: unknown[] | null;
}

export const BUSINESS_AREA_LABEL: Record<TaskBusinessArea, string> = {
  '25H_AI': '25H / AI',
  TRADE: 'Trade',
  WORKFORCE: 'Workforce',
  ECOMMERCE: 'Ecommerce',
  COMPANY_ADMIN: 'Company',
  OTHER: 'Other',
};

// GIA Planner confirm-card business-area editor (Home) — same enum as
// BUSINESS_AREA_LABEL above, Chinese labels. Mirrors the exact ZH strings
// Tasks.tsx's own area filter already uses (贸易/劳务/电商/公司事务/其他), so
// this editor and /tasks never disagree on what a value is called.
export const BUSINESS_AREA_LABEL_ZH: Record<TaskBusinessArea, string> = {
  '25H_AI': '25H / AI',
  TRADE: '贸易',
  WORKFORCE: '劳务',
  ECOMMERCE: '电商',
  COMPANY_ADMIN: '公司事务',
  OTHER: '其他',
};

export const ALL_BUSINESS_AREAS: TaskBusinessArea[] = ['25H_AI', 'TRADE', 'WORKFORCE', 'ECOMMERCE', 'COMPANY_ADMIN', 'OTHER'];

export async function getExecutiveTasks(): Promise<{ ok: true; rows: ExecutiveTask[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.from('executive_tasks').select('*').order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as ExecutiveTask[] };
}

export async function createExecutiveTask(input: {
  title: string;
  description?: string | null;
  businessArea: TaskBusinessArea;
  dueAt?: string | null;
  reminderAt?: string | null;
  relatedCustomerId?: string | null;
  priority?: TaskPriority;
  // Internal Tasks tab (CRM module). All optional: existing callers are unaffected and
  // keep source 'business_assistant', status 'open' and no owner/blocker.
  status?: TaskStatus;
  owner?: string | null;
  blocker?: string | null;
  source?: string;
}): Promise<{ ok: true; task: ExecutiveTask } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    business_area: input.businessArea,
    due_at: input.dueAt ?? null,
    reminder_at: input.reminderAt ?? null,
    related_customer_id: input.relatedCustomerId ?? null,
    priority: input.priority ?? (input.dueAt ? 'P2' : 'P3'),
    source: input.source ?? 'business_assistant',
  };
  // Only sent when given, so a database without the tasks-schema migration keeps working for every existing caller.
  if (input.status) row.status = input.status;
  if (input.owner !== undefined) row.owner = input.owner;
  if (input.blocker !== undefined) row.blocker = input.blocker;
  if (input.status === 'completed') row.completed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('executive_tasks')
    .insert(row)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, task: data as ExecutiveTask };
}

// GIA Foundation §A.3/A.4 — reschedule ("SHADI这件事下周再提醒我"), separate
// from status changes. Never touches status — a task can be rescheduled
// any number of times while staying open/in_progress.
export async function updateExecutiveTaskDueDate(
  id: string,
  dueAt: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('executive_tasks').update({ due_at: dueAt, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateExecutiveTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === 'completed') update.completed_at = new Date().toISOString();
  const { error } = await supabase.from('executive_tasks').update(update).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// General edit used by the CRM "Internal Tasks" tab. Only the fields present in `patch` are written, so a
// caller that changes just the title never touches status or completed_at. completed_at is set to "now" only
// when status is CHANGED to completed here (a real completion), and cleared when it is moved back out of
// completed; tasks migrated from iCare keep completed_at NULL until someone completes them in the app.
export async function updateExecutiveTask(
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    businessArea?: TaskBusinessArea;
    status?: TaskStatus;
    owner?: string | null;
    blocker?: string | null;
    dueAt?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.businessArea !== undefined) update.business_area = patch.businessArea;
  if (patch.owner !== undefined) update.owner = patch.owner;
  if (patch.blocker !== undefined) update.blocker = patch.blocker;
  if (patch.dueAt !== undefined) update.due_at = patch.dueAt;
  if (patch.status !== undefined) {
    update.status = patch.status;
    update.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
  }
  const { error } = await supabase.from('executive_tasks').update(update).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Internal Tasks board: columns are derived, there is no extra status value ──
// 待处理 = open · 进行中 = in_progress without a blocker · 等待他人 = in_progress WITH a blocker · 已完成 = completed / cancelled.
export type InternalTaskColumn = 'pending' | 'in_progress' | 'waiting' | 'done';

export function internalTaskColumn(t: Pick<ExecutiveTask, 'status' | 'blocker'>): InternalTaskColumn {
  if (t.status === 'completed' || t.status === 'cancelled') return 'done';
  if (t.status === 'in_progress') return (t.blocker ?? '').trim() ? 'waiting' : 'in_progress';
  return 'pending';
}

/** status + blocker to store for a column. `blocker` is only kept for the waiting column. */
export function internalColumnToFields(col: InternalTaskColumn, blocker: string): { status: TaskStatus; blocker: string | null } {
  switch (col) {
    case 'done': return { status: 'completed', blocker: null };
    case 'waiting': return { status: 'in_progress', blocker: blocker.trim() || null };
    case 'in_progress': return { status: 'in_progress', blocker: null };
    default: return { status: 'open', blocker: null };
  }
}

// Due dates are stored as a real instant at 09:00 Asia/Dubai (same convention as the iCare migration and /tasks).
export function dueAtToDateInput(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const d = new Date(new Date(dueAt).getTime() + 4 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function dateInputToDueAt(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T09:00:00+04:00` : null;
}

// /tasks "已完成" tab only — a real hard delete, called only after the
// page's own confirm step. Never used for open/in_progress tasks.
export async function deleteExecutiveTask(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('executive_tasks').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Task 16 §十四 — priority derived from due_at, same real-epoch comparison
// rule used everywhere else in this codebase (never a Dubai-shifted epoch
// for the comparison itself, only for date-string display).
export function taskUrgency(t: ExecutiveTask, nowMs: number): TaskPriority {
  if (!t.due_at) return 'P3';
  const dueMs = new Date(t.due_at).getTime();
  if (dueMs < nowMs) return 'P1'; // overdue
  const hoursUntil = (dueMs - nowMs) / 3600000;
  if (hoursUntil <= 24) return 'P1';
  if (hoursUntil <= 48) return 'P2';
  return 'P3';
}
