/**
 * localStorage access that tolerates the store being unavailable: private
 * browsing modes and some embedded webviews throw on access instead of
 * returning null. Persistence is best-effort — callers keep working without it.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignored: the in-memory value still applies for this session.
  }
}
