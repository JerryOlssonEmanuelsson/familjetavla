import { fetchIcs } from "../connectors/ics.js";
import { ha, haConnection } from "../connectors/ha.js";
import { getJson } from "../http.js";
import { isGymLesson, vklassChildren, vklassEvents, vklassLogin } from "../connectors/vklass.js";
import { hhmm, shortDate, shortWeekday } from "../time.js";
import type { ProviderCtx, SchoolEvent, SchoolProvider } from "./types.js";

const preview = (e: { start: Date; allDay: boolean; title: string }) =>
  `${shortWeekday(e.start)} ${shortDate(e.start)}${e.allDay ? "" : ` ${hhmm(e.start)}`} · ${e.title}`;

function need(ctx: ProviderCtx, ...keys: string[]) {
  for (const k of keys) {
    const field = ctx.integration.provider;
    const v = ctx.str(k) || ctx.secret(k);
    if (!v) throw new Error(`Fyll i ${k === "password" ? "lösenord" : k === "username" ? "användarnamn" : k} (${field}).`);
  }
}

export const vklass: SchoolProvider = {
  meta: {
    id: "vklass",
    category: "school",
    name: "Vklass",
    description: "Schema, idrottslektioner och skolmat för alla barn på kontot.",
    status: "beta",
    discoversChildren: true,
    fields: [
      { key: "username", label: "Användarnamn", type: "text", placeholder: "Som på vklass.se" },
      { key: "password", label: "Lösenord", type: "password", secret: true },
    ],
    guide: [
      "Logga in som vårdnadshavare med användarnamn och lösenord (inte bara BankID).",
      "Har du bara BankID: skapa ett lösenord under Mitt konto i Vklass.",
      "Barnen hämtas automatiskt – koppla dem till rätt person nedan.",
    ],
  },
  async test(ctx) {
    need(ctx, "username", "password");
    const s = await vklassLogin(ctx.str("username"), ctx.secret("password")!);
    const kids = await vklassChildren(s);
    return {
      ok: true,
      message: `Inloggad. Hittade ${kids.length} barn.`,
      discovered: kids.map((k) => k.name),
      preview: kids.flatMap((k) => (k.food[0] ? [`${k.name} · ${k.food[0].day}: ${k.food[0].dishes.join(", ")}`] : [])),
    };
  },
  async fetch(ctx, from, to) {
    need(ctx, "username", "password");
    const s = await vklassLogin(ctx.str("username"), ctx.secret("password")!);
    const kids = await vklassChildren(s);
    const events: SchoolEvent[] = [];
    for (const k of kids) {
      for (const e of await vklassEvents(s, k.id, from, to)) events.push({ ...e, child: k.name, gym: isGymLesson(e) });
    }
    const food = kids.flatMap((k) => k.food.map((f) => ({ child: k.name, ...f })));
    return { events, food };
  },
};

const DAY_NAMES = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const foodDay = (d: Date) => `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;

/**
 * Skolmaten.se – open menu, no login. API shape from the Skolmat HA integration
 * (github.com/Kaptensanders/skolmat): /api/4/menu/school/<slug>?year=&week=
 */
export const skolmaten: SchoolProvider = {
  meta: {
    id: "skolmaten",
    category: "school",
    name: "Skolmaten.se (skolmat)",
    description: "Veckans lunch från skolmaten.se – ingen inloggning. Används av en majoritet av kommunerna.",
    status: "beta",
    fields: [{ key: "url", label: "Skolans sida på skolmaten.se", type: "url", placeholder: "https://skolmaten.se/skolans-namn" }],
    guide: ["Sök upp skolan på skolmaten.se och kopiera adressen från webbläsaren.", "Välj vilket barn menyn gäller."],
  },
  async test(ctx) {
    const { food } = await this.fetch(ctx, new Date(), new Date(Date.now() + 14 * 86_400_000));
    if (!food?.length) throw new Error("Hittade ingen meny för skolan de kommande två veckorna.");
    return { ok: true, preview: food.slice(0, 5).map((f) => `${f.day}: ${f.dishes.join(", ")}`) };
  },
  async fetch(ctx, from) {
    const slug = new URL(ctx.str("url")).pathname.replace(/^\/+|\/+$/g, "");
    if (!slug) throw new Error("Klistra in skolans adress på skolmaten.se.");
    const headers = {
      accept: "application/json",
      referer: "https://skolmaten.se/",
      // Public web client token used by skolmaten.se's own front end.
      "client-token": "web-eaa12e50-c84c-4b4a-9cfe-4e3fcbcd9165",
    };
    type Day = { date: string; Meals?: { name: string }[] };
    const weeks: Day[] = [];
    for (const offset of [0, 7]) {
      const d = new Date(from.getTime() + offset * 86_400_000);
      const url = `https://skolmaten.se/api/4/menu/school/${encodeURIComponent(slug)}?year=${isoYear(d)}&week=${isoWeekNo(d)}`;
      const data = await getJson<{ WeekState?: { Days?: Day[] } }>(url, { headers });
      weeks.push(...(data.WeekState?.Days ?? []));
    }
    const food = weeks
      .filter((d) => d.Meals?.length)
      .map((d) => ({ child: "", day: foodDay(new Date(d.date)), dishes: d.Meals!.map((m) => m.name.trim()).filter(Boolean) }));
    return { events: [], food };
  },
};

function isoWeekNo(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}
function isoYear(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return t.getUTCFullYear();
}

/** School lunch from the Skolmat integration in HA (Mashie, Matilda, FoodIT, Mateo, skolmat.info …). */
export const skolmatHa: SchoolProvider = {
  meta: {
    id: "skolmat-ha",
    category: "school",
    name: "Skolmat från Home Assistant",
    description: "Använd Skolmat-integrationen (HACS) – stöder Mashie, Matilda, FoodIT, Mateo, skolmat.info m.fl.",
    status: "stable",
    needsHa: true,
    fields: [{ key: "entityId", label: "Skolmat-kalender", type: "entity", domains: ["calendar"] }],
  },
  async test(ctx) {
    const { food } = await this.fetch(ctx, new Date(), new Date(Date.now() + 14 * 86_400_000));
    return { ok: true, preview: (food ?? []).slice(0, 5).map((f) => `${f.day}: ${f.dishes.join(", ")}`) };
  },
  async fetch(ctx, from, to) {
    const conn = haConnection();
    if (!conn) throw new Error("Home Assistant är inte anslutet.");
    const evs = await ha.calendarEvents(conn, ctx.str("entityId"), from, to);
    return { events: [], food: evs.map((e) => ({ child: "", day: foodDay(e.start), dishes: [e.title, ...(e.description ? [e.description] : [])].slice(0, 2) })) };
  },
};

export const schoolIcs: SchoolProvider = {
  meta: {
    id: "school-ics",
    category: "school",
    name: "Annan skolplattform (kalenderlänk)",
    description: "SchoolSoft, Unikum, IST, Skola24, InfoMentor m.fl. som kan exportera schemat som kalender.",
    status: "stable",
    fields: [
      { key: "platform", label: "Plattform", type: "select", options: ["SchoolSoft", "Unikum", "IST", "Skola24", "InfoMentor", "Edlevo", "Annan"].map((p) => ({ value: p, label: p })), default: "SchoolSoft" },
      { key: "url", label: "Kalenderlänk (ICS/webcal)", type: "url", secret: true, placeholder: "webcal://… eller https://….ics" },
    ],
    guide: [
      "Leta efter Prenumerera, Synka kalender eller Exportera schema i skolans app eller webb.",
      "Kopiera länken (börjar ofta med webcal:// eller slutar på .ics) och klistra in här.",
      "Lägg till en länk per barn och välj vilket barn den gäller.",
    ],
  },
  async test(ctx) {
    const url = ctx.secret("url");
    if (!url) throw new Error("Klistra in kalenderlänken.");
    const now = new Date();
    const evs = await fetchIcs(url, now, new Date(now.getTime() + 21 * 86_400_000));
    return { ok: true, message: `${evs.length} händelser kommande tre veckor.`, preview: evs.slice(0, 5).map(preview) };
  },
  async fetch(ctx, from, to) {
    const url = ctx.secret("url");
    if (!url) return { events: [] };
    const evs = await fetchIcs(url, from, to);
    return { events: evs.map((e) => ({ ...e, gym: isGymLesson(e) })) };
  },
};
