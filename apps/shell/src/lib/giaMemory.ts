// GCI Executive Desk — GIA Learning / Memory V1.
// Lightweight store for user-confirmed corrections GIA should reuse next
// time instead of re-guessing: Drive folder mapping and business area
// mapping this round (entity alias is Round 2 — not implemented here).
// Every write here must come from an explicit user confirm/correct action
// (see BusinessAssistantEntry.tsx's call sites) — this module itself never
// decides on its own that something is worth remembering. A new active row
// for the same (memory_type, key) supersedes the old one (is_active =
// false), same pattern as gia_business_memory/gia_file_registry — history
// is kept, never deleted, so a user changing their mind later is just
// another write, not a special case.
import { supabase } from './supabase';

export type GiaMemoryType = 'drive_folder' | 'business_area' | 'entity_alias';
export type GiaMemorySource = 'user_correction' | 'user_confirmation' | 'manual';

export interface GiaMemoryRow {
  id: string;
  memory_type: GiaMemoryType;
  key: string;
  value_json: Record<string, any>;
  source: GiaMemorySource;
  confidence: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface DriveFolderMemoryValue {
  folderId: string;
  folderName: string;
}

export interface BusinessAreaMemoryValue {
  businessArea: string;
}

// Deterministic normalization only (trim + uppercase) — same key in any
// casing/spacing always maps to the same row. Not fuzzy/alias matching
// (that's Round 2's entity_alias job); this is just a stable lookup key.
export function normalizeMemoryKey(raw: string): string {
  return raw.trim().toUpperCase();
}

async function findActiveMemory(memoryType: GiaMemoryType, key: string): Promise<GiaMemoryRow | null> {
  const normalized = normalizeMemoryKey(key);
  if (!normalized) return null;
  const { data } = await supabase
    .from('gia_memory')
    .select('*')
    .eq('memory_type', memoryType)
    .eq('key', normalized)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GiaMemoryRow) || null;
}

export async function findDriveFolderMemory(key: string): Promise<GiaMemoryRow | null> {
  return findActiveMemory('drive_folder', key);
}

export async function findBusinessAreaMemory(key: string): Promise<GiaMemoryRow | null> {
  return findActiveMemory('business_area', key);
}

// Usage signal only — never touches value_json/is_active. Best-effort: a
// failure here must never block or fail the caller's real action.
export async function touchMemory(id: string): Promise<void> {
  try {
    await supabase.from('gia_memory').update({ last_used_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // best-effort only
  }
}

// A remembered Drive folder was confirmed gone (see BusinessAssistantEntry.tsx's
// describeAndRouteFile) — retire the memory so future lookups fall back to
// a real search instead of recommending a dead folder forever.
export async function markMemoryStale(id: string): Promise<void> {
  await supabase.from('gia_memory').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
}

async function writeMemory(
  memoryType: GiaMemoryType,
  key: string,
  valueJson: Record<string, any>,
  source: GiaMemorySource,
): Promise<{ ok: true; row: GiaMemoryRow } | { ok: false; error: string }> {
  const normalized = normalizeMemoryKey(key);
  if (!normalized) return { ok: false, error: 'Empty memory key' };

  const { data: existing } = await supabase
    .from('gia_memory')
    .select('id')
    .eq('memory_type', memoryType)
    .eq('key', normalized)
    .eq('is_active', true);
  if (existing && existing.length > 0) {
    await supabase.from('gia_memory').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', existing.map((r) => r.id));
  }

  const { data, error } = await supabase.from('gia_memory').insert({
    memory_type: memoryType,
    key: normalized,
    value_json: valueJson,
    source,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as GiaMemoryRow };
}

export async function rememberDriveFolder(
  key: string,
  value: DriveFolderMemoryValue,
  source: GiaMemorySource,
): Promise<{ ok: true; row: GiaMemoryRow } | { ok: false; error: string }> {
  return writeMemory('drive_folder', key, value, source);
}

export async function rememberBusinessArea(
  key: string,
  value: BusinessAreaMemoryValue,
  source: GiaMemorySource,
): Promise<{ ok: true; row: GiaMemoryRow } | { ok: false; error: string }> {
  return writeMemory('business_area', key, value, source);
}
