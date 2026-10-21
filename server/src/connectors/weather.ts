import { getJson } from "../http.js";

/** Forecast from Open-Meteo (free, no key; uses MET Norway/ECMWF models covering Sweden). */

export interface Place {
  name: string;
  region?: string;
  lat: number;
  lon: number;
}

export async function geocode(query: string): Promise<Place[]> {
  type R = { results?: { name: string; admin1?: string; admin2?: string; latitude: number; longitude: number }[] };
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=sv&countryCode=SE`;
  const data = await getJson<R>(url);
  return (data.results ?? []).map((r) => ({
    name: r.name,
    region: [r.admin2, r.admin1].filter(Boolean).join(", ") || undefined,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export interface Forecast {
  hourly: { time: Date; precip: number; temp: number; cloud: number }[];
  daily: { date: string; tmax: number; tmin: number; precip: number; wind: number; sunrise?: string; sunset?: string }[];
}

export async function forecast(lat: number, lon: number): Promise<Forecast> {
  type R = {
    hourly: { time: string[]; precipitation: number[]; temperature_2m: number[]; cloud_cover?: number[] };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      wind_speed_10m_max: number[];
      sunrise?: string[];
      sunset?: string[];
    };
  };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,temperature_2m,cloud_cover` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset` +
    `&wind_speed_unit=ms&timezone=Europe%2FStockholm&forecast_days=3`;
  const d = await getJson<R>(url);
  return {
    // Open-Meteo returns local wall-clock times without offset; new Date() reads them as local.
    hourly: d.hourly.time.map((t, i) => ({
      time: new Date(t),
      precip: d.hourly.precipitation[i],
      temp: d.hourly.temperature_2m[i],
      cloud: d.hourly.cloud_cover?.[i] ?? 50,
    })),
    daily: d.daily.time.map((t, i) => ({
      date: t,
      tmax: d.daily.temperature_2m_max[i],
      tmin: d.daily.temperature_2m_min[i],
      precip: d.daily.precipitation_sum[i],
      wind: d.daily.wind_speed_10m_max[i],
      // "2026-10-20T07:35" (local time) → "07:35"
      sunrise: d.daily.sunrise?.[i]?.slice(11, 16),
      sunset: d.daily.sunset?.[i]?.slice(11, 16),
    })),
  };
}

const fmt = (n: number) => String(Math.round(n));
const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

export function weatherSummary(f: Forecast, now = new Date()): string {
  const today = f.daily[0];
  if (!today) return "";
  const current = f.hourly.find((h) => h.time.getHours() === now.getHours() && h.time.getDate() === now.getDate());
  const parts = [
    today.precip >= 1 ? "Regn" : today.precip > 0.2 ? "Lite regn" : "Uppehåll",
    `${current ? fmt(current.temp) : fmt(today.tmax)}° (${fmt(today.tmin)}–${fmt(today.tmax)}°)`,
    `vind ${fmt(today.wind)} m/s`,
  ];
  if (today.precip >= 0.5) parts.push(`regn ${fmt1(today.precip)} mm`);
  return parts.join(" · ");
}

/** Today's sunrise and sunset, and how far the sun has come (0–1 between them, undefined at night). */
export function sunToday(f: Forecast, now = new Date()): { rise: string; set: string; pos?: number } | undefined {
  const t = f.daily[0];
  if (!t?.sunrise || !t.sunset) return undefined;
  const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const r = min(t.sunrise);
  const st = min(t.sunset);
  const n = now.getHours() * 60 + now.getMinutes();
  return { rise: t.sunrise, set: t.sunset, pos: n >= r && n <= st && st > r ? Math.round(((n - r) / (st - r)) * 100) / 100 : undefined };
}

/** mm of rain from `fromHour` to end of the given day offset (0 = today). */
export function rainBetween(f: Forecast, dayOffset: number, fromHour: number, toHour: number, now = new Date()): number {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return f.hourly
    .filter(
      (h) =>
        h.time.getDate() === target.getDate() &&
        h.time.getMonth() === target.getMonth() &&
        h.time.getHours() >= fromHour &&
        h.time.getHours() < toHour,
    )
    .reduce((s, h) => s + h.precip, 0);
}

/** Lowest temperature between two hours of a day (0 = today), or undefined without forecast. */
export function coldestBetween(f: Forecast, dayOffset: number, fromHour: number, toHour: number, now = new Date()): number | undefined {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const temps = f.hourly
    .filter((h) => h.time.getDate() === target.getDate() && h.time.getMonth() === target.getMonth() && h.time.getHours() >= fromHour && h.time.getHours() < toHour)
    .map((h) => h.temp);
  return temps.length ? Math.min(...temps) : undefined;
}

function currentHour(f: Forecast, now: Date) {
  return f.hourly.find((h) => h.time.getHours() === now.getHours() && h.time.getDate() === now.getDate());
}

export function tempNow(f: Forecast, now = new Date()): number | undefined {
  const h = currentHour(f, now);
  return h ? Math.round(h.temp) : undefined;
}

/** Sky right now, for the living background. */
export function skyNow(f: Forecast, now = new Date()): "clear" | "partly" | "cloudy" | "rain" | "snow" {
  const h = currentHour(f, now);
  if (!h) return "partly";
  if (h.precip >= 0.2) return h.temp <= 0.5 ? "snow" : "rain";
  if (h.cloud >= 75) return "cloudy";
  if (h.cloud >= 30) return "partly";
  return "clear";
}
