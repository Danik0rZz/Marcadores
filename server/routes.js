import express from 'express';
import path from 'path';
import { dbPath } from './db.js';
import { apiRoutes, HttpError } from './apiRoutes.js';
import { decodeHtmlEntities } from './netscapeParser.js';
import { createFaviconCache } from './faviconService.js';
import { fetchWithTimeout, readBodyUpTo } from './fetchUtils.js';
import { isWebUrl } from './itemValidation.js';

const router = express.Router();

// Shared route table (also used by the in-browser backend of the Pages build).
for (const route of apiRoutes) {
  router[route.method.toLowerCase()](route.path, (req, res) => {
    try {
      const result = route.handler({ params: req.params, query: req.query, body: req.body || {} });
      if (route.download) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${route.download(result)}"`);
        return res.send(JSON.stringify(result, null, 2));
      }
      res.status(route.status || 200).json(result);
    } catch (err) {
      res.status(err instanceof HttpError ? err.status : 500).json({ error: err.message });
    }
  });
}

/* =========================================================================
   NETWORK-ONLY ROUTES (local server mode)
   ========================================================================= */

// Favicons are served by GET /api/favicon (fetched from the site itself and
// cached next to the database), so nothing is stored per bookmark.
const getFavicon = createFaviconCache(path.join(path.dirname(dbPath), 'favicons'));


/* =========================================================================
   METADATA EXTRACTOR (OPENGRAPH & TITLE)
   ========================================================================= */

// Title and description live in <head>; reading the first 512 KB is plenty.
const METADATA_MAX_BYTES = 512 * 1024;

router.post('/bookmarks/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL es requerida' });

    if (!isWebUrl(url)) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    const parsedUrl = new URL(url);

    let title = '';
    let description = '';

    try {
      const response = await fetchWithTimeout(url);

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('html')) {
        const html = (await readBodyUpTo(response, METADATA_MAX_BYTES)).buffer.toString('utf8');

        // Extract title
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                             html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
        if (ogTitleMatch) {
          title = ogTitleMatch[1];
        } else {
          const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleTagMatch) title = titleTagMatch[1];
        }

        // Extract description
        const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i) ||
                            html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (ogDescMatch) {
          description = ogDescMatch[1];
        }
      }
    } catch {
      // Fallback if fetch times out or blocked by CORS
    }

    // Fallback title to hostname if empty
    if (!title) {
      title = parsedUrl.hostname.replace(/^www\./, '');
    }

    res.json({
      title: decodeHtmlEntities(title).trim(),
      description: decodeHtmlEntities(description).trim()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   FAVICON PROXY
   ========================================================================= */

router.get('/favicon', async (req, res) => {
  try {
    const { url } = req.query;
    if (typeof url !== 'string' || !isWebUrl(url)) {
      return res.status(400).json({ error: 'URL inválida' });
    }

    const icon = await getFavicon(url);
    // 204 instead of 404: <img> falls back to the default icon without
    // logging an error per bookmark in the browser console.
    if (!icon) return res.set('Cache-Control', 'public, max-age=86400').status(204).end();

    res.set({
      'Content-Type': icon.contentType,
      'Cache-Control': 'public, max-age=604800',
      // Third-party bytes served from our origin: an SVG must never run script
      // even if someone opens this URL directly.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(icon.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   HEALTH CHECK FOR URL
   ========================================================================= */

router.post('/bookmarks/check-health', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    if (!isWebUrl(url)) return res.status(400).json({ error: 'URL inválida' });

    const startTime = Date.now();
    try {
      const response = await fetchWithTimeout(url, { method: 'HEAD' });
      const latency = Date.now() - startTime;
      res.json({
        alive: response.ok || response.status < 400,
        status: response.status,
        statusText: response.statusText,
        latencyMs: latency
      });
    } catch {
      // Retry with GET if HEAD was rejected
      try {
        const getRes = await fetchWithTimeout(url);
        const latency = Date.now() - startTime;
        await getRes.body?.cancel(); // only the status matters
        res.json({
          alive: getRes.ok || getRes.status < 400,
          status: getRes.status,
          statusText: getRes.statusText,
          latencyMs: latency
        });
      } catch (e) {
        res.json({
          alive: false,
          status: 0,
          statusText: e.message || 'Error de conexión / Timeout',
          latencyMs: Date.now() - startTime
        });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
