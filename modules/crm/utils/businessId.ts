// Derives display business ID from a FollowUpTask ID
// TASK-N-2026001 → 2026-001 | TASK-N-SB001 → SB-001 | TASK-N-SOURCE-TIME → SOURCE-TIME
export function getTaskBusinessId(id: string): string {
  // NOTION-xxx IDs are internal keys — businessId must come from task.businessId field
  if ((id || '').startsWith('NOTION-')) return '';
  const raw = (id || '').replace(/^TASK-N-/, '').replace(/^LEAD-N-/, '');
  if (/^\d{7}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4);
  if (/^SB(\d+)$/i.test(raw)) {
    const n = parseInt(raw.slice(2), 10);
    return 'SB-' + String(n).padStart(3, '0');
  }
  if (raw.startsWith('HIST_') || raw.startsWith('P_') || raw.startsWith('NOTION-')) return '';
  return raw;
}

// Derives display business ID from a Project ID
// PROJ-N-2026003 → 2026-003 | PROJ-N-SOURCE-TIME → SOURCE-TIME | P_XXXXXX → ''
export function getProjectBusinessId(id: string): string {
  // P_XXXXXX are internal timestamp IDs (auto-generated) — no business ID
  if ((id || '').startsWith('P_')) return '';
  const raw = (id || '').replace(/^PROJ-N-/, '');
  if (/^\d{7}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4);
  if (/^SB(\d+)$/i.test(raw)) {
    const n = parseInt(raw.slice(2), 10);
    return 'SB-' + String(n).padStart(3, '0');
  }
  return raw;
}

// Returns sort key tuple for business ID ordering:
//   [0, numeric] → year+seq IDs (2026-001 … 2026-016)
//   [1, numeric] → SB IDs (SB-001 … SB-006)
//   [2, 0, str]  → named IDs (SOURCE-TIME, DHCN, …)
function bizIdSortKey(rawId: string): [number, number, string] {
  const id = (rawId || '').replace(/^(?:TASK-N-|LEAD-N-|PROJ-N-)/, '');
  const numMatch = id.match(/^(\d{4})(\d{3})$/);
  if (numMatch) return [0, parseInt(numMatch[1]) * 1000 + parseInt(numMatch[2]), ''];
  const sbMatch = id.match(/^SB(\d+)$/i);
  if (sbMatch) return [1, parseInt(sbMatch[1], 10), ''];
  return [2, 0, id.toLowerCase()];
}

// Comparator for sorting records by business ID ascending
export function compareByBusinessId(idA: string, idB: string): number {
  const [at, an, as_] = bizIdSortKey(idA);
  const [bt, bn, bs]  = bizIdSortKey(idB);
  if (at !== bt) return at - bt;
  if (an !== bn) return an - bn;
  return as_.localeCompare(bs);
}
