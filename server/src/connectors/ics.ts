import ical from "node-ical";
import rrulePkg from "rrule";

const { RRule } = rrulePkg;
import { getText, normalizeCalendarUrl } from "../http.js";

export interface CalEvent {
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
  location?: string;
  description?: string;
  /** CATEGORIES from the feed – SportAdmin/laget.se often put the team or group here. */
  categories?: string[];
  /** UID from the calendar – same for every occurrence of a recurring event. */
  uid?: string;
}

const haystack = (e: CalEvent) =>
  [e.title, e.description, e.location, ...(e.categories ?? [])].filter(Boolean).join(" \n ").toLowerCase();

/** Keep events matching any `include` term (if given) and none of the `exclude` terms. */
export function filterEvents<T extends CalEvent>(events: T[], include?: string[], exclude?: string[]): T[] {
  const inc = (include ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const exc = (exclude ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!inc.length && !exc.length) return events;
  return events.filter((e) => {
    const h = haystack(e);
    if (inc.length && !inc.some((t) => h.includes(t))) return false;
    return !exc.some((t) => h.includes(t));
  });
}

/**
 * Guess the teams/groups in a feed so the wizard can offer checkboxes: CATEGORIES first,
 * else a shared title prefix like "P14 Blå – Träning" / "F12: Match".
 */
export function detectGroups(events: CalEvent[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  const add = (k: string) => {
    const name = k.trim();
    if (name.length >= 2 && name.length <= 40) counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  const withCats = events.filter((e) => e.categories?.length);
  if (withCats.length >= events.length / 2) {
    for (const e of withCats) for (const c of e.categories!) add(c);
  } else {
    for (const e of events) {
      const m = /^(.{2,40}?)\s*(?:[-–—:|]\s+|\s+[-–—]\s*)/.exec(e.title);
      if (m) add(m[1]);
    }
  }
  const groups = [...counts].map(([name, count]) => ({ name, count })).filter((g) => g.count >= 2);
  return groups.length >= 2 ? groups.sort((a, b) => b.count - a.count).slice(0, 12) : [];
}

type VEvent = ical.VEvent & { datetype?: string };

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local wall-clock time encoded as UTC ("floating"), which is how rrule computes without a tz. */
const toFloating = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
const fromFloating = (d: Date) =>
  new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());

/**
 * Expand a recurrence rule in local (server) time. rrule's own TZID handling depends on the
 * process time zone and shifts times by the UTC offset, so we rebuild the rule on floating
 * wall-clock time instead. This keeps "every Monday 17:30" at 17:30 across DST changes,
 * assuming the calendar's zone is the server's (Europe/Stockholm).
 */
function expandRule(rule: NonNullable<ical.VEvent["rrule"]>, start: Date, from: Date, to: Date): Date[] {
  const orig = rule.origOptions;
  const r = new RRule({
    ...orig,
    tzid: undefined,
    dtstart: toFloating(start),
    until: orig.until ? toFloating(new Date(orig.until)) : undefined,
  });
  return r.between(toFloating(from), toFloating(to), true).map(fromFloating);
}

function isAllDay(ev: VEvent): boolean {
  return ev.datetype === "date" || (ev.start as unknown as { dateOnly?: boolean })?.dateOnly === true;
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val);
  return "";
}

/** Parse ICS text and expand recurring events into [from, to). */
export function parseIcs(body: string, from: Date, to: Date): CalEvent[] {
  const data = ical.sync.parseICS(body);
  const out: CalEvent[] = [];

  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (!ev.start) continue;
    const start = new Date(ev.start);
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 3_600_000);
    const duration = end.getTime() - start.getTime();
    const allDay = isAllDay(ev);
    const cats = (ev as { categories?: unknown }).categories;
    const base = {
      uid: typeof ev.uid === "string" && ev.uid ? ev.uid : undefined,
      allDay,
      title: text(ev.summary) || "(utan titel)",
      location: text(ev.location) || undefined,
      description: text(ev.description) || undefined,
      categories: Array.isArray(cats) ? cats.map(String).filter(Boolean) : typeof cats === "string" ? [cats] : undefined,
    };

    if (ev.rrule) {
      const exdates = new Set(Object.values(ev.exdate ?? {}).map((d) => dayKey(new Date(d as Date))));
      for (const s of expandRule(ev.rrule, start, new Date(from.getTime() - duration), to)) {
        if (exdates.has(dayKey(s))) continue;
        const override = ev.recurrences?.[dayKey(s)] ?? ev.recurrences?.[s.toISOString().slice(0, 10)];
        if (override) {
          const os = new Date(override.start);
          const oe = override.end ? new Date(override.end) : new Date(os.getTime() + duration);
          if (oe > from && os < to) out.push({ ...base, title: text(override.summary) || base.title, start: os, end: oe });
          continue;
        }
        const e = new Date(s.getTime() + duration);
        if (e > from && s < to) out.push({ ...base, start: s, end: e });
      }
    } else if (end > from && start < to) {
      out.push({ ...base, start, end });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function fetchIcs(url: string, from: Date, to: Date): Promise<CalEvent[]> {
  const body = await getText(normalizeCalendarUrl(url), { timeoutMs: 20_000, headers: { accept: "text/calendar, */*" } });
  if (!body.includes("BEGIN:VCALENDAR")) {
    throw new Error("Länken gav ingen kalender (ICS). Kontrollera att du kopierat prenumerationslänken.");
  }
  return parseIcs(body, from, to);
}
