import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../http.js";
import type { CalEvent } from "./ics.js";

/**
 * Vklass (vårdnadshavare) – unofficial, scrapes the custodian web.
 *
 * Login flow mapped by the community "Vklass scrape sensor" for Home Assistant
 * (community.home-assistant.io/t/vklass-scrape-sensor/939402):
 *   1. GET  auth.vklass.se/credentials → cookies + __RequestVerificationToken
 *   2. POST auth.vklass.se/credentials/signin (Username, Password, RememberMe) → 302 = ok, 200 = wrong password
 *   3. custodian.vklass.se/Home/Welcome lists the children (vk-student-card),
 *      /Events/FullCalendar returns events per student id.
 * Works only for accounts with a username + password (not BankID-only).
 */

const AUTH = "https://auth.vklass.se";
const CUSTODIAN = "https://custodian.vklass.se";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

class Jar {
  private c = new Map<string, string>();
  take(res: Response) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.c.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export interface VklassChild {
  id: string;
  name: string;
  attendance?: string;
  careTime?: string;
  food: { day: string; dishes: string[] }[];
}

export interface VklassSession {
  jar: Jar;
}

async function req(jar: Jar, url: string, init: RequestInit = {}) {
  const res = await fetchWithTimeout(url, {
    ...init,
    redirect: "manual",
    timeoutMs: 20_000,
    headers: { "user-agent": BROWSER_UA, cookie: jar.header(), ...(init.headers as Record<string, string>) },
  });
  jar.take(res);
  return res;
}

/** Follow redirects by hand so cookies set on every hop are kept. */
async function follow(jar: Jar, url: string, init: RequestInit = {}, hops = 6): Promise<Response> {
  let res = await req(jar, url, init);
  let current = url;
  while (hops-- > 0 && res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) break;
    current = new URL(loc, current).toString();
    res = await req(jar, current);
  }
  return res;
}

export async function vklassLogin(username: string, password: string): Promise<VklassSession> {
  const jar = new Jar();
  const page = await req(jar, `${AUTH}/credentials`);
  const html = await page.text();
  const token = cheerio.load(html)('input[name="__RequestVerificationToken"]').attr("value");
  if (!token) throw new Error("Vklass inloggningssida ändrad – hittade ingen verifieringstoken.");

  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    Username: username,
    Password: password,
    RememberMe: "false",
  });
  const res = await req(jar, `${AUTH}/credentials/signin`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  if (res.status === 200) throw new Error("Fel användarnamn eller lösenord för Vklass.");
  if (res.status < 300 || res.status >= 400) throw new Error(`Vklass svarade ${res.status} vid inloggning.`);

  // Follow the redirect chain into the custodian site to obtain its session cookie.
  const loc = res.headers.get("location");
  if (loc) await follow(jar, new URL(loc, AUTH).toString());
  await follow(jar, `${CUSTODIAN}/Home/Welcome`);
  return { jar };
}

export async function vklassChildren(s: VklassSession): Promise<VklassChild[]> {
  const res = await follow(s.jar, `${CUSTODIAN}/Home/Welcome`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const children: VklassChild[] = [];

  $(".vk-student-card").each((_, card) => {
    const c = $(card);
    const name = c.find("h2").first().text().trim();
    const link = c.find('a[href*="studentIds="]').attr("href") ?? "";
    const id = /studentIds=(\d+)/.exec(link)?.[1] ?? "";
    if (!name || !id) return;
    const food: VklassChild["food"] = [];
    // "Matsedel vecka 43" on the card pins the menu to that week (see meals.ts menuDate).
    const week = /vecka\s*(\d{1,2})/i.exec(c.text())?.[1];
    c.find("h3").each((__, h) => {
      const raw = $(h).text().trim();
      const day = week && !/\d/.test(raw) ? `${raw} v${week}` : raw;
      const dishes = $(h).nextAll("ul").first().find("li").map((___, li) => $(li).text().trim()).get().filter(Boolean);
      if (day && dishes.length) food.push({ day, dishes });
    });
    children.push({
      id,
      name,
      attendance: c.find(".text-bold").first().text().trim() || undefined,
      careTime: c.find('a[href*="CareSchedule/Overview"]').first().text().trim().replace(/–/g, "-") || undefined,
      food,
    });
  });

  if (children.length === 0) {
    throw new Error("Inloggad i Vklass men hittade inga barn. Sidan kan ha ändrats.");
  }
  return children;
}

export async function vklassEvents(s: VklassSession, studentId: string, from: Date, to: Date): Promise<CalEvent[]> {
  const body = new URLSearchParams({ students: studentId, start: from.toISOString(), end: to.toISOString() });
  const res = await follow(s.jar, `${CUSTODIAN}/Events/FullCalendar`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json, text/html" },
  });
  if (!res.ok) throw new Error(`Vklass kalender svarade ${res.status}`);
  const list = (await res.json()) as { title?: string; text?: string; start: string; end?: string; allDay?: boolean }[];
  return list.map((e) => {
    const start = new Date(e.start);
    return {
      start,
      end: e.end ? new Date(e.end) : new Date(start.getTime() + 3_600_000),
      allDay: Boolean(e.allDay) || !/T\d/.test(e.start),
      title: (e.title || e.text || "Skola").trim(),
      description: e.text,
    };
  });
}

/** Lessons that mean "bring gym clothes". Vklass uses short codes like "idh". */
export function isGymLesson(ev: CalEvent): boolean {
  const s = `${ev.title} ${ev.description ?? ""}`.toLowerCase();
  return /\bidh\b|idrott|gympa|\bidr\b/.test(s);
}
