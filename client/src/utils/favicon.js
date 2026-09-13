/**
 * Returns a robust favicon URL using Google's public favicon service as primary/fallback.
 * Google scans the real HTML <link rel="icon"> of the site, supports SVG/PNG/ICO and avoids 404s.
 */
export function getFaviconUrl(url, existingFavicon) {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname;

    // If existing favicon is already a valid specific custom link (not a broken /favicon.ico)
    if (existingFavicon && !existingFavicon.endsWith('/favicon.ico')) {
      return existingFavicon;
    }

    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return existingFavicon || '';
  }
}
