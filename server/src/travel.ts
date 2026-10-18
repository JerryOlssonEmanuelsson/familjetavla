import type { SourcedEvent } from "./sources.js";
import { loadLocal, saveLocal } from "./store.js";
import type { CalendarSource, DashTravel, Person, TravelChoice, TravelLeg, TravelMode } from "./types.js";

/** Stable key for one occurrence: calendar + start time. */
export function travelKey(ev: Pick<SourcedEvent, "sourceId" | "start">): string {
  return `${ev.sourceId}@${ev.start.toISOString()}`;
}

/** Children's own activities (sport, family events tagged to a child) – not school lessons or all-day events. */
export function wantsTravel(ev: SourcedEvent, people: Map<string, Person>): boolean {
  const p = ev.personId ? people.get(ev.personId) : undefined;
  return Boolean(p && p.kind === "child" && !ev.allDay && !ev.sourceId.startsWith("school:"));
}

export function travelOptions(people: Map<string, Person>): { mode: TravelMode; label: string }[] {
  const adults = [...people.values()].filter((p) => p.kind === "adult");
  return [
    ...adults.map((a) => ({ mode: `adult:${a.id}` as TravelMode, label: `${a.name} skjutsar` })),
    { mode: "ride", label: "Blir skjutsad" },
    { mode: "bus", label: "Buss" },
    { mode: "self", label: "Cyklar/går" },
  ];
}

export function legLabel(leg: TravelLeg, people: Map<string, Person>): string {
  if (leg.mode === "bus") return "Buss";
  if (leg.mode === "self") return "Cyklar/går";
  if (leg.mode === "ride") return leg.by ? `Skjuts med ${leg.by}` : "Blir skjutsad";
  const p = people.get(leg.mode.slice(6));
  return p ? `${p.name} skjutsar` : "Skjuts";
}

/** Per-event choices in local.json, falling back to the calendar's default. */
export function resolveTravel(ev: SourcedEvent, people: Map<string, Person>, cal: CalendarSource | undefined, saved: Record<string, TravelChoice>): DashTravel {
  const key = travelKey(ev);
  const own = saved[key];
  const choice = own ?? cal?.travel ?? {};
  const fmt = (l?: TravelLeg) => (l ? { ...l, label: legLabel(l, people) } : undefined);
  return {
    key,
    calendarId: cal?.id,
    calendarName: cal?.name,
    to: fmt(choice.to),
    home: fmt(choice.home),
    fromCalendar: !own && Boolean(cal?.travel && (cal.travel.to || cal.travel.home)),
  };
}

/** "Emil skjutsar dit · buss hem" for reminders and the Nu-zon. */
export function travelSummary(t: DashTravel | undefined): string {
  if (!t || (!t.to && !t.home)) return "";
  if (t.to && t.home && t.to.label === t.home.label) return `${t.to.label} dit och hem`;
  return [t.to && `${t.to.label} dit`, t.home && `${lower(t.home.label)} hem`].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase());
}
const lower = (s: string) => (/^[A-ZÅÄÖ][a-zåäö]+ skjutsar/.test(s) ? s : s[0].toLowerCase() + s.slice(1));

export function loadTravel(): Record<string, TravelChoice> {
  return loadLocal().travel ?? {};
}

/** Save one event's choice (null clears it). Old entries are dropped after two days. */
export function saveTravel(key: string, choice: TravelChoice | null, now = new Date()) {
  const all = { ...loadTravel() };
  if (choice && (choice.to || choice.home)) all[key] = choice;
  else delete all[key];
  const cutoff = now.getTime() - 2 * 86_400_000;
  for (const k of Object.keys(all)) {
    const t = Date.parse(k.slice(k.lastIndexOf("@") + 1));
    if (Number.isFinite(t) && t < cutoff) delete all[k];
  }
  saveLocal({ travel: all });
}
