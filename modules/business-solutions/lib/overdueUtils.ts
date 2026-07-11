export type DisplayStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type ReminderTrigger =
  | 'DUE_7D' | 'DUE_3D' | 'DUE_TODAY'
  | 'OVERDUE_1D' | 'OVERDUE_7D' | 'OVERDUE_15D' | 'OVERDUE_30D';

/**
 * Compute the display status for a receivable based on live data.
 * Overrides the stored payment_status with an OVERDUE state when warranted.
 */
export function computeDisplayStatus(
  outstanding: number,
  received: number,
  dueDate?: string | null,
  storedStatus?: string | null,
): DisplayStatus {
  if (storedStatus === 'CANCELLED') return 'CANCELLED';
  const out = Number(outstanding) || 0;
  const rec = Number(received) || 0;
  if (out <= 0.005) return 'PAID';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !!dueDate && dueDate < today;
  if (isOverdue) return 'OVERDUE';
  return rec > 0 ? 'PARTIAL' : 'PENDING';
}

/** Returns days since due_date (positive = overdue, 0 = not overdue) */
export function getDaysOverdue(dueDate?: string | null): number {
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.round((today.getTime() - due.getTime()) / 86400000);
  return Math.max(0, diff);
}

/** Returns days until due_date (positive = future, 0 = today, negative = past, Infinity = no due date) */
export function getDaysUntilDue(dueDate?: string | null): number {
  if (!dueDate) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/**
 * Returns which reminder trigger applies right now, or null if none.
 * Same receivable + trigger_type should only generate one reminder record.
 */
export function computeReminderTrigger(
  outstanding: number,
  dueDate?: string | null,
): ReminderTrigger | null {
  if ((Number(outstanding) || 0) <= 0.005 || !dueDate) return null;
  const days = getDaysUntilDue(dueDate);
  if (days > 7) return null;
  if (days >= 0) {
    if (days === 0) return 'DUE_TODAY';
    if (days <= 3) return 'DUE_3D';
    return 'DUE_7D';
  }
  const overdue = -days;
  if (overdue >= 30) return 'OVERDUE_30D';
  if (overdue >= 15) return 'OVERDUE_15D';
  if (overdue >= 7) return 'OVERDUE_7D';
  return 'OVERDUE_1D';
}

export const REMINDER_LABEL: Record<ReminderTrigger, { zh: string; en: string; urgent: boolean }> = {
  DUE_7D:      { zh: '7天内到期',  en: 'Due in 7 Days',   urgent: false },
  DUE_3D:      { zh: '3天内到期',  en: 'Due in 3 Days',   urgent: true  },
  DUE_TODAY:   { zh: '今日到期',   en: 'Due Today',        urgent: true  },
  OVERDUE_1D:  { zh: '已逾期1天',  en: '1 Day Overdue',   urgent: true  },
  OVERDUE_7D:  { zh: '已逾期7天',  en: '7 Days Overdue',  urgent: true  },
  OVERDUE_15D: { zh: '已逾期15天', en: '15 Days Overdue', urgent: true  },
  OVERDUE_30D: { zh: '逾期30天+',  en: '30+ Days Overdue',urgent: true  },
};

export const STATUS_DISPLAY: Record<DisplayStatus, { zh: string; en: string; color: string }> = {
  PENDING:   { zh: '待收款',   en: 'Pending',   color: '#64748b' },
  PARTIAL:   { zh: '部分收款', en: 'Partial',   color: '#d97706' },
  PAID:      { zh: '已收清',   en: 'Paid',      color: '#16a34a' },
  OVERDUE:   { zh: '已逾期',   en: 'Overdue',   color: '#dc2626' },
  CANCELLED: { zh: '已取消',   en: 'Cancelled', color: '#94a3b8' },
};
