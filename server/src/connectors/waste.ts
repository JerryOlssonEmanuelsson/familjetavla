import { fetchWithTimeout } from "../http.js";
import { isoWeek, startOfDay } from "../time.js";

/**
 * Swedish waste pickup schedules.
 *
 * Many municipalities run "EDP Future" (FutureWeb/SimpleWastePickup) behind their
 * "när töms mitt kärl"-pages. The provider list and API shape come from
 * Waste Collection Schedule (github.com/mampfes/hacs_waste_collection_schedule, MIT),
 * source edpevent_se.py and a few municipality-specific sources using the same API.
 * For any other provider: use an ICS link, or a Waste Collection Schedule calendar in HA.
 */
export const EDP_PROVIDERS: Record<string, { title: string; apiUrl: string }> = {
  boden: { title: "Boden", apiUrl: "https://edpmobile.boden.se/FutureWeb/SimpleWastePickup" },
  boras: { title: "Borås Energi och Miljö", apiUrl: "https://kundportal.borasem.se/EDPFutureWeb/SimpleWastePickup" },
  danderyd: { title: "Danderyd", apiUrl: "https://future.danderyd.se/Danderyd/EDPFutureweb/SimpleWastePickup" },
  falkenberg: { title: "Falkenberg (VIVAB)", apiUrl: "https://minasidor.vivab.info/FutureWebFalken/SimpleWastePickup" },
  gotland: { title: "Gotland", apiUrl: "https://edpfuture.gotland.se/FutureWeb/SimpleWastePickup" },
  "herrljunga-vargarda": { title: "Herrljunga & Vårgårda", apiUrl: "https://edpfuture.remondis.se/EDPFutureWeb/SimpleWastePickup" },
  june: { title: "June Avfall (Jönköping m.fl.)", apiUrl: "https://minasidor.juneavfall.se/FutureWebJuneBasic/SimpleWastePickup" },
  kiruna: { title: "Kiruna – Tekniska Verken", apiUrl: "https://kund.tekniskaverkenikiruna.se/FutureWebBasic/SimpleWastePickup" },
  "kretslopp-sydost": { title: "Kretslopp Sydost", apiUrl: "https://kundportal.kretsloppsydost.se/FutureWeb/SimpleWastePickup" },
  kungalv: { title: "Kungälv", apiUrl: "https://minasidor-va-avfall.kungalv.se/FutureWeb/SimpleWastePickup" },
  lerum: { title: "Lerum", apiUrl: "https://vatjanst.lerum.se/FutureWeb/SimpleWastePickup" },
  lidkoping: { title: "Lidköping", apiUrl: "https://futureweb.lidkoping.se/FutureWebBasic/SimpleWastePickup" },
  ljungby: { title: "Ljungby", apiUrl: "https://edpwebb.ljungby.se/FutureWeb/SimpleWastePickup" },
  lund: { title: "Lund", apiUrl: "https://eservice431601.lund.se/Lund/FutureWeb/SimpleWastePickup" },
  lycksele: { title: "Lycksele", apiUrl: "https://future.lycksele.se/FutureWeb/SimpleWastePickup" },
  mark: { title: "Marks kommun", apiUrl: "https://va-renhallning.mark.se/FutureWeb/SimpleWastePickup" },
  molndal: { title: "Mölndal", apiUrl: "https://future.molndal.se/FutureWeb/SimpleWastePickup" },
  nvoa: { title: "Nacka (NVOA)", apiUrl: "https://futureweb.nvoa.se/EDP/FutureWebBasic/SimpleWastePickup" },
  orebro: { title: "Örebro", apiUrl: "https://futureweb.orebro.se/FutureWeb/SimpleWastePickup" },
  orust: { title: "Orust", apiUrl: "https://va-renhallning-minasidor.orust.se/FutureWebBasic/SimpleWastePickup" },
  partille: { title: "Partille", apiUrl: "https://vatjanst.partille.se/FutureWeb/SimpleWastePickup" },
  roslagsvatten: { title: "Roslagsvatten (Österåker, Vaxholm m.fl.)", apiUrl: "https://edpmypage.roslagsvatten.se/FutureWebOS/SimpleWastePickup" },
  skelleftea: { title: "Skellefteå", apiUrl: "https://wwwtk2.skelleftea.se/FutureWeb/SimpleWastePickup" },
  ssam: { title: "SSAM (Växjö m.fl.)", apiUrl: "https://edpfuture.ssam.se/FutureWeb/SimpleWastePickup" },
  stenungsund: { title: "Stenungsund", apiUrl: "https://futureweb.stenungsund.se/FutureWebBasic/SimpleWastePickup" },
  uppsalavatten: { title: "Uppsala Vatten", apiUrl: "https://futureweb.uppsalavatten.se/Uppsala/FutureWeb/SimpleWastePickup" },
  vafab: { title: "Vafab Miljö (Västerås m.fl.)", apiUrl: "https://services.vafabmiljo.se/FutureWebVKFHus/SimpleWastePickup" },
  varberg: { title: "Varberg (VIVAB)", apiUrl: "https://minasidor.vivab.info/FutureWebVarberg/SimpleWastePickup" },
};

export interface Pickup {
  date: Date;
  type: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const monday = new Date(year, 0, 4 - (day - 1));
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

/** EDP returns "2026-10-20", "v43 Okt 2026", "Vecka 27" or "Okt 2026". */
export function parseEdpDate(raw: string, now = new Date()): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const week = /^v(?:ecka)?\s*(\d{1,2})(?:\s+\w+\s+(\d{4}))?/i.exec(s);
  if (week) {
    const w = Number(week[1]);
    let year = week[2] ? Number(week[2]) : now.getFullYear();
    if (!week[2] && w < isoWeek(now) - 26) year += 1;
    return mondayOfIsoWeek(year, w);
  }
  const month = /^([a-zåäö]{3})\w*\s+(\d{4})/i.exec(s);
  if (month && MONTHS[month[1].toLowerCase()]) return new Date(Number(month[2]), MONTHS[month[1].toLowerCase()] - 1, 1);
  return null;
}

function friendlyType(raw: string): string {
  const t = raw.trim();
  if (/^FNI1$/i.test(t)) return "Kärl 1";
  if (/^FNI2$/i.test(t)) return "Kärl 2";
  return t || "Sophämtning";
}

export interface EdpAddress {
  label: string;
  raw: unknown;
}

export async function edpSearch(apiUrl: string, address: string): Promise<string[]> {
  const url = `${apiUrl.replace(/\/+$/, "")}/SearchAdress?searchText=${encodeURIComponent(address)}`;
  const res = await fetchWithTimeout(url, { method: "POST", timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`Renhållaren svarade ${res.status}`);
  const data = (await res.json()) as { Succeeded?: boolean; Buildings?: string[] };
  if (!data.Succeeded) throw new Error("Renhållaren kunde inte söka just nu.");
  return data.Buildings ?? [];
}

export async function edpSchedule(apiUrl: string, building: string): Promise<Pickup[]> {
  const url = `${apiUrl.replace(/\/+$/, "")}/GetWastePickupSchedule?address=${encodeURIComponent(building)}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`Renhållaren svarade ${res.status}`);
  const data = (await res.json()) as {
    RhServices?: { WasteType?: string; NextWastePickup?: string; WastePickupFrequency?: string }[];
  };
  const today = startOfDay(new Date());
  const out: Pickup[] = [];
  for (const s of data.RhServices ?? []) {
    let raw = s.NextWastePickup ?? "";
    if (!raw && /v/i.test(s.WastePickupFrequency ?? "")) raw = s.WastePickupFrequency ?? "";
    const date = parseEdpDate(raw);
    if (!date || date < today) continue;
    out.push({ date, type: friendlyType(s.WasteType ?? "") });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Resolve a typed address to the provider's building string, then fetch the schedule. */
export async function edpByAddress(apiUrl: string, address: string): Promise<{ building: string; pickups: Pickup[] }> {
  const buildings = await edpSearch(apiUrl, address);
  if (buildings.length === 0) throw new Error(`Hittade ingen adress som matchar "${address}".`);
  const building = buildings[0];
  return { building, pickups: await edpSchedule(apiUrl, building) };
}
