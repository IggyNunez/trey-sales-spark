function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

/**
 * Matches Close custom field filters against an event's close_custom_fields JSON.
 * Only matches events where the field has the exact value specified.
 * Events with missing/null/empty values are excluded from filtered results.
 */
export function matchesCloseFieldFilters(
  closeFields: Record<string, unknown> | null | undefined,
  filters: Record<string, string | null> | null | undefined
): boolean {
  if (!filters) return true;
  const active = Object.entries(filters).filter(([, v]) => v !== null);
  if (active.length === 0) return true;

  const cf = closeFields ?? {};
  return active.every(([slug, wanted]) => {
    return normalizeString(cf[slug]) === wanted;
  });
}
