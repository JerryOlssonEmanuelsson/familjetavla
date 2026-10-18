import { visibleOn, type TravelCtx } from "./dashboard.js";
import type { SourcedEvent } from "./sources.js";
import { addDays, daysBetween, dayKey, hhmm, shortWeekday, startOfDay } from "./time.js";
import { isCare, resolveTravel, wantsTravel } from "./travel.js";
import type { DashEvent, Person, PlanItem } from "./types.js";

/**
 * "Planera veckan": every child activity and förskola day in the next 7 days that needs a grown-up
 * to drop off / pick up / drive. `missing` counts the ones where a leg has no one yet.
 */
export function buildPlan(
  events: SourcedEvent[],
  people: Map<string, Person>,
  travel: TravelCtx,
  now: Date,
  toDash: (e: SourcedEvent) => DashEvent,
  days = 7,
): { missing: number; items: PlanItem[] } {
  const until = addDays(startOfDay(now), days);
  const items = events
    .filter((e) => e.end > now && e.start < until && wantsTravel(e, people) && visibleOn(e, people, startOfDay(e.start)))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((e) => {
      const d = toDash(e);
      const diff = daysBetween(now, e.start);
      return {
        ...d,
        travel: d.travel ?? resolveTravel(e, people, travel.calendars.get(e.sourceId), travel.saved),
        dayKey: dayKey(e.start),
        dayLabel: diff === 0 ? "idag" : diff === 1 ? "imorgon" : `${shortWeekday(e.start).toLowerCase()} ${e.start.getDate()}/${e.start.getMonth() + 1}`,
      };
    });
  return { missing: items.filter((i) => !i.travel.to || !i.travel.home).length, items };
}

export interface Duty {
  /** The adult who is responsible. */
  personId: string;
  at: Date;
  /** "Lämna Maja på förskolan", "Skjutsa Ella till F14 – Träning" … */
  text: string;
  /** Unique per occurrence and leg, for "sent once". */
  key: string;
}

/** What each grown-up is responsible for: drop-offs at the start, pick-ups at the end. */
export function duties(events: SourcedEvent[], people: Map<string, Person>, travel: TravelCtx, from: Date, until: Date): Duty[] {
  const out: Duty[] = [];
  for (const e of events) {
    if (e.end <= from || e.start >= until || !wantsTravel(e, people) || !visibleOn(e, people, startOfDay(e.start))) continue;
    const child = people.get(e.personId!)!;
    const t = resolveTravel(e, people, travel.calendars.get(e.sourceId), travel.saved);
    const care = isCare(e.sourceId);
    const place = e.title;
    const at = care ? careAt(place) : "";
    const legs = [
      { leg: t.to, at: e.start, text: care ? `Lämna ${child.name} ${at}` : `Skjutsa ${child.name} till ${place}` },
      { leg: t.home, at: e.end, text: care ? `Hämta ${child.name} ${at}` : `Hämta ${child.name} efter ${place}` },
    ];
    for (const [i, l] of legs.entries()) {
      if (!l.leg?.mode.startsWith("adult:") || l.at < from || l.at >= until) continue;
      out.push({ personId: l.leg.mode.slice(6), at: l.at, text: `${l.text} ${hhmm(l.at)}`, key: `${t.key}:${i ? "home" : "to"}` });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** "på förskolan", "på fritids", "hos dagbarnvårdaren". */
export function careAt(name: string): string {
  const n = name.trim().toLowerCase();
  if (n === "förskola") return "på förskolan";
  if (n === "dagbarnvårdare") return "hos dagbarnvårdaren";
  return `på ${n}`;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** A subscribable calendar with one 15-minute event per duty (and an alert when wanted). */
export function dutiesIcs(name: string, list: Duty[], alarmMin?: number): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Familjetavla//SV", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(`Familjetavla – ${name}`)}`, "X-PUBLISHED-TTL:PT30M", "REFRESH-INTERVAL;VALUE=DURATION:PT30M"];
  const stamp = icsDate(new Date());
  for (const d of list) {
    const text = d.text.replace(/ \d{2}:\d{2}$/, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(d.key)}@familjetavla`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(d.at)}`,
      `DTEND:${icsDate(new Date(d.at.getTime() + 15 * 60_000))}`,
      `SUMMARY:${icsText(text)}`,
    );
    if (alarmMin && alarmMin > 0) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(text)}`, `TRIGGER:-PT${alarmMin}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
