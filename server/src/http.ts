export const UA = "familjetavla/0.4 (+https://github.com/murre87/familjetavla)";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 15_000, ...init } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "user-agent": UA, ...(init.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Tidsgräns nådd mot ${new URL(url).host}`);
    throw new Error(`Kunde inte nå ${new URL(url).host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithTimeout(url, { ...opts, headers: { accept: "application/json", ...(opts.headers as Record<string, string>) } });
  if (!res.ok) throw new HttpError(res.status, `${new URL(url).host} svarade ${res.status}`);
  return (await res.json()) as T;
}

export async function getText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new HttpError(res.status, `${new URL(url).host} svarade ${res.status}`);
  return res.text();
}

/** webcal:// links (iCloud, laget.se) are just https. */
export function normalizeCalendarUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("webcal://")) return `https://${u.slice("webcal://".length)}`;
  if (u.startsWith("webcals://")) return `https://${u.slice("webcals://".length)}`;
  return u;
}
