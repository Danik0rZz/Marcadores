// Module resolution hook: every import of server/db.js gets ./db.js instead.
const serverDb = new URL('../../db.js', import.meta.url).href;
const browserDb = new URL('./db.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  return result.url === serverDb ? { ...result, url: browserDb } : result;
}
