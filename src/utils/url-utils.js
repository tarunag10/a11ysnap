export function normalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    let normalized = u.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function isSameOrigin(url1, url2) {
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

export function deduplicateUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
