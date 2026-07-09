/**
 * isLikelyNotionPageId
 *
 * Returns true if the value looks like a real Notion page ID (UUID format).
 * Rejects local synthetic IDs (LEAD_, HIST_, SYNTH_, INT_, NOTION- prefix)
 * and values that are too short or missing hyphens.
 *
 * Notion page IDs are 32-char hex strings, optionally hyphenated:
 *   "abc123de-f456-7890-abcd-ef1234567890"   → true
 *   "abc123def456789012345678901234567890"    → true (non-hyphenated from Notion API)
 *   "LEAD_20260701_abc"                       → false
 *   "HIST_xxx"                                → false
 */
export function isLikelyNotionPageId(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  // Reject known local-only prefixes
  if (/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(value)) return false;
  // Must contain at least one hyphen and be long enough for a UUID
  if (!value.includes('-')) return false;
  if (value.length < 20) return false;
  // Must be hex + hyphens only
  if (!/^[0-9a-f-]+$/i.test(value)) return false;
  return true;
}
