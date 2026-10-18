import { fetchIcs } from "../connectors/ics.js";
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
