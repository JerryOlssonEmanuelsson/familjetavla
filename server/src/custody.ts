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
