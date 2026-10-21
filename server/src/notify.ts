import type { FastifyBaseLogger } from "fastify";
import { ha, haConnection } from "./connectors/ha.js";
import { gatherFamily } from "./dashboard.js";
import { buildPlan, dutyMessage, duties, needsAttention, type Duty } from "./plan.js";
import { loadShelf } from "./meals.js";
import { loadConfig } from "./store.js";
import { addDays, hhmm, isoWeekday, startOfDay } from "./time.js";
import type { Person } from "./types.js";

export interface Outgoing {
  service: string;
  title: string;
  message: string;
  key: string;
}

const join = (xs: string[]) => xs.join(" · ");

/**
 * Pure: which notifications are due this minute.
 *  - `before` minutes before each duty: "Om 30 min: Hämta Maja på förskolan 16:00"
 *    (a drop-off with something to bring: "… – ta med: blöjor, extrakläder")
 *  - 20:00: tomorrow's duties for that person
 *  - Sunday 19:00: "Planera veckan" when something has no one yet
 */
export function dueNotifications(adults: Person[], list: Duty[], missingThisWeek: number, missingTomorrow: number, now: Date): Outgoing[] {
  const out: Outgoing[] = [];
  const t = hhmm(now);
  const tomorrow = addDays(startOfDay(now), 1);
  const dayAfter = addDays(tomorrow, 1);
  for (const a of adults) {
    const n = a.notify;
    if (!n?.service) continue;
    const mine = list.filter((d) => d.personId === a.id);
    if (n.before && n.before > 0) {
      for (const d of mine) {
        // The usual morning drop-off is routine – only remind when this morning is different,
        // or when something has to come along (blöjor, extrakläder).
        if (d.leg === "to" && d.standard && d.at.getHours() < 10 && !d.bring?.length) continue;
        const fire = new Date(d.at.getTime() - n.before * 60_000);
        if (hhmm(fire) === t && fire.toDateString() === now.toDateString()) {
          out.push({ service: n.service, title: `Om ${n.before} min`, message: dutyMessage(d), key: `before:${a.id}:${d.key}` });
        }
      }
    }
    if (n.evening && t === "20:00") {
      const tm = mine.filter((d) => d.at >= tomorrow && d.at < dayAfter);
      const extra = missingTomorrow ? [`${missingTomorrow} ${missingTomorrow === 1 ? "sak" : "saker"} imorgon saknar ansvarig`] : [];
      if (tm.length || extra.length) {
        // Key includes what is in it, so a changed plan after 20:00 does not stay silent until tomorrow's own reminders.
        const sig = tm.map((d) => `${d.key}${d.bring?.join("+") ?? ""}`).join(",");
        out.push({ service: n.service, title: "Imorgon", message: join([...tm.map((d) => dutyMessage(d)), ...extra]), key: `evening:${a.id}:${tomorrow.toDateString()}:${sig}` });
      }
    }
    if (n.weekly && isoWeekday(now) === 7 && t === "19:00" && missingThisWeek > 0) {
      out.push({
        service: n.service,
        title: "Planera veckan",
        message: `${missingThisWeek} ${missingThisWeek === 1 ? "sak saknar" : "saker saknar"} någon som lämnar, hämtar eller skjutsar. Öppna tavlan och tryck på Planera veckan.`,
        key: `weekly:${a.id}:${now.toDateString()}`,
      });
    }
  }
  return out;
}

/** Checks every minute (only when someone has notifications on) and sends each message once. */
export function startNotifier(log: FastifyBaseLogger) {
  const sent = new Set<string>();
  let lastMinute = "";
  const tick = async () => {
    const now = new Date();
    const minute = `${now.toDateString()} ${hhmm(now)}`;
    if (minute === lastMinute) return;
    lastMinute = minute;
    const cfg = loadConfig();
    const adults = cfg.people.filter((p) => p.kind === "adult" && p.notify?.service);
    const conn = haConnection();
    if (!adults.length || !conn || !cfg.setupComplete) return;
    try {
      const fam = await gatherFamily(cfg, now, []);
      const list = duties(fam.withCare, fam.people, fam.travelCtx, now, addDays(startOfDay(now), 3), loadShelf());
      const plan = buildPlan(fam.withCare, fam.people, fam.travelCtx, now, () => ({ time: "", title: "", color: "", who: "", category: "family", icon: "event" }));
      const missingTomorrow = plan.items.filter((i) => i.dayLabel === "imorgon" && needsAttention(i)).length;
      for (const m of dueNotifications(adults, list, plan.missing, missingTomorrow, now)) {
        if (sent.has(m.key)) continue;
        sent.add(m.key);
        await ha.service(conn, "notify", m.service, { title: m.title, message: m.message }).catch((e) => log.warn(`Notis till ${m.service} misslyckades: ${(e as Error).message}`));
      }
      if (sent.size > 2000) sent.clear();
    } catch (e) {
      log.warn(`Påminnelser: ${(e as Error).message}`);
    }
  };
  return setInterval(() => void tick(), 20_000);
}
