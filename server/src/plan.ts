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
      const busy = busyAdults(e, events, people);
      return {
        ...d,
        ...(busy.length ? { busy } : {}),
        travel: d.travel ?? resolveTravel(e, people, travel.calendars.get(e.sourceId), travel.saved),
        dayKey: dayKey(e.start),
        dayLabel: diff === 0 ? "idag" : diff === 1 ? "imorgon" : `${shortWeekday(e.start).toLowerCase()} ${e.start.getDate()}/${e.start.getMonth() + 1}`,
      };
    });
  return { missing: items.filter(needsAttention).length, items };
}

export interface Duty {
  /** The adult who is responsible. */
  personId: string;
  at: Date;
  /** "Lämna Maja på förskolan", "Skjutsa Ella till F14 – Träning" … */
  text: string;
  /** Unique per occurrence and leg, for "sent once". */
  key: string;
  /** Drop-off (to) or pick-up (home). */
  leg: "to" | "home";
  /** Comes from the usual default, not a choice for this day. */
  standard: boolean;
  /** Förskola/fritids drop-off: what is missing on the shelf ("Blöjor", "Extrakläder"). */
  bring?: string[];
}

/** The text for a notification or calendar entry: "Lämna Maja på förskolan 07:30 – ta med: blöjor, extrakläder". */
export function dutyMessage(d: Duty, withTime = true): string {
  const text = withTime ? d.text : d.text.replace(/ \d{2}:\d{2}$/, "");
  return d.bring?.length ? `${text} – ta med: ${d.bring.join(", ").toLowerCase()}` : text;
}

/**
 * What each grown-up is responsible for: drop-offs at the start, pick-ups at the end.
 * `shelf` ("saknas på hyllan" per child) goes with every förskola/fritids drop-off until it is cleared.
 */
export function duties(events: SourcedEvent[], people: Map<string, Person>, travel: TravelCtx, from: Date, until: Date, shelf: Record<string, string[]> = {}): Duty[] {
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
      const bring = care && !i && shelf[child.id]?.length ? shelf[child.id] : undefined;
      out.push({ personId: l.leg.mode.slice(6), at: l.at, text: `${l.text} ${hhmm(l.at)}`, key: `${t.key}:${i ? "home" : "to"}`, leg: i ? "home" : "to", standard: t.fromCalendar, bring });
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
    const text = dutyMessage(d, false);
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

/** Whole-day entries in a grown-up's own calendar that mean "not around". */
const AWAY = /resa|tjänsteresa|semester|bortrest|konferens|utomlands|\bborta\b|sjuk|vab/i;

/**
 * Grown-ups who are busy around this activity's drop-off (30 min before to 15 after the start) or
 * pick-up (15 min before to 30 after the end), according to calendars marked as theirs.
 */
export function busyAdults(e: SourcedEvent, events: SourcedEvent[], people: Map<string, Person>): NonNullable<PlanItem["busy"]> {
  const out: NonNullable<PlanItem["busy"]> = [];
  const windows = [
    { leg: "to" as const, from: e.start.getTime() - 30 * 60_000, to: e.start.getTime() + 15 * 60_000 },
    { leg: "home" as const, from: e.end.getTime() - 15 * 60_000, to: e.end.getTime() + 30 * 60_000 },
  ];
  for (const x of events) {
    const p = x.personId ? people.get(x.personId) : undefined;
    if (!p || p.kind !== "adult" || x === e) continue;
    for (const w of windows) {
      const hit = x.allDay ? AWAY.test(x.title) && x.start.getTime() < w.to && x.end.getTime() > w.from : x.start.getTime() < w.to && x.end.getTime() > w.from;
      if (hit && !out.some((b) => b.personId === p.id && b.leg === w.leg)) {
        out.push({ personId: p.id, leg: w.leg, title: x.allDay ? x.title : `${x.title} ${hhmm(x.start)}–${hhmm(x.end)}` });
      }
    }
  }
  return out;
}

/** Someone is missing, or the chosen grown-up is busy then. */
export function needsAttention(i: PlanItem): boolean {
  if (!i.travel.to || !i.travel.home) return true;
  return (i.busy ?? []).some((b) => (b.leg === "to" ? i.travel.to : i.travel.home)?.mode === `adult:${b.personId}`);
}
