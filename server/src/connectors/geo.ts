import { getJson } from "../http.js";
import { EDP_PROVIDERS } from "./waste.js";

export type ElArea = "SE1" | "SE2" | "SE3" | "SE4";

/**
 * Approximate electricity area from coordinates. Svenska kraftnät publishes the areas per
 * grid owner, not as an open postcode lookup, so this is a suggestion the user can change.
 * Calibrated against known towns: Piteå/Luleå SE1, Skellefteå/Söderhamn SE2,
 * Mora/Gävle/Varberg/Oskarshamn SE3, Falkenberg/Växjö/Kalmar SE4.
 */
export function guessArea(lat: number, lon: number): ElArea {
  if (lat >= 65.0 && (lon > 17.8 || lat > 65.7)) return "SE1";
  if (lat >= 61.6 || (lat >= 61.0 && lon > 15.5)) return "SE2";
  if (lat < 56.98) return "SE4";
  return "SE3";
}

export interface PostcodeInfo {
  postcode: string;
  place: string;
  municipality?: string;
  lat: number;
  lon: number;
  area: ElArea;
  /** EDP waste provider whose name matches the municipality, if any. */
  wasteProvider?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/s? kommun$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function matchWasteProvider(municipality?: string): string | undefined {
  if (!municipality) return undefined;
  const m = norm(municipality);
  for (const [id, p] of Object.entries(EDP_PROVIDERS)) {
    const title = norm(p.title);
    if (title === m || title.startsWith(`${m} `) || title.includes(`(${m}`) || title.split(/[ &(),]+/).includes(m)) return id;
  }
  return undefined;
}

/** Postcode → place via OpenStreetMap Nominatim (max ~1 request/s; only used in the wizard). */
export async function lookupPostcode(raw: string): Promise<PostcodeInfo> {
  const pnr = raw.replace(/\s+/g, "");
  if (!/^\d{5}$/.test(pnr)) throw new Error("Postnummer ska vara fem siffror.");
  type R = {
    lat: string;
    lon: string;
    address?: { municipality?: string; city?: string; town?: string; village?: string; suburb?: string; county?: string };
  }[];
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${pnr}&country=se&format=jsonv2&addressdetails=1&limit=1`;
  const [hit] = await getJson<R>(url, { headers: { "accept-language": "sv" } });
  if (!hit) throw new Error(`Hittade inte postnummer ${pnr.slice(0, 3)} ${pnr.slice(3)}.`);
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  const a = hit.address ?? {};
  const municipality = a.municipality;
  return {
    postcode: pnr,
    place: a.city ?? a.town ?? a.village ?? a.suburb ?? municipality?.replace(/s? kommun$/, "") ?? pnr,
    municipality,
    lat,
    lon,
    area: guessArea(lat, lon),
    wasteProvider: matchWasteProvider(municipality),
  };
}
