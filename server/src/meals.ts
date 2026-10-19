import { loadLocal, saveLocal } from "./store.js";
import { addDays, dayKey, daysBetween, shortWeekday, startOfDay } from "./time.js";
import type { MealDay } from "./types.js";

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

/**
 * Which date a menu line is for. Menus say "Måndag 19/10" (skolmaten, Skolmat i HA) or just
 * "Måndag" (Vklass); without a date the next such weekday within the week is used.
 */
export function menuDate(label: string, today: Date): Date | null {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(label);
  if (m) {
    const d = new Date(today.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    // Around new year the menu can be for next year.
    if (daysBetween(today, d) < -180) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const wd = WEEKDAYS.findIndex((w) => label.toLowerCase().includes(w));
  if (wd < 0) return null;
  for (let i = 0; i < 7; i++) {
    const d = addDays(startOfDay(today), i);
    if (d.getDay() === wd) return d;
  }
  return null;
}

export function loadDinners(): Record<string, string> {
  return loadLocal().dinners ?? {};
}

/** Save one day's dinner ("" clears). Days older than a week are dropped. */
export function saveDinner(day: string, text: string, now = new Date()) {
  const all = { ...loadDinners() };
  const clean = text.trim().slice(0, 80);
  if (clean) all[day] = clean;
  else delete all[day];
  const cutoff = dayKey(addDays(startOfDay(now), -7));
  for (const k of Object.keys(all)) if (k < cutoff) delete all[k];
  saveLocal({ dinners: all });
}

/** The coming 7 days: school/förskola lunch per child next to the family's dinner. */
export function buildMeals(food: { child: string; day: string; dishes: string[] }[], dinners: Record<string, string>, now: Date): MealDay[] {
  const today = startOfDay(now);
  const days: MealDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const key = dayKey(d);
    days.push({ dayKey: key, dayLabel: i === 0 ? "idag" : i === 1 ? "imorgon" : `${shortWeekday(d).toLowerCase()} ${d.getDate()}/${d.getMonth() + 1}`, dinner: dinners[key], lunch: [] });
  }
  for (const f of food) {
    const d = menuDate(f.day, today);
    const day = d && days.find((x) => x.dayKey === dayKey(d));
    if (!day || !f.dishes.length) continue;
    // Several children on the same menu: one line with both names.
    const same = day.lunch.find((l) => l.dishes.join("|") === f.dishes.join("|"));
    if (same) {
      if (f.child && !same.child.split(" och ").includes(f.child)) same.child = same.child ? `${same.child} och ${f.child}` : f.child;
    } else day.lunch.push({ child: f.child, dishes: f.dishes });
  }
  return days;
}

/** "Pannkakor" for dinner when the kids had pannkakor for lunch – words of 5+ letters in common. */
export function sameAsLunch(dinner: string | undefined, lunch: { dishes: string[] }[]): string | null {
  if (!dinner) return null;
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-zåäöé]{5,}/g) ?? []);
  const d = words(dinner);
  for (const l of lunch) for (const dish of l.dishes) for (const w of words(dish)) if (d.has(w)) return dish;
  return null;
}
