import { cloudPullAllKV, cloudPushAllKV } from './cloudStore';

type AnyJson = any;

const ICARE_HISTORY_V1         = 'ICARE_HISTORY_V1';
const ICARE_PROJECTS_V1        = 'ICARE_PROJECTS_V1';
const ICARE_INTERNAL_TASKS_V1  = 'ICARE_INTERNAL_TASKS_V1';

const BACKUP_KEYS: Record<string, string> = {
  [ICARE_HISTORY_V1]:        'ICARE_HISTORY_BACKUP',
  [ICARE_PROJECTS_V1]:       'ICARE_PROJECTS_BACKUP',
  [ICARE_INTERNAL_TASKS_V1]: 'ICARE_INTERNAL_TASKS_BACKUP',
};

function safeParse(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeStringify(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return 'null';
  }
}

function hasGatePassword() {
  return !!localStorage.getItem('ICARE_GATE_PASSWORD');
}

/**
 * 按 id 合并两个数组，冲突时保留 updatedAt / createdAt 较新的那条。
 * cloud 中有但 local 中没有的记录（其他设备录入）也会保留。
 */
function mergeArrayById(local: any[], cloud: any[]): any[] {
  const merged = new Map<string, any>();

  // 先放云端数据作为基准
  for (const item of cloud) {
    if (item?.id) merged.set(item.id, item);
  }

  // 用本地数据覆盖/追加：id 相同时比较时间戳，保留较新的
  for (const item of local) {
    if (!item?.id) continue;
    const existing = merged.get(item.id);
    if (!existing) {
      // 云端没有 → 本地新增，直接追加
      merged.set(item.id, item);
    } else {
      // 都有 → 比较 updatedAt，没有则比较 createdAt
      const localTime  = item.updatedAt  || item.createdAt  || '';
      const cloudTime  = existing.updatedAt || existing.createdAt || '';
      if (localTime >= cloudTime) {
        merged.set(item.id, item);
      }
      // 否则保留云端版本（already in map）
    }
  }

  return Array.from(merged.values());
}

export class PersistenceService {
  private static pushTimer: any = null;
  private static pendingKV: Record<string, AnyJson> = {};
  private static pushing = false;

  // 防止 load 时反复触发”首上云”
  private static bootstrappedKeys = new Set<string>();

  /** load：先云端（有密码才拉），否则本地 */
  static async load(key: string): Promise<AnyJson> {
    // 1) 云端优先
    if (hasGatePassword()) {
      try {
        const kv = await cloudPullAllKV();
        if (kv && Object.prototype.hasOwnProperty.call(kv, key)) {
          return kv[key];
        }
      } catch (e) {
        console.warn('[PersistenceService] cloud load failed, fallback local:', e);
      }
    }

    // 2) 本地兜底
    const localVal = safeParse(localStorage.getItem(key));

    // 3) 自动”首上云”：如果云端没有，但本地有，并且已输入密码 → 推一次
    if (hasGatePassword() && localVal != null && !this.bootstrappedKeys.has(key)) {
      this.bootstrappedKeys.add(key);
      this.pendingKV[key] = localVal;
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(async () => {
        await this.flush();
      }, 300);
    }

    return localVal;
  }

  /** save：先本地，再合并推云端（有密码才推，且防抖） */
  static async save(key: string, value: AnyJson): Promise<void> {
    localStorage.setItem(key, safeStringify(value));

    if (!hasGatePassword()) return;

    this.pendingKV[key] = value;

    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(async () => {
      await this.flush();
    }, 2000); // 从 800ms 提高到 2000ms，降低多人并发写冲突概率
  }

  /**
   * overwriteFromNotion — called after every successful Notion sync.
   *
   * Receives result.notionTasks (pure Follow-up Log records, ~20).
   * Writes ONLY those records to localStorage and cloud — no local-only
   * preservation. Follow-up Log is the sole task source; old HIST_xxx records
   * are stale and must not re-inflate ICARE_HISTORY_V1.
   *
   * Cancels any pending debounced flush before writing so a racing merge-push
   * cannot overwrite the clean snapshot.  App.tsx also sets
   * notionOverwriteInProgressRef while this runs to block the save effect.
   */
  static async overwriteFromNotion(key: string, notionRecords: any[]): Promise<void> {
    // Cancel any pending debounced push to prevent stale merge from racing
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    delete this.pendingKV[key];

    // Follow-up Log is the SOLE task source — write ONLY the incoming Notion
    // records. Do NOT preserve old HIST_xxx / local-only records; they are
    // stale and would re-inflate ICARE_HISTORY_V1 beyond Follow-up Log size.
    localStorage.setItem(key, safeStringify(notionRecords));

    if (!hasGatePassword()) return;

    try {
      // Pull cloud ONLY to preserve OTHER keys (PROJECTS, INTERNAL_TASKS).
      // We intentionally ignore cloud[key] — that's the stale snapshot.
      const cloudKV = await cloudPullAllKV();
      const newKV = { ...(cloudKV || {}), [key]: notionRecords };
      await cloudPushAllKV(newKV);

      console.log(
        `[PersistenceService] ✅ Notion overwrite: ${notionRecords.length} Notion records`
      );
    } catch (e) {
      console.warn('[PersistenceService] ❌ Notion overwrite cloud failed (non-fatal):', e);
      // Non-fatal: localStorage is already written correctly above
    }
  }

  /** flush：备份本地 → 拉云端 → 按 id 合并 → 推送 */
  static async flush(): Promise<void> {
    if (this.pushing) return;
    this.pushing = true;

    try {
      // ── Step 1：推送前先备份本地三类数据 ──────────────────────────
      for (const [dataKey, backupKey] of Object.entries(BACKUP_KEYS)) {
        const local = localStorage.getItem(dataKey);
        if (local) {
          localStorage.setItem(backupKey, local);
        }
      }

      // ── Step 2：拉取云端最新快照 ────────────────────────────────────
      const cloudKV = await cloudPullAllKV();

      // ── Step 3：对每个待推送的 key 做按 id 合并（数组类型才合并） ──
      const mergedKV: Record<string, AnyJson> = { ...(cloudKV || {}) };

      for (const [key, localValue] of Object.entries(this.pendingKV)) {
        const cloudValue = cloudKV?.[key];

        if (Array.isArray(localValue) && Array.isArray(cloudValue)) {
          mergedKV[key] = mergeArrayById(localValue, cloudValue);
        } else {
          // 非数组类型（如配置项）：本地优先直接覆盖
          mergedKV[key] = localValue;
        }
      }

      // ── Step 4：推送合并结果 ─────────────────────────────────────────
      await cloudPushAllKV(mergedKV);

      this.pendingKV = {};
      console.log('[PersistenceService] ✅ user-edit merge-push done');
    } catch (e) {
      console.warn('[PersistenceService] ❌ cloud push failed:', e);
      // 不清空 pending，下次重试
    } finally {
      this.pushing = false;
    }
  }
}
