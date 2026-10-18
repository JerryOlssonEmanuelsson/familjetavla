import { fetchPrices, toHourly, type HourPrice } from "../connectors/elpris.js";
import { ha, haConnection } from "../connectors/ha.js";
import type { PriceProvider } from "./types.js";

const summary = (p: HourPrice[]) => {
  if (!p.length) return ["Inga priser ännu"];
  const min = Math.min(...p.map((x) => x.price));
  const max = Math.max(...p.map((x) => x.price));
  return [`${p.length} timmar · lägst ${min.toFixed(2)} kr · högst ${max.toFixed(2)} kr (spot)`];
};

export const spotPrice: PriceProvider = {
  meta: {
    id: "spot",
    category: "price",
    name: "Spotpris (Nord Pool)",
    description: "Timpris för ditt elområde från elprisetjustnu.se. Fungerar för alla elbolag – lägg till ditt påslag nedan.",
    status: "stable",
    fields: [
      {
        key: "area",
        label: "Elområde",
        type: "select",
        default: "SE3",
        options: [
          { value: "SE1", label: "SE1 – Luleå" },
          { value: "SE2", label: "SE2 – Sundsvall" },
          { value: "SE3", label: "SE3 – Stockholm" },
          { value: "SE4", label: "SE4 – Malmö" },
        ],
        help: "Står på elräkningen eller på elbolagets sida.",
      },
    ],
  },
  async test(ctx) {
    return { ok: true, preview: summary(await fetchPrices(ctx.str("area") || "SE3")) };
  },
  async fetch(ctx, now) {
    return fetchPrices(ctx.str("area") || "SE3", now);
  },
};

type RawPoint = { start?: string; end?: string; value?: number; price?: number; total?: number; startsAt?: string };

/**
 * Read hourly prices from a Home Assistant sensor. Supports the common shapes:
 * Nordpool (HACS) `raw_today`/`raw_tomorrow` [{start, value}] or `today`/`tomorrow` number arrays,
 * and `prices_today`/`prices`-style lists with `startsAt`/`total` (Tibber-like templates).
 */
export function pricesFromAttributes(attrs: Record<string, unknown>, unit: string, now: Date): HourPrice[] {
  const scale = /öre|ore/i.test(unit) ? 0.01 : 1;
  const rows: { SEK_per_kWh: number; time_start: string }[] = [];
  const pushRaw = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const p of list as RawPoint[]) {
      const start = p.start ?? p.startsAt;
      const v = p.value ?? p.price ?? p.total;
      if (start && typeof v === "number") rows.push({ SEK_per_kWh: v * scale, time_start: start });
    }
  };
  const pushArray = (list: unknown, dayOffset: number) => {
    if (!Array.isArray(list) || typeof list[0] !== "number") return;
    const step = list.length > 30 ? 15 : 60;
    list.forEach((v: number, i: number) => {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, i * step);
      rows.push({ SEK_per_kWh: v * scale, time_start: t.toISOString() });
    });
  };
  if (attrs.raw_today || attrs.raw_tomorrow) {
    pushRaw(attrs.raw_today);
    pushRaw(attrs.raw_tomorrow);
  } else if (Array.isArray(attrs.today)) {
    pushArray(attrs.today, 0);
    pushArray(attrs.tomorrow, 1);
  } else {
    for (const key of ["prices_today", "prices_tomorrow", "prices", "data"]) pushRaw(attrs[key]);
  }
  return toHourly(rows);
}

export const haPrice: PriceProvider = {
  meta: {
    id: "ha-price",
    category: "price",
    name: "Från Home Assistant",
    description: "Använd elpris-sensorn du redan har, t.ex. Nordpool, Tibber eller ditt elbolags integration.",
    status: "beta",
    needsHa: true,
    fields: [
      { key: "entityId", label: "Elpris-sensor", type: "entity", domains: ["sensor"], help: "Sensorn behöver ha timpriser som attribut (raw_today/today)." },
    ],
    guide: ["Om sensorn redan räknar med påslag, nät och moms: sätt dem till 0 nedan."],
  },
  async test(ctx) {
    return { ok: true, preview: summary(await this.fetch(ctx, new Date())) };
  },
  async fetch(ctx, now) {
    const conn = haConnection();
    if (!conn) throw new Error("Home Assistant är inte anslutet.");
    const s = await ha.state(conn, ctx.str("entityId"));
    const prices = pricesFromAttributes(s.attributes, String(s.attributes.unit_of_measurement ?? "SEK/kWh"), now);
    if (!prices.length) throw new Error("Sensorn har inga timpriser i sina attribut.");
    return prices;
  },
};
