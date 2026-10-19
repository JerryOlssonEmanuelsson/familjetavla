import type { Custody, Person } from "./types.js";
import { addDays, dayKey, daysBetween, isoWeek, isoWeekday, parseDayKey, startOfDay } from "./time.js";

/**
 * Start of the "custody week" that contains `date`: the most recent handover day.
 * With handover on Monday this is the ISO week's Monday; with Friday it is the Friday before.
 */
export function custodyWeekStart(date: Date, handoverDay = 1): Date {
  const d = startOfDay(date);
  const back = (isoWeekday(d) - handoverDay + 7) % 7;
  return addDays(d, -back);
}

/**
 * Is the child at this home on `date`?
 *
 * "oddWeeks"/"evenWeeks" use the ISO week number of the handover day that started the
 * current custody week. Note that years with 53 weeks (e.g. 2026) give two odd weeks in a
 * row (53 and 1). Families that simply alternate should use "alternating", which counts
 * whole weeks from an anchor date and never drifts.
 */
export function isHome(custody: Custody | undefined, date: Date): boolean {
  if (!custody) return true;
  if (custody.overrides?.length) {
    const k = dayKey(date);
    // Last matching override wins, so a later, more specific exception can refine an earlier one.
    for (let i = custody.overrides.length - 1; i >= 0; i--) {
      const o = custody.overrides[i];
      if (k >= o.from && k <= o.to) return o.home;
    }
  }
  if (custody.mode === "always") return true;
  const handover = custody.handoverDay ?? 1;
  const weekStart = custodyWeekStart(date, handover);

  if (custody.mode === "oddWeeks" || custody.mode === "evenWeeks") {
    // Use the ISO week of the Monday-to-Sunday week the handover day falls in.
    const odd = isoWeek(weekStart) % 2 === 1;
    return custody.mode === "oddWeeks" ? odd : !odd;
  }

  if (custody.mode === "pattern") {
    const p = custody.pattern;
    if (!p || p.length !== 14 || !custody.anchorDate) return true;
    const weeks = Math.round(daysBetween(custodyWeekStart(parseDayKey(custody.anchorDate), 1), custodyWeekStart(date, 1)) / 7);
    const week = ((weeks % 2) + 2) % 2;
    return Boolean(p[week * 7 + isoWeekday(date) - 1]);
  }

  // alternating
  if (!custody.anchorDate) return true;
  const anchorStart = custodyWeekStart(parseDayKey(custody.anchorDate), handover);
  const weeks = Math.round(daysBetween(anchorStart, weekStart) / 7);
  return ((weeks % 2) + 2) % 2 === 0;
}

export interface CustodyStatus {
  home: boolean;
  /** Next date the status flips (the next handover where home changes). */
  nextChange: Date | null;
  /** Days left until the change. */
  daysLeft: number;
  /** How far through the current stretch we are, 0–1. */
  progress: number;
}

export function custodyStatus(custody: Custody | undefined, now: Date, horizonDays = 60): CustodyStatus {
  const today = startOfDay(now);
  const home = isHome(custody, today);
  if (!custody || (custody.mode === "always" && !custody.overrides?.length)) {
    return { home: true, nextChange: null, daysLeft: 0, progress: 1 };
  }
  let next: Date | null = null;
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(today, i);
    if (isHome(custody, d) !== home) {
      next = d;
      break;
    }
  }
  let start: Date = today;
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(today, -i);
    if (isHome(custody, d) !== home) break;
    start = d;
  }
  const daysLeft = next ? daysBetween(today, next) : 0;
  const total = next ? daysBetween(start, next) : 1;
  const progress = total > 0 ? Math.min(1, Math.max(0, daysBetween(start, today) / total)) : 1;
  return { home, nextChange: next, daysLeft, progress };
}

export function childrenHomeOn(people: Person[], date: Date): Person[] {
  return people.filter((p) => p.kind === "child" && isHome(p.custody, date));
}

/** Ready-made 14-day patterns (Mon–Sun week A, then week B). true = here. */
export const CUSTODY_PRESETS: { id: string; label: string; pattern: boolean[] }[] = [
  { id: "223", label: "2-2-3", pattern: [1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0].map(Boolean) },
  { id: "2255", label: "2-2-5-5", pattern: [1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0].map(Boolean) },
  { id: "weekend", label: "Varannan helg (fre–sön)", pattern: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0].map(Boolean) },
  { id: "everyday-but-weekend", label: "Alla dagar utom varannan helg", pattern: [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1].map(Boolean) },
  { id: "7-7", label: "Varannan vecka (mån–sön)", pattern: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0].map(Boolean) },
];

/**
 * Care times ("07:30-16:00") for one day. With a rolling 2- or 4-week schedule the week is
 * counted from the anchor date's Monday, like "alternating" custody, so week 53 never shifts it.
 */
export function careTimesFor(care: Person["care"], date: Date): string | undefined {
  if (!care) return undefined;
  const wd = String(isoWeekday(date));
  const extra = care.weeks ?? [];
  if (!extra.length || !care.anchorDate) return care.days[wd];
  const n = extra.length + 1;
  const weeks = Math.round(daysBetween(custodyWeekStart(parseDayKey(care.anchorDate), 1), custodyWeekStart(date, 1)) / 7);
  const i = ((weeks % n) + n) % n;
  return i === 0 ? care.days[wd] : extra[i - 1]?.[wd];
}
