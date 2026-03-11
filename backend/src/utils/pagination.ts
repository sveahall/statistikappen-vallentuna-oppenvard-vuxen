interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  applyDefaultWhenUnspecified?: boolean;
}

export type PaginationResult = { limit: number; offset: number } | null;

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

/**
 * Parse ?limit/&offset query params in a safe way.
 * Returns null when no limit should be applied.
 */
export function resolvePagination(
  query: Record<string, unknown>,
  options: PaginationOptions = {}
): PaginationResult {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    applyDefaultWhenUnspecified = false,
  } = options;

  const rawLimit = query.limit ?? (applyDefaultWhenUnspecified ? defaultLimit : undefined);

  if (
    rawLimit === undefined ||
    rawLimit === null ||
    rawLimit === '' ||
    String(rawLimit).toLowerCase() === 'all'
  ) {
    return null;
  }

  let limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = defaultLimit;
  }

  limit = Math.min(limit, maxLimit);

  let offset = 0;
  if (query.offset !== undefined) {
    const parsedOffset = Number(query.offset);
    if (Number.isFinite(parsedOffset) && parsedOffset >= 0) {
      offset = parsedOffset;
    }
  }

  return { limit, offset };
}
