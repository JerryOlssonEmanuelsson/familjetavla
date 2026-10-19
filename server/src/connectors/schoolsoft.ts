import { fetchWithTimeout, HttpError } from "../http.js";
import type { CalEvent } from "./ics.js";

/**
 * SchoolSoft through the same JSON API as its mobile app (unofficial).
 * Endpoints follow github.com/CarelessInternet/node-schoolsoft. Guardian accounts are
 * not verified against a real account yet, so everything is read defensively.
 */
const BASE = "https://sms.schoolsoft.se";
const APP_HEADERS = { appos: "ios", appversion: "2.3.14", deviceid: "familjetavla" };

export interface SchoolSoftSession {
  school: string;
  token: string;
  type: "guardian" | "student";
  orgIds: number[];
  name: string;
}

interface Notice {
  child?: string;
  fromDate?: number;
  json?: { title?: string; allDay?: number; fromDate?: string; endDate?: string; contentPreview?: string };
}

interface LunchWeek {
  week?: number;
  dates?: string[];
  dishCategoryName?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
}

/** "https://sms.schoolsoft.se/engelska/jsp/Login.jsp" or just "engelska" → "engelska". */
export function schoolSlug(input: string): string {
  const s = input.trim();
  const m = s.match(/schoolsoft\.se\/([^/?#]+)/i);
  const slug = (m ? m[1] : s).replace(/^\/+|\/+$/g, "");
  if (!/^[\w-]+$/.test(slug)) throw new Error("Skriv skolans namn som i adressen, t.ex. sms.schoolsoft.se/skolnamn.");
  return slug;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithTimeout(url, { ...init, headers: { ...APP_HEADERS, ...(init.headers as Record<string, string>) } });
  if (res.status === 401) throw new HttpError(401, "SchoolSoft godkände inte inloggningen. Kolla användarnamn, lösenord och skolans namn.");
  if (res.status === 404) throw new HttpError(404, "SchoolSoft hittade inte skolan. Kolla skolans namn i adressen.");
  if (!res.ok) throw new HttpError(res.status, `SchoolSoft svarade ${res.status}`);
  return (await res.json()) as T;
}

export async function schoolsoftLogin(schoolInput: string, username: string, password: string): Promise<SchoolSoftSession> {
  const school = schoolSlug(schoolInput);
  const tryLogin = async (usertype: number) => {
    const body = new URLSearchParams({ identification: username, verification: password, logintype: "4", usertype: String(usertype) });
    return call<{ appKey?: string; name?: string; orgs?: { orgId: number }[] }>(`${BASE}/${school}/rest/app/login`, { method: "POST", body });
  };
  // Guardian first; a student account (older kids with their own login) is the fallback.
  let type: SchoolSoftSession["type"] = "guardian";
  let user;
  try {
    user = await tryLogin(2);
  } catch (e) {
    if ((e as HttpError).status !== 401) throw e;
    user = await tryLogin(1);
    type = "student";
  }
  if (!user.appKey) throw new Error("SchoolSoft gav ingen nyckel. Kontot kanske bara kan logga in med BankID.");
  const tok = await call<{ token?: string }>(`${BASE}/${school}/rest/app/token`, { headers: { appkey: user.appKey } });
  if (!tok.token) throw new Error("SchoolSoft gav ingen token.");
  const orgIds = (user.orgs ?? []).map((o) => o.orgId).filter((n) => Number.isFinite(n));
  if (!orgIds.length) throw new Error("Kontot saknar skola i SchoolSoft.");
  return { school, token: tok.token, type, orgIds: [...new Set(orgIds)], name: user.name ?? "" };
}

const api = <T>(s: SchoolSoftSession, ...path: (string | number)[]) =>
  call<T>(`${BASE}/${s.school}/api/${path.join("/")}`, { headers: { token: s.token } });

/** "2026-10-19 08:00:00", "2026-10-19T08:00" or epoch ms → Date. */
function parseWhen(v: string | number | undefined): Date | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v).trim().replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function noticeToEvent(n: Notice): (CalEvent & { child?: string }) | undefined {
  const title = n.json?.title?.trim();
  const start = parseWhen(n.json?.fromDate) ?? parseWhen(n.fromDate);
  if (!title || !start) return undefined;
  const allDay = n.json?.allDay === 1 || (start.getHours() === 0 && start.getMinutes() === 0 && !n.json?.endDate);
  let end = parseWhen(n.json?.endDate) ?? new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
  if (end <= start) end = new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
  return {
    uid: `schoolsoft-${start.getTime()}-${title}`,
    title,
    start,
    end,
    allDay,
    description: n.json?.contentPreview || undefined,
    child: n.child?.trim() || undefined,
  };
}

export async function schoolsoftCalendar(s: SchoolSoftSession, from: Date, to: Date) {
  const out: (CalEvent & { child?: string })[] = [];
  for (const org of s.orgIds) {
    const list = await api<Notice[]>(s, "notices", s.type, org, from.getTime(), to.getTime(), "calendar,schoolcalendar,privatecalendar");
    for (const n of Array.isArray(list) ? list : []) {
      const e = noticeToEvent(n);
      if (e && e.end > from && e.start < to) out.push(e);
    }
  }
  return out;
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const SV = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag"];

/** Monday of ISO week `week` in the year of `ref` (or the next year around new year). */
function mondayOfWeek(week: number, ref: Date): Date {
  const forYear = (y: number) => {
    const jan4 = new Date(y, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    return monday;
  };
  // Pick the year that puts the week closest to now (week 1 read in December is next year).
  const y = ref.getFullYear();
  return [y - 1, y, y + 1].map(forYear).sort((a, b) => Math.abs(a.getTime() - ref.getTime()) - Math.abs(b.getTime() - ref.getTime()))[0];
}

export function lunchRows(weeks: LunchWeek[], now: Date): { day: string; dishes: string[] }[] {
  const byDay = new Map<string, string[]>();
  for (const w of weeks) {
    WEEKDAYS.forEach((key, i) => {
      const text = w[key]?.trim();
      if (!text) return;
      let date = parseWhen(w.dates?.[i]);
      if (!date && w.week) {
        date = mondayOfWeek(w.week, now);
        date.setDate(date.getDate() + i);
      }
      const label = date ? `${SV[i]} ${date.getDate()}/${date.getMonth() + 1}` : SV[i];
      const dishes = text.split(/\r?\n/).map((d) => d.trim()).filter(Boolean);
      const list = byDay.get(label) ?? [];
      list.push(...dishes);
      byDay.set(label, list);
    });
  }
  return [...byDay].map(([day, dishes]) => ({ day, dishes: [...new Set(dishes)] }));
}

export async function schoolsoftLunch(s: SchoolSoftSession, now: Date) {
  const weeks: LunchWeek[] = [];
  for (const org of s.orgIds) {
    const list = await api<LunchWeek[]>(s, "lunchmenus", s.type, org);
    if (Array.isArray(list)) weeks.push(...list);
  }
  return lunchRows(weeks, now);
}
