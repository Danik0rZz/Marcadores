/**
 * Same-origin favicon URL for a bookmark. The server fetches the icon from
 * the bookmarked site itself and caches it, so no third party (such as
 * Google's favicon service) learns which sites are bookmarked.
 * Keyed by origin so the browser caches one icon per site.
 */
export function getFaviconUrl(url) {
  try {
    const { protocol, origin } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return `/api/favicon?url=${encodeURIComponent(origin)}`;
  } catch {
    return '';
  }
}
