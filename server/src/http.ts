import { VERSION } from "./version.js";

export const UA = `familjetavla/${VERSION} (+https://github.com/murre87/familjetavla)`;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
}

/**
 * fetch with a deadline that also covers reading the body: the signal stays armed after the
 * headers arrive, so a server that sends headers and then stalls can't hang the board.
 */
export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 15_000, ...init } = opts;
  const host = new URL(url).host;
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": UA, ...(init.headers as Record<string, string> | undefined) },
    });
    return withReadableTimeout(res, host);
  } catch (e) {
    throw timeoutError(e, host);
  }
}

function timeoutError(e: unknown, host: string): Error {
  const name = (e as Error).name;
  if (name === "TimeoutError" || name === "AbortError") return new Error(`Tidsgräns nådd mot ${host}`);
  return new Error(`Kunde inte nå ${host}: ${(e as Error).message}`);
}

/** Give body reads that hit the deadline the same readable message as the request itself. */
function withReadableTimeout(res: Response, host: string): Response {
  for (const m of ["text", "json", "arrayBuffer"] as const) {
    const orig = res[m].bind(res) as () => Promise<unknown>;
    (res as unknown as Record<string, () => Promise<unknown>>)[m] = () =>
      orig().catch((e: unknown) => {
        throw (e as Error).name === "SyntaxError" ? e : timeoutError(e, host);
      });
  }
  return res;
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
