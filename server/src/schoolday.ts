import type { SourcedEvent } from "./sources.js";
import type { Dashboard, Person } from "./types.js";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const SHORT = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

/**
 * When each child's school day starts and ends, from the lessons the school platform gives us.
 * Today until the last lesson is over (plus a quarter), then the next school day.
 * Evening things in the school calendar (parent meetings) and all-day items don't count.
 */
export function buildSchoolDays(
  events: SourcedEvent[],
  people: Map<string, Person>,
  now: Date,
  isHere: (ev: SourcedEvent, day: Date) => boolean = () => true,
): Dashboard["schoolDay"] {
  const lessons = events.filter((e) => {
    if (!e.sourceId.startsWith("school:") || e.allDay || !e.personId) return false;
    const h = e.start.getHours();
    const endsBy = e.end.getHours() + e.end.getMinutes() / 60;
    return h >= 6 && h < 17 && endsBy <= 18 && e.end > e.start;
  });
  const today = startOfDay(now);
  const out: NonNullable<Dashboard["schoolDay"]> = [];
  for (const p of people.values()) {
    if (p.kind !== "child") continue;
    const mine = lessons.filter((e) => e.personId === p.id);
    for (let i = 0; i < 5; i++) {
      const day = new Date(today.getTime() + i * DAY);
      const next = new Date(day.getTime() + DAY);
      const that = mine.filter((e) => e.start >= day && e.start < next && isHere(e, day));
      if (!that.length) continue;
      const start = new Date(Math.min(...that.map((e) => e.start.getTime())));
      const end = new Date(Math.max(...that.map((e) => e.end.getTime())));
      if (i === 0 && now.getTime() > end.getTime() + 15 * 60_000) continue;
      out.push({
        personId: p.id,
        name: p.name,
        color: p.color,
        dayLabel: i === 0 ? "idag" : i === 1 ? "imorgon" : SHORT[day.getDay()],
        start: hm(start),
        end: hm(end),
        gym: that.some((e) => e.gym),
      });
      break;
    }
  }
  // Soonest first: today's children before tomorrow's, then by end time.
  const order = (l: string) => (l === "idag" ? 0 : l === "imorgon" ? 1 : 2);
  return out.sort((a, b) => order(a.dayLabel) - order(b.dayLabel) || a.end.localeCompare(b.end));
}
