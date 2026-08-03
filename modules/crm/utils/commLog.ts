import type { FollowUpLog } from '../types';

// FollowUpLog.type carries both real human/customer communications and
// system-generated audit entries (record created, AI analysis finished,
// status changes). "最近沟通" views must only surface the former — this
// allow-list is intentionally narrow so new system log types default to
// hidden rather than leaking into a "communications" feed by accident.
const REAL_COMM_TYPES = new Set(['follow_up', 'SENT', 'REPLY_RCVD', 'CORRECTED', 'FILE_ADDED']);

export function isRealCommLog(entry: Pick<FollowUpLog, 'type'>): boolean {
  return REAL_COMM_TYPES.has((entry as any).type);
}
