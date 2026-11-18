export function parsePaging(query, defaultLimit = 10) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total, page, limit) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit) || 1) };
}

export function parseSort(query, allowed, fallback) {
  const field = allowed.includes(query.sortBy) ? query.sortBy : fallback;
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  return { [field]: direction };
}
