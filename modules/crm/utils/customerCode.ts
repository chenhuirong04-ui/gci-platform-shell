import type { FollowUpTask } from '../types';
import { getTaskBusinessId } from './businessId';

// Canonical customer code for a single business record — reuses the same
// businessId derivation already shown as the badge in CustomerDirectory /
// BusinessRegister / ControlCenter, so the code in the URL always matches
// what's on screen. Falls back to the raw task id for brand-new records
// that haven't been assigned a real business id by Notion sync yet.
export function getCustomerCode(task: FollowUpTask): string {
  return (task as any).businessId || getTaskBusinessId(task.id) || task.id;
}

// Same customer-identity grouping used throughout CrmModule/CustomerDirectory
// (contactKey → clientName → id fallback) — not reinvented here.
function identityKey(t: FollowUpTask): string {
  return (t.contactKey || '').trim().toLowerCase() || (t.clientName || '').trim().toLowerCase() || t.id;
}

export interface CustomerLookup {
  task: FollowUpTask;
  relatedTasks: FollowUpTask[];
}

// Resolves a :customerCode URL param back to a task + its sibling businesses.
// Matches primarily by business code; falls back to raw task/lead id so
// records created moments ago (before their real code is assigned) still
// resolve. Returns null when nothing matches — caller renders Not Found.
export function findCustomerByCode(tasks: FollowUpTask[], code: string): CustomerLookup | null {
  const target = (code || '').trim();
  if (!target) return null;
  const matched =
    tasks.find(t => getCustomerCode(t) === target) ||
    tasks.find(t => t.id === target || t.leadId === target);
  if (!matched) return null;
  const key = identityKey(matched);
  const relatedTasks = tasks.filter(t => t.id !== matched.id && identityKey(t) === key);
  return { task: matched, relatedTasks };
}
