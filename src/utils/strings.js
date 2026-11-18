export function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(label) {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return slug || 'item';
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function safeFilename(name) {
  const base = String(name || 'document.pdf').split(/[/\\]/).pop();
  return base.replace(/[^\w.\- ()]+/g, '').slice(0, 180) || 'document.pdf';
}
