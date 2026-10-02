import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fetchWithTimeout, readBodyUpTo } from './fetchUtils.js';
import { decodeHtmlEntities } from './netscapeParser.js';

/**
 * Favicons fetched from each bookmark's own site and cached on disk.
 *
 * The client used to hotlink Google's favicon service, which sent the full
 * list of bookmarked domains to Google. Now only the bookmarked site itself
 * is contacted, at most once per cache period.
 */

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_HTML_BYTES = 512 * 1024;

const inflight = new Map();

function webOrigin(pageUrl) {
  try {
    const url = new URL(pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** <link rel="icon" href="..."> candidates, best first, resolved against the page. */
export function findIconLinks(html, baseUrl) {
  const links = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1].toLowerCase() || '';
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (!rel.split(/\s+/).some(r => r === 'icon' || r === 'apple-touch-icon') || !href) continue;
    try {
      const url = new URL(decodeHtmlEntities(href[1] ?? href[2] ?? href[3]), baseUrl).href;
      // Plain "icon" first; apple-touch-icon images are large.
      links.push({ url, priority: rel.includes('apple') ? 1 : 0 });
    } catch {
      // ignore malformed href
    }
  }
  return links.sort((a, b) => a.priority - b.priority).map(l => l.url);
}

function isImageResponse(response, url) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/')) return type;
  // Many servers send .ico files as octet-stream
  if (/\.ico(\?|$)/i.test(url) && (type === '' || type === 'application/octet-stream')) return 'image/x-icon';
  return null;
}

async function tryIcon(url) {
  if (!/^https?:/i.test(url)) return null;
  try {
    const response = await fetchWithTimeout(url);
    const contentType = response.ok && isImageResponse(response, url);
    if (!contentType) return null;
    const { buffer, truncated } = await readBodyUpTo(response, MAX_ICON_BYTES);
    return truncated || buffer.length === 0 ? null : { buffer, contentType };
  } catch {
    return null;
  }
}

async function fetchFavicon(origin) {
  const candidates = [];
  try {
    const page = await fetchWithTimeout(origin);
    if (page.ok && (page.headers.get('content-type') || '').includes('html')) {
      const { buffer } = await readBodyUpTo(page, MAX_HTML_BYTES);
      candidates.push(...findIconLinks(buffer.toString('utf8'), page.url || origin));
    }
  } catch {
    // site unreachable: still try /favicon.ico below
  }
  candidates.push(`${origin}/favicon.ico`);

  for (const url of [...new Set(candidates)].slice(0, 4)) {
    const icon = await tryIcon(url);
    if (icon) return icon;
  }
  return null;
}

export function createFaviconCache(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });

  const filesFor = (origin) => {
    const key = crypto.createHash('sha1').update(origin).digest('hex');
    return { meta: path.join(cacheDir, `${key}.json`), data: path.join(cacheDir, `${key}.bin`) };
  };

  function readCached(origin) {
    const files = filesFor(origin);
    try {
      const meta = JSON.parse(fs.readFileSync(files.meta, 'utf8'));
      const ttl = meta.miss ? MISS_TTL_MS : HIT_TTL_MS;
      if (Date.now() - meta.fetchedAt > ttl) return undefined;
      if (meta.miss) return null;
      return { buffer: fs.readFileSync(files.data), contentType: meta.contentType };
    } catch {
      return undefined; // not cached (or unreadable cache entry)
    }
  }

  function writeCached(origin, icon) {
    const files = filesFor(origin);
    try {
      if (icon) fs.writeFileSync(files.data, icon.buffer);
      fs.writeFileSync(files.meta, JSON.stringify({
        origin,
        fetchedAt: Date.now(),
        miss: !icon,
        contentType: icon?.contentType
      }));
    } catch (err) {
      console.error('No se pudo guardar el favicon en caché:', err.message);
    }
  }

  /**
   * @param {string} pageUrl any URL on the site
   * @returns {Promise<{buffer: Buffer, contentType: string} | null>}
   */
  return async function getFavicon(pageUrl) {
    const origin = webOrigin(pageUrl);
    if (!origin) return null;

    const cached = readCached(origin);
    if (cached !== undefined) return cached;

    // Concurrent requests for one site (a page full of its cards) share one fetch.
    if (!inflight.has(origin)) {
      inflight.set(origin, fetchFavicon(origin)
        .then(icon => {
          writeCached(origin, icon);
          return icon;
        })
        .finally(() => inflight.delete(origin)));
    }
    return inflight.get(origin);
  };
}
