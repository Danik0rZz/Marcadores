const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalHostname(value) {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Any website open in the browser can send requests to localhost. Reject them:
 * - Host check blocks DNS rebinding (a foreign domain resolving to 127.0.0.1)
 * - Origin check blocks cross-site reads and writes (e.g. exporting or wiping data)
 * Same-origin requests and the Vite dev proxy both come from a local origin.
 */
export function localOnly(req, res, next) {
  if (!isLocalHostname(`http://${req.headers.host}`)) {
    return res.status(403).json({ error: 'Host no permitido' });
  }
  const { origin } = req.headers;
  if (origin && !isLocalHostname(origin)) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
}
