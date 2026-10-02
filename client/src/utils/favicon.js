/**
 * Same-origin favicon URL for a bookmark. The server fetches the icon from
 * the bookmarked site itself and caches it, so no third party (such as
 * Google's favicon service) learns which sites are bookmarked.
 * Keyed by origin so the browser caches one icon per site.
 */
import { IS_BROWSER_BACKEND } from '../api';

export function getFaviconUrl(url) {
  // The web (GitHub Pages) build has no server to fetch icons from other
  // sites, and hotlinking them would leak the bookmark list: default icon.
  if (IS_BROWSER_BACKEND) return '';
  try {
    const { protocol, origin } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return `/api/favicon?url=${encodeURIComponent(origin)}`;
  } catch {
    return '';
  }
}
