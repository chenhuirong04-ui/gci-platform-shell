// Customer name alias map for Customer 360 cross-table matching.
// Canonical name (key) → all known spelling variants used across tables.
// Add new entries here as you discover inconsistent spellings in your data.
//
// Usage: expandAliases("IFZA") → ["IFZA", "IFZA FZCO", "IFZA FZ-LLC", "DSO IFZA"]
// The API then searches for any of these variants across all tables.

export const CUSTOMER_ALIASES: Record<string, string[]> = {
  'IFZA': ['IFZA', 'IFZA FZCO', 'IFZA FZ-LLC', 'DSO IFZA', 'IFZA Dubai'],
  // Add more entries as needed, e.g.:
  // 'NAMAS': ['Namas', 'Namas Group', 'Namas Trading'],
};

/**
 * Given a customer input string, returns all known alias variants to search.
 * If no alias entry found, returns [input] (search as-is).
 *
 * Matching is case-insensitive and checks both directions:
 *   "IFZA" matches alias list containing "IFZA"
 *   "IFZA FZ-LLC" also matches the same alias group
 */
export function expandAliases(input: string): string[] {
  const trimmed = input.trim();
  const upper   = trimmed.toUpperCase();

  for (const [, aliases] of Object.entries(CUSTOMER_ALIASES)) {
    // Check if the input matches any alias in this group (substring, case-insensitive)
    const matched = aliases.some(a =>
      a.toUpperCase().includes(upper) || upper.includes(a.toUpperCase())
    );
    if (matched) return aliases;
  }

  return [trimmed];
}
