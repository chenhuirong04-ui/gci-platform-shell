// GCI Executive Desk — Task 6: Development Systems Registry (read-only this round)
// Reads directly from executive_system_registry via the authenticated Supabase
// client. No delete capability anywhere in this file.
import { supabase } from './supabase';

export interface SystemRegistryRow {
  id: string;
  system_name: string;
  category: string | null;
  lifecycle_status: string | null;
  github_repo: string | null;
  github_branch: string | null;
  latest_commit: string | null;
  vercel_project: string | null;
  production_url: string | null;
  staging_url: string | null;
  supabase_project_name: string | null;
  supabase_project_ref: string | null;
  local_machine: string | null;
  local_path: string | null;
  replaced_by: string | null;
  replaces: string | null;
  data_status: string | null;
  last_verified_at: string | null;
  notes: string | null;
  deletion_status: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSystemRegistry(): Promise<
  { ok: true; rows: SystemRegistryRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('executive_system_registry')
    .select('*')
    .order('system_name', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as SystemRegistryRow[] };
}

export interface SystemRegistrySummary {
  total: number;
  production: number;
  development: number;
  legacyOrUnknown: number;
  needsReview: number;
}

export function summarize(rows: SystemRegistryRow[]): SystemRegistrySummary {
  return {
    total: rows.length,
    production: rows.filter((r) => r.lifecycle_status === 'production').length,
    development: rows.filter((r) => r.lifecycle_status === 'development').length,
    legacyOrUnknown: rows.filter((r) => r.lifecycle_status === 'legacy' || r.lifecycle_status === 'archived' || !r.lifecycle_status || r.lifecycle_status === 'unknown').length,
    needsReview: rows.filter((r) => r.deletion_status === 'review' || r.deletion_status === 'safe_candidate').length,
  };
}
