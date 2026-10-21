import type { SourcedEvent } from "./sources.js";
import { loadLocal, saveLocal } from "./store.js";
import { addDays, dayKey, startOfDay } from "./time.js";

/** Sjuk/VAB: days per child when förskola, school and activities are struck from the board. */
export function loadSick(): Record<string, string[]> {
  return loadLocal().sick ?? {};
}

export function setSick(personId: string, date: string, sick: boolean, now = new Date()) {
  const all = { ...loadSick() };
  // Keep two weeks back at most – old sick days are of no use.
  const oldest = dayKey(addDays(startOfDay(now), -14));
  const days = new Set((all[personId] ?? []).filter((d) => d >= oldest));
  if (sick) days.add(date);
  else days.delete(date);
  if (days.size) all[personId] = [...days].sort();
  else delete all[personId];
  saveLocal({ sick: all });
}

export const isSickOn = (sick: Record<string, string[]>, personId: string | undefined, d: Date) => Boolean(personId && sick[personId]?.includes(dayKey(d)));

/**
 * Takes away a sick child's events that day (förskola, lessons, training, own events) and puts in one
 * "Sjuk" marker instead, so the week, Nu, the duties and the notifications all follow.
 */
export function applySick(events: SourcedEvent[], sick: Record<string, string[]>): { kept: SourcedEvent[]; hidden: SourcedEvent[] } {
  const kept: SourcedEvent[] = [];
  const hidden: SourcedEvent[] = [];
  for (const e of events) (isSickOn(sick, e.personId, e.start) && e.sourceId !== "sick" ? hidden : kept).push(e);
  for (const [personId, days] of Object.entries(sick)) {
    for (const d of days) {
      const [y, m, day] = d.split("-").map(Number);
      kept.push({ sourceId: "sick", uid: `sick-${personId}-${d}`, title: "Sjuk – hemma", start: new Date(y, m - 1, day), end: new Date(y, m - 1, day + 1), allDay: true, personId, category: "family", ignoreCustody: true });
    }
  }
  return { kept, hidden };
}
