import { supabase } from './supabaseClient';

type AnyJson = any;

export type SnapshotDoc = {
  __meta: { updatedAt: string; device?: string };
  kv: Record<string, AnyJson>;
};

const DEVICE_ID_KEY = 'ICARE_DEVICE_ID';
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getGatePassword(): string {
  return localStorage.getItem('ICARE_GATE_PASSWORD') || '';
}

async function invokeQuickApi(body: any) {
  const action = body?.action || 'unknown';
  console.log(`[CloudStore] invokeQuickApi → action=${action} | project=mrrsbixkuqsynpucmggc`);
  const { data, error } = await supabase.functions.invoke('quick-api', { body });
  if (error) {
    console.error(`[CloudStore] ❌ quick-api error (${action}):`, error.message || error);
    throw error;
  }
  if (data?.ok === false) {
    console.error(`[CloudStore] ❌ quick-api returned ok:false (${action}):`, data?.error);
    throw new Error(data?.error || 'quick-api failed');
  }
  console.log(`[CloudStore] ✅ quick-api success (${action})`);
  return data;
}

/** ✅ pull：从云端拉快照 */
export async function cloudPullSnapshot(): Promise<SnapshotDoc | null> {
  const password = getGatePassword();
  if (!password) return null;

  const data = await invokeQuickApi({ action: 'pull_snapshot', password });

  // 兼容多种返回结构
  const raw = (data?.data ?? data?.value ?? data?.snapshot ?? data?.doc ?? null) as any;
  if (!raw) return null;

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as SnapshotDoc;
    } catch {
      return null;
    }
  }
  return raw as SnapshotDoc;
}

/** ✅ push：把快照推到云端（多种 body 兼容尝试，直到成功） */
export async function cloudPushSnapshot(doc: SnapshotDoc): Promise<void> {
  const password = getGatePassword();
  if (!password) throw new Error('missing gate password');

  const candidates = [
    { action: 'push_snapshot', password, payload: doc },
    { action: 'push_snapshot', password, doc },
    { action: 'push_snapshot', password, data: doc },
    { action: 'push_snapshot', password, snapshot: doc },
    // 万一后端只要 kv/meta：
    { action: 'push_snapshot', password, kv: doc.kv, __meta: doc.__meta },
    { action: 'push_snapshot', password, kv: doc.kv, meta: doc.__meta },
  ];

  let lastErr: any = null;
  for (const body of candidates) {
    try {
      const res = await invokeQuickApi(body);
      // 兼容：有的函数返回 { ok:true } 有的直接返回 { success:true }
      if (res?.ok === true || res?.success === true || res?.authorized === true || res?.status === 'ok') {
        return;
      }
      // 没显式 ok，也算成功（有些实现不返回 ok）
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('push_snapshot failed');
}

/** ✅ exportService 需要的：导出云端快照 */
export async function cloudExportAll() {
  return cloudPullSnapshot();
}

/** ✅ 一次性拿到云端 kv（不存在就空对象） */
export async function cloudPullAllKV(): Promise<Record<string, AnyJson>> {
  const snap = await cloudPullSnapshot();
  return snap?.kv || {};
}

/** ✅ 把 kv 整包推上云（写入 SNAPSHOT_V1） */
export async function cloudPushAllKV(kv: Record<string, AnyJson>): Promise<void> {
  const doc: SnapshotDoc = {
    __meta: { updatedAt: new Date().toISOString(), device: getDeviceId() },
    kv,
  };
  await cloudPushSnapshot(doc);
}
