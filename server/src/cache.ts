/**
 * Tiny in-memory TTL cache with in-flight de-duplication. On failure the last good value
 * is served (stale-if-error), so a flaky Vklass or Willys never blanks the whole board.
 */
interface Entry<T> {
  value?: T;
  at: number;
  pending?: Promise<T>;
}

const entries = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const e = entries.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (e && e.value !== undefined && now - e.at < ttlMs) return e.value;
  if (e?.pending) return e.pending;

  const pending = load()
    .then((value) => {
      entries.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      const prev = entries.get(key) as Entry<T> | undefined;
      if (prev?.value !== undefined) {
        entries.set(key, { value: prev.value, at: prev.at });
        return prev.value;
      }
      entries.delete(key);
      throw err;
    });
  entries.set(key, { ...(e ?? { at: 0 }), pending });
  return pending;
}

export function invalidate(prefix = "") {
  for (const k of entries.keys()) if (k.startsWith(prefix)) entries.delete(k);
}
