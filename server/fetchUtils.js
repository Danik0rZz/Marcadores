export const FETCH_TIMEOUT_MS = 5000;

// Some sites answer 403 to unknown clients; a browser-like UA avoids most of it.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': BROWSER_USER_AGENT, ...options.headers }
  });
}

/**
 * Reads at most `maxBytes` of a response body, then cancels the rest, so a
 * link to a huge file is never loaded into memory.
 *
 * @returns {Promise<{buffer: Buffer, truncated: boolean}>}
 */
export async function readBodyUpTo(response, maxBytes) {
  if (!response.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (received > maxBytes) {
      truncated = true;
      break;
    }
  }
  await reader.cancel().catch(() => {});
  return { buffer: Buffer.concat(chunks).subarray(0, maxBytes), truncated };
}
