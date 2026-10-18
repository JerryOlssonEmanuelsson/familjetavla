import type { ConfigResponse, Dashboard, Integration, TestResult } from "../../server/src/types";

const PIN_KEY = "familjetavla.pin";

export function getPin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPin(pin: string) {
  try {
    sessionStorage.setItem(PIN_KEY, pin);
  } catch {
    /* private mode */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Relative paths ("api/…", no leading slash) so the app works under Home Assistant ingress.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`api/${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      "x-admin-pin": getPin(),
      ...(init.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Fel ${res.status}`);
  return data as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export interface EntityOption {
  entityId: string;
  name: string;
  state: string;
  unit?: string;
  deviceClass?: string;
}

export interface CalendarTest extends TestResult {
  groups: { name: string; count: number }[];
}

export interface PostcodeInfo {
  postcode: string;
  place: string;
  municipality?: string;
  lat: number;
  lon: number;
  area: "SE1" | "SE2" | "SE3" | "SE4";
  wasteProvider?: string;
}

export interface GroceryLine {
  item: string;
  remembered: { code: string; name: string } | null;
  candidates: { code: string; name: string; brand?: string; volume?: string; price?: string; image?: string }[];
}

export const api = {
  config: () => request<ConfigResponse>("config"),
  saveConfig: (config: ConfigResponse["config"], secrets: Record<string, string | null> = {}) =>
    request<ConfigResponse>("config", { method: "PUT", body: JSON.stringify({ config, secrets }) }),
  checkPin: () => post<{ ok: boolean }>("auth/check"),
  dashboard: () => request<Dashboard>("dashboard"),

  testProvider: (integration: Integration, secrets: Record<string, string>) => post<TestResult>("providers/test", { integration, secrets }),
  testHa: (url?: string, token?: string) => post<TestResult>("test/ha", { url, token }),
  entities: (domains: string[]) => request<EntityOption[]>(`ha/entities?domains=${domains.join(",")}`),
  testCalendar: (body: { url?: string; entityId?: string; sourceId?: string; include?: string[]; exclude?: string[] }) =>
    post<CalendarTest>("test/calendar", body),
  postcode: (q: string) => request<PostcodeInfo>(`postcode?q=${encodeURIComponent(q)}`),

  groceryPreview: () => post<{ store: string; lines: GroceryLine[] }>("grocery/preview"),
  grocerySend: (lines: { item: string; code: string; name: string; qty: number }[]) =>
    post<{ ok: boolean; store: string; items: number | null; total: string | null }>("grocery/send", { lines }),

  toggleLight: (entityId: string) => post("lights/toggle", { entityId }),
  lightsOff: () => post("lights/off"),
  addItem: (name: string) => post("shopping/add", { name }),
  toggleItem: (id: string, done: boolean) => post("shopping/toggle", { id, done }),
  clearDone: () => post("shopping/clear-done"),
};
