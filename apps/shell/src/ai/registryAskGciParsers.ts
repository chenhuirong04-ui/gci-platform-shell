// GCI Executive Desk — Task 6: Ask GCI queries over executive_system_registry.
// Pure read-only lookups. Never fabricates a value — always UNKNOWN if unset.
import type { SystemRegistryRow } from '../lib/systemRegistry';

const SYSTEM_ALIASES: Record<string, string[]> = {
  'GCI Platform': ['gci platform', 'gci app', 'gci 平台', 'gci-platform-shell', 'gci 主系统'],
  'Chanya / 25H Bridge': ['chanya', '25h bridge', '25h-bridge', '25h bridge'],
  'Chanya Growth Agent': ['growth agent', 'chanya growth', 'growth', '社媒'],
  'MIA / GCI AI Sales Agent': ['mia', 'sales agent', 'gci ai sales'],
  'CRM Template': ['crm template', 'crm 模板'],
};

export function findRegistrySystem(raw: string, rows: SystemRegistryRow[]): SystemRegistryRow | null {
  const lower = raw.toLowerCase();
  for (const row of rows) {
    const aliases = SYSTEM_ALIASES[row.system_name] || [];
    if (aliases.some((a) => lower.includes(a.toLowerCase()))) return row;
  }
  return null;
}

export function answerRegistryQuery(raw: string, rows: SystemRegistryRow[]): string {
  // "Chanya 和 Growth 是不是共用数据库？"
  if (/共用.*(数据库|supabase)|是否共用|是不是共用/i.test(raw)) {
    const a = rows.find((r) => r.system_name.includes('Chanya / 25H'));
    const b = rows.find((r) => r.system_name.includes('Growth Agent'));
    if (a && b) {
      const same = !!a.supabase_project_ref && a.supabase_project_ref === b.supabase_project_ref;
      return same
        ? `是的,${a.system_name} 与 ${b.system_name} 共用同一个 Supabase 项目(ref: ${a.supabase_project_ref})。`
        : `不是,${a.system_name}(ref: ${a.supabase_project_ref ?? 'UNKNOWN'})与 ${b.system_name}(ref: ${b.supabase_project_ref ?? 'UNKNOWN'})使用不同的 Supabase 项目。`;
    }
  }

  // "哪些系统状态是 UNKNOWN？"
  if (/状态是\s*unknown|哪些系统.*unknown|unknown.*系统/i.test(raw)) {
    const unknowns = rows.filter((r) => !r.lifecycle_status || r.lifecycle_status === 'unknown');
    return unknowns.length === 0
      ? '目前没有 lifecycle_status 为 UNKNOWN 的系统。'
      : `状态为 UNKNOWN 的系统:${unknowns.map((r) => r.system_name).join('、')}。`;
  }

  // "哪些项目需要我审计是否可以删除？"
  if (/审计|可以删除|需要.*删除|deletion/i.test(raw)) {
    const review = rows.filter((r) => r.deletion_status === 'review' || r.deletion_status === 'safe_candidate');
    return review.length === 0
      ? '目前没有标记为需要审计 / 候选删除的系统。'
      : `需要人工审计的系统:${review.map((r) => `${r.system_name}(deletion_status: ${r.deletion_status})`).join('；')}。这些只是候选标记,正式删除前必须先做依赖检查(Production 访问、Vercel env 引用、GitHub 活跃度、Supabase 请求、Auth 用户、Storage 文件、Cron/Edge Function),本轮不做任何删除。`;
  }

  // Field lookup for a specific system: "MIA 的 Production 在哪里？" / "GCI APP 的 Supabase 是哪个？"
  const sys = findRegistrySystem(raw, rows);
  if (sys) {
    if (/supabase/i.test(raw)) {
      return `${sys.system_name} 的 Supabase:${sys.supabase_project_name ?? 'UNKNOWN'}${sys.supabase_project_ref ? `(ref: ${sys.supabase_project_ref})` : ''}。`;
    }
    if (/production|生产|部署在哪/i.test(raw)) {
      return `${sys.system_name} 的 Production:${sys.production_url ?? 'UNKNOWN'}。`;
    }
    if (/github|仓库|repo/i.test(raw)) {
      return `${sys.system_name} 的 GitHub:${sys.github_repo ?? 'UNKNOWN'}。`;
    }
    if (/vercel/i.test(raw)) {
      return `${sys.system_name} 的 Vercel project:${sys.vercel_project ?? 'UNKNOWN'}。`;
    }
    return `${sys.system_name}:status=${sys.lifecycle_status ?? 'UNKNOWN'}, Production=${sys.production_url ?? 'UNKNOWN'}, GitHub=${sys.github_repo ?? 'UNKNOWN'}, Supabase=${sys.supabase_project_name ?? 'UNKNOWN'}, deletion_status=${sys.deletion_status ?? 'unknown'}。`;
  }

  return '没有在 Registry 中找到匹配的系统,请换个说法或直接前往 Systems / 开发资产 页面查看完整列表。';
}

export const REGISTRY_QUERY_RE =
  /(mia|gci ?app|gci ?platform|chanya|growth agent|crm template)[^]*?(supabase|production|github|vercel|部署|仓库)|是否共用数据库|是不是共用数据库|共用.*(数据库|supabase)|状态是\s*unknown|哪些系统.*unknown|需要.*审计|哪些.*(可以删除|需要审计)/i;
