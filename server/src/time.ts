// Date helpers. The server runs with TZ=Europe/Stockholm, so local Date methods are Swedish time.

export const DAY_MS = 86_400_000;

const WEEKDAYS_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const WEEKDAYS_LONG = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  // Calendar arithmetic (not ms) so DST changes do not shift the day.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** ISO 8601 week number (weeks start Monday, week 1 contains the first Thursday). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

/** Whole calendar days from a to b (b − a), DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function shortWeekday(d: Date) {
  return WEEKDAYS_SHORT[d.getDay()];
}

export function shortDate(d: Date) {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function longDate(d: Date) {
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** "idag", "imorgon", "tis" … relative to `now`. */
export function relativeDay(d: Date, now: Date): string {
  const diff = daysBetween(now, d);
  if (diff === 0) return "idag";
  if (diff === 1) return "imorgon";
  return shortWeekday(d).toLowerCase();
}

/** True when the clock time `now` is inside [from, to), wrapping midnight. */
export function inTimeWindow(now: Date, from: string, to: string): boolean {
  const m = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const f = fh * 60 + fm;
  const t = th * 60 + tm;
  return f <= t ? m >= f && m < t : m >= f || m < t;
}
