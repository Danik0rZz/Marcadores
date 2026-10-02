/**
 * In-browser implementation of the HTTP API for the GitHub Pages build. It
 * mounts the server's own route table (server/apiRoutes.js), so validation,
 * matching, trash, imports and backups behave exactly as with the local
 * server. Loaded lazily by api.js, only in that build.
 */
import { apiRoutes, HttpError } from '../../../server/apiRoutes.js';
import { persist, reloadFromStorage, storageStatus } from './browserDb.js';

export { storageStatus };

function compile(path) {
  const names = [];
  const pattern = path.replace(/:(\w+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}$`), names };
}

const table = apiRoutes.map(route => ({ ...route, ...compile(route.path) }));

// Other tabs of the app share the same IndexedDB copy: when one saves, the
// rest reload it before their next request instead of overwriting it.
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('nexus-db') : null;
let staleFromOtherTab = false;
if (channel) channel.onmessage = () => { staleFromOtherTab = true; };

// Requests run one at a time, like a server handling a single connection.
let queue = Promise.resolve();

/**
 * @param {string} method
 * @param {string} url path after /api, may include a query string
 * @param {unknown} body
 * @returns {Promise<{status: number, data: unknown}>}
 */
export function dispatch(method, url, body) {
  const run = async () => {
    if (staleFromOtherTab) {
      staleFromOtherTab = false;
      await reloadFromStorage();
    }

    const [pathname, search = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(search));

    for (const route of table) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));

      let response;
      try {
        // JSON round trips mimic the HTTP boundary: no shared object references.
        const request = { params, query, body: body === undefined ? {} : JSON.parse(JSON.stringify(body)) };
        const result = route.handler(request);
        response = { status: route.status || 200, data: JSON.parse(JSON.stringify(result)) };
      } catch (err) {
        response = { status: err instanceof HttpError ? err.status : 500, data: { error: err.message } };
      }

      // Like the server, whatever a write request committed is kept, even if it then failed.
      if (method !== 'GET') {
        try {
          await persist();
          channel?.postMessage('saved');
        } catch (err) {
          return { status: 500, data: { error: err.message } };
        }
      }
      return response;
    }
    return {
      status: 404,
      data: { error: 'Esta función necesita el servidor local y no está disponible en la versión web.' }
    };
  };

  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

/** Backup file name, the same one the local server sends. */
export function backupFileName() {
  return apiRoutes.find(r => r.path === '/backup/export').download();
}
