import { FollowUpTask } from '../types';
import { compareByBusinessId } from '../utils/businessId';

const STORAGE_KEY = 'ICARE_HISTORY_V1';

// Single source of truth for which tradeStatuses map to 'archived'.
// Keep in sync with api/crm/notion-sync.ts CLOSED_TRADE_STATUSES.
const CLOSED_TRADE_STATUSES = new Set(['暂缓', '已归档', '已成交', '已关闭']);

export function deriveQueueStatusFromTradeStatus(tradeStatus: string | undefined): 'todo' | 'archived' {
  if (!tradeStatus) return 'todo';
  return CLOSED_TRADE_STATUSES.has(tradeStatus) ? 'archived' : 'todo';
}

// Derive legacy businessId from old TASK-N-XXXXXXX IDs for upsert bridging
function legacyBizIdFromTaskId(id: string): string {
  const raw = (id || '').replace(/^TASK-N-/, '').replace(/^LEAD-N-/, '');
  if (/^\d{7}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4);  // 2026001 → 2026-001
  if (/^SB(\d+)$/i.test(raw)) {
    const n = parseInt(raw.slice(2), 10);
    return 'SB-' + String(n).padStart(3, '0');  // SB001 → SB-001
  }
  return '';
}
const SYNC_AT_KEY = 'NOTION_LAST_SYNC';

export interface SyncResult {
  tasks: FollowUpTask[];
  /**
   * Pure Notion records BEFORE merging with localStorage.
   * = the 20 Follow-up Log records from /api/notion-sync.
   * Use this (not `tasks`) as the argument to overwriteFromNotion()
   * so the cloud snapshot is always set to Follow-up Log size, not 68.
   */
  notionTasks: FollowUpTask[];
  syncedAt: string;
  newCount: number;
  updatedCount: number;
  // Authoritative today-count from API (Follow-up Log only, before orphan merge).
  // ControlCenter stat card MUST use this value, not any frontend task-list count.
  todayFollowupCount: number;
}

// Fields that Notion always overwrites
const NOTION_OVERWRITE_FIELDS: (keyof FollowUpTask)[] = [
  'tradeStatus',
  'nextFollowUpAt',
  'goal',
  'lastContext',
  'owner',
  'businessType',
  'businessCreatedAt',
  'priority',
  'notionSource', // keeps source marker fresh on every sync
];

// Fields that are local-only and must be preserved
const LOCAL_PRESERVE_FIELDS: (keyof FollowUpTask)[] = [
  'aiInsights',
  'draftZH',
  'finalBilingual',
  'suggestedAction',
  'riskNotice',
  'history',
  'attachments',
];

type SyncStatus = 'idle' | 'syncing' | 'error';
let _status: SyncStatus = 'idle';

export const notionSyncService = {
  getSyncStatus(): SyncStatus {
    return _status;
  },

  getLastSyncAt(): string | null {
    try {
      return localStorage.getItem(SYNC_AT_KEY);
    } catch {
      return null;
    }
  },

  async sync(): Promise<SyncResult> {
    _status = 'syncing';
    try {
      // Determine API base path — works in both dev and prod
      const base = typeof window !== 'undefined'
        ? window.location.origin
        : '';
      const res = await fetch(`${base}/api/crm/notion-sync`);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const incoming: FollowUpTask[] = data.tasks ?? [];

      // Load existing tasks from localStorage
      let existing: FollowUpTask[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) existing = JSON.parse(raw);
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }

      // Build lookup by leadId AND by derived legacy businessId
      // (so adminImportData records like TASK-N-2026001 merge into NOTION-xxx instead of duplicating)
      const existingByLeadId = new Map<string, FollowUpTask>();
      const existingByBizId  = new Map<string, FollowUpTask>();
      for (const t of existing) {
        if (t.leadId) existingByLeadId.set(t.leadId, t);
        // Derive legacy businessId from old TASK-N-XXXXXXX style IDs
        const bid = (t as any).businessId || legacyBizIdFromTaskId(t.id);
        if (bid) existingByBizId.set(bid, t);
      }

      let newCount = 0;
      let updatedCount = 0;
      const merged: FollowUpTask[] = [];
      const incomingLeadIds = new Set<string>();
      // Track which existing IDs were absorbed into an incoming task (to avoid re-adding them)
      const absorbedExistingIds = new Set<string>();

      for (const incomingTask of incoming) {
        incomingLeadIds.add(incomingTask.leadId);
        const incomingBizId = (incomingTask as any).businessId as string | undefined;

        // 1. Try exact leadId match
        let local = existingByLeadId.get(incomingTask.leadId);
        // 2. Fallback: match by businessId (bridges legacy adminImportData records)
        if (!local && incomingBizId) {
          local = existingByBizId.get(incomingBizId);
        }

        if (!local) {
          // New task from Notion — derive status from tradeStatus
          const derivedStatus = deriveQueueStatusFromTradeStatus(incomingTask.tradeStatus);
          merged.push({ ...incomingTask, status: derivedStatus });
          newCount++;
        } else {
          absorbedExistingIds.add(local.id); // prevent re-adding old entry later
          // Upsert: overwrite Notion-owned fields, preserve local-only fields
          const updated: FollowUpTask = { ...local };

          for (const field of NOTION_OVERWRITE_FIELDS) {
            const val = (incomingTask as any)[field];
            if (val !== undefined && val !== null && val !== '') {
              (updated as any)[field] = val;
            }
          }

          // Always update clientName and businessId from Notion
          if (incomingTask.clientName) updated.clientName = incomingTask.clientName;
          if ((incomingTask as any).businessId !== undefined) {
            (updated as any).businessId = (incomingTask as any).businessId;
          }

          // Preserve local fields explicitly (already on `updated` via spread of `local`)
          for (const field of LOCAL_PRESERVE_FIELDS) {
            (updated as any)[field] = (local as any)[field];
          }

          // Derive queue status from the (now-updated) tradeStatus.
          // Prevents status=todo / tradeStatus=暂缓 contradictions after sync.
          const prevStatus = local.status;
          updated.status = deriveQueueStatusFromTradeStatus(updated.tradeStatus);
          if (prevStatus !== updated.status) {
            console.warn(
              `[notionSync] status drift corrected for ${updated.clientName}: ` +
              `${prevStatus} → ${updated.status} (tradeStatus=${updated.tradeStatus})`
            );
          }

          merged.push(updated);
          updatedCount++;
        }
      }

      // Keep tasks not in Notion response (don't delete local-only records)
      // But skip tasks that were absorbed (merged into a Notion task by businessId match)
      for (const local of existing) {
        if (!incomingLeadIds.has(local.leadId) && !absorbedExistingIds.has(local.id)) {
          merged.push(local);
        }
      }

      // Persist
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem(SYNC_AT_KEY, data.syncedAt);
      } catch (e) {
        console.warn('[notionSync] localStorage write failed:', e);
      }

      // Log API debug stats to browser console for easy verification
      const s = data.stats ?? {};
      console.log(
        `[notion-sync debug] rawFollowupCount=${s.rawFollowupCount ?? '?'}` +
        ` | latestFollowupByBusinessIdCount=${s.latestFollowupByBusinessIdCount ?? '?'}` +
        ` | todayFollowupCount=${s.todayFollowupCount ?? '?'}` +
        ` | projectMasterCount=${s.projectMasterCount ?? '?'}` +
        ` | sbPoolCount=${s.sbPoolCount ?? '?'}`
      );

      // Sort merged tasks by businessId ascending:
      // 2026-001 < 2026-002 < ... (PROJECT) then SB001 < SB002 < ... (TRADE) then others
      merged.sort((a, b) => {
        const idA = (a as any).businessId || '';
        const idB = (b as any).businessId || '';
        return compareByBusinessId(idA, idB);
      });

      _status = 'idle';
      return {
        tasks: merged,          // Notion + preserved localStorage (full merged set)
        notionTasks: incoming,  // Pure Notion records only — use for overwriteFromNotion
        syncedAt: data.syncedAt,
        newCount,
        updatedCount,
        todayFollowupCount: s.todayFollowupCount ?? 0,
      };
    } catch (e) {
      _status = 'error';
      throw e;
    }
  },
};
