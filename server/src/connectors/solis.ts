import { createHash, createHmac } from "node:crypto";
import { fetchWithTimeout } from "../http.js";

/**
 * SolisCloud Platform API (v1). Every call is a POST signed with HMAC-SHA1:
 *   Authorization: API <KeyId>:base64(HMAC-SHA1(KeySecret, "POST\n<Content-MD5>\n<Content-Type>\n<Date>\n<path>"))
 * The API key is applied for at soliscloud.com (Basic Settings → API Management) after a
 * service ticket to Solis. The server refuses requests whose Date is more than 15 minutes off.
 */
export interface SolisCreds {
  /** e.g. https://www.soliscloud.com:13333 – given together with the key. */
  url: string;
  keyId: string;
  secret: string;
}

const CONTENT_TYPE = "application/json";

/** Headers for one signed request (exported for tests). */
export function solisHeaders(body: string, path: string, keyId: string, secret: string, now = new Date()): Record<string, string> {
  const md5 = createHash("md5").update(body, "utf8").digest("base64");
  const date = now.toUTCString(); // "Thu, 29 Oct 2026 11:40:00 GMT"
  const toSign = ["POST", md5, CONTENT_TYPE, date, path].join("\n");
  const sign = createHmac("sha1", secret).update(toSign, "utf8").digest("base64");
  return { "Content-MD5": md5, "Content-Type": CONTENT_TYPE, Date: date, Authorization: `API ${keyId}:${sign}` };
}

interface SolisResponse<T> {
  success?: boolean;
  code?: string | number;
  msg?: string;
  data?: T;
}

/** POST one API call and return `data`, or throw a clear Swedish message. */
export async function solisPost<T>(c: SolisCreds, path: string, payload: Record<string, unknown>): Promise<T> {
  const base = c.url.trim().replace(/\/+$/, "") || "https://www.soliscloud.com:13333";
  if (!/^https?:\/\//.test(base)) throw new Error("API-adressen ska börja med https://");
  if (!c.keyId || !c.secret) throw new Error("API-ID och hemlig nyckel behövs.");
  const body = JSON.stringify(payload);
  const res = await fetchWithTimeout(`${base}${path}`, { method: "POST", body, headers: solisHeaders(body, path, c.keyId.trim(), c.secret.trim()), timeoutMs: 20_000 });
  if (res.status === 408) throw new Error("SolisCloud säger att klockan går fel – datorns tid måste stämma på några minuter när.");
  if (res.status === 401 || res.status === 403) throw new Error("SolisCloud godkände inte nyckeln – kontrollera API-ID och hemlig nyckel.");
  if (!res.ok) throw new Error(`SolisCloud svarade ${res.status}`);
  const json = (await res.json()) as SolisResponse<T>;
  if (String(json.code ?? "0") !== "0" || json.success === false) {
    throw new Error(`SolisCloud: ${json.msg || `felkod ${json.code}`}`);
  }
  return json.data as T;
}

// ---------- Units ----------

type Raw = Record<string, unknown>;

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** A power field in kW, read with its "<key>Str" unit (W, kW, MW). `fallback` when no unit is given. */
export function kw(r: Raw, key: string, fallback: "W" | "kW" = "kW"): number | undefined {
  const n = num(r[key]);
  if (n === undefined) return undefined;
  const unit = String(r[`${key}Str`] ?? fallback).trim();
  if (/^W$/i.test(unit)) return n / 1000;
  if (/^MW$/i.test(unit)) return n * 1000;
  if (/^GW$/i.test(unit)) return n * 1_000_000;
  return n;
}

/** An energy field in kWh, read with its "<key>Str" unit (Wh, kWh, MWh, GWh). */
export function kwh(r: Raw, key: string): number | undefined {
  const n = num(r[key]);
  if (n === undefined) return undefined;
  const unit = String(r[`${key}Str`] ?? "kWh").trim();
  if (/^Wh$/i.test(unit)) return n / 1000;
  if (/^MWh$/i.test(unit)) return n * 1000;
  if (/^GWh$/i.test(unit)) return n * 1_000_000;
  return n;
}

const round = (n: number | undefined, d = 2) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d);
const sum = (xs: (number | undefined)[]) => (xs.some((x) => x !== undefined) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : undefined);

// ---------- Reading ----------

export interface SolisStation {
  id: string;
  name: string;
}

export interface SolarReading {
  /** Solar (PV) power right now. */
  solarKw?: number;
  /** + buys from the grid, − sells. */
  gridKw?: number;
  /** What the house uses right now. */
  houseKw?: number;
  batteryPct?: number;
  /** + charging, − discharging. */
  batteryKw?: number;
  today?: {
    solarKwh?: number;
    importKwh?: number;
    exportKwh?: number;
    houseKwh?: number;
    batteryChargeKwh?: number;
    batteryDischargeKwh?: number;
  };
  /** When the inverter last reported (ms). */
  updated?: number;
  station?: SolisStation;
}

/** The plants on the account. */
export async function solisStations(c: SolisCreds): Promise<SolisStation[]> {
  const data = await solisPost<{ page?: { records?: Raw[] } }>(c, "/v1/api/userStationList", { pageNo: 1, pageSize: 20 });
  return (data?.page?.records ?? []).map((r) => ({ id: String(r.id), name: String(r.stationName ?? r.sno ?? r.id) }));
}

/** PV power from the DC strings (pow1…pow32, in W); undefined when the inverter does not report them. */
export function pvKw(r: Raw): number | undefined {
  const strings: (number | undefined)[] = [];
  for (let i = 1; i <= 32; i++) {
    const n = num(r[`pow${i}`]);
    if (n !== undefined) strings.push(n);
  }
  if (!strings.length) return undefined;
  return strings.reduce<number>((a, x) => a + (x ?? 0), 0) / 1000;
}

/**
 * Turn the inverters' details and the plant's detail into one reading.
 *
 * Signs: Solis reports `psum` as + export / − import on most installations, but not all meters
 * are wired the same way. When the house load is known the sign that makes the energy balance
 * add up (house ≈ sun − battery charge + bought − sold) wins.
 */
export function toReading(inverters: Raw[], plant: Raw | undefined, station?: SolisStation): SolarReading {
  const solar = sum(inverters.map((r) => pvKw(r) ?? kw(r, "pac")));
  const batteryPct = inverters.map((r) => num(r.batteryCapacitySoc)).find((x) => x !== undefined) ?? num(plant?.batteryPercent);
  const batteryKw = sum(
    inverters.map((r) => {
      const p = kw(r, "batteryPower");
      if (p === undefined) return undefined;
      // batteryPower is always positive; the battery current tells the direction.
      const current = num(r.storageBatteryCurrent) ?? num(r.batteryCurrent);
      const dir = num(r.batteryDirection); // some firmwares: 0 = charging, 1 = discharging
      if (current !== undefined && current !== 0) return Math.sign(current) * Math.abs(p);
      if (dir === 1) return -Math.abs(p);
      return Math.abs(p);
    }),
  );
  const house = sum(inverters.map((r) => kw(r, "familyLoadPower"))) ?? (plant ? kw(plant, "familyLoadPower") : undefined);
  const psum = sum(inverters.map((r) => kw(r, "psum"))) ?? (plant ? kw(plant, "psum") : undefined);

  let grid: number | undefined;
  if (psum !== undefined) {
    grid = -psum; // + export in Solis → − on the board
    if (house !== undefined && solar !== undefined) {
      const bat = batteryKw ?? 0;
      const errExport = Math.abs(solar - bat - psum - house); // psum = + export
      const errImport = Math.abs(solar - bat + psum - house); // psum = + import
      if (errImport + 0.05 < errExport) grid = psum;
    }
  }

  const src = plant ?? {};
  const today = {
    solarKwh: round(kwh(src, "dayEnergy") ?? sum(inverters.map((r) => kwh(r, "eToday")))),
    importKwh: round(kwh(src, "gridPurchasedDayEnergy") ?? sum(inverters.map((r) => kwh(r, "gridPurchasedTodayEnergy")))),
    exportKwh: round(kwh(src, "gridSellDayEnergy") ?? sum(inverters.map((r) => kwh(r, "gridSellTodayEnergy")))),
    houseKwh: round(kwh(src, "homeLoadEnergy") ?? sum(inverters.map((r) => kwh(r, "homeLoadTodayEnergy")))),
    batteryChargeKwh: round(sum(inverters.map((r) => kwh(r, "batteryTodayChargeEnergy")))),
    batteryDischargeKwh: round(sum(inverters.map((r) => kwh(r, "batteryTodayDischargeEnergy")))),
  };
  const updated = Math.max(0, ...inverters.map((r) => num(r.dataTimestamp) ?? 0)) || undefined;
  return {
    solarKw: round(solar === undefined ? undefined : Math.max(0, solar)),
    gridKw: round(grid),
    houseKw: round(house),
    batteryPct: round(batteryPct, 0),
    batteryKw: round(batteryKw),
    today: Object.values(today).some((v) => v !== undefined) ? today : undefined,
    updated,
    station,
  };
}

/** Everything for one plant (the first on the account when no id is given). */
export async function solisReading(c: SolisCreds, stationId?: string): Promise<SolarReading> {
  let station: SolisStation | undefined;
  if (!stationId) {
    const all = await solisStations(c);
    if (!all.length) throw new Error("Hittade ingen anläggning på kontot.");
    station = all[0];
    stationId = station.id;
  }
  const list = await solisPost<{ page?: { records?: Raw[] } }>(c, "/v1/api/inverterList", { stationId, pageNo: 1, pageSize: 20 });
  const records = list?.page?.records ?? [];
  if (!records.length) throw new Error("Anläggningen har ingen växelriktare i SolisCloud.");
  const inverters: Raw[] = [];
  for (const r of records) {
    // One at a time: SolisCloud allows only a couple of calls per second.
    inverters.push((await solisPost<Raw>(c, "/v1/api/inverterDetail", { id: String(r.id), sn: String(r.sn ?? "") })) ?? {});
  }
  const plant = await solisPost<Raw>(c, "/v1/api/stationDetail", { id: stationId }).catch(() => undefined);
  return toReading(inverters, plant, station ?? { id: stationId, name: String(plant?.stationName ?? plant?.sno ?? stationId) });
}
