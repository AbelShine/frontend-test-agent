export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete('_t');
    return `${url.origin}${url.pathname}?${[...url.searchParams.entries()].sort().map(([key, item]) => `${key}=${item}`).join('&')}`;
  } catch {
    return value;
  }
}

export function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase());
}
