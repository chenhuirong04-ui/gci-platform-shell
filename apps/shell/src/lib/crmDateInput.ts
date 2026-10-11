export function nextFollowUpDateForSave(
  inputValue: string,
  persistedValue: string | null,
): string | null | undefined {
  const value = inputValue.trim();
  if (value === (persistedValue || '')) return undefined;
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
