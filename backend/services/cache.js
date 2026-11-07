/** Tiny in-memory TTL cache for frequently-read public data. */
const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) { store.delete(key); return undefined; }
  return hit.val;
}
function set(key, val, ttlSec = 60) { store.set(key, { val, exp: Date.now() + ttlSec * 1000 }); return val; }
async function remember(key, ttlSec, fn) {
  const v = get(key);
  if (v !== undefined) return v;
  return set(key, await fn(), ttlSec);
}
/** Delete keys starting with any of the prefixes (or everything). */
function invalidate(...prefixes) {
  if (!prefixes.length) return store.clear();
  for (const k of store.keys()) if (prefixes.some((p) => k.startsWith(p))) store.delete(k);
}

module.exports = { get, set, remember, invalidate };
