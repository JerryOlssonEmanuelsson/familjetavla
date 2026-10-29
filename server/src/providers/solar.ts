import { solisReading, solisStations, type SolarReading, type SolisCreds } from "../connectors/solis.js";
import type { ProviderCtx, SolarProvider } from "./types.js";

const fmt = (n: number) => n.toFixed(n < 10 ? 1 : 0).replace(".", ",");

const creds = (ctx: ProviderCtx): SolisCreds => ({
  url: ctx.str("url") || "https://www.soliscloud.com:13333",
  keyId: ctx.secret("keyId") ?? "",
  secret: ctx.secret("keySecret") ?? "",
});

/** Short lines for the "Testa" result in the guide. */
export function describeReading(r: SolarReading): string[] {
  const now: string[] = [];
  if (r.solarKw !== undefined) now.push(`Sol ${fmt(r.solarKw)} kW`);
  if (r.gridKw !== undefined) now.push(`${r.gridKw >= 0 ? "köper" : "säljer"} ${fmt(Math.abs(r.gridKw))} kW`);
  if (r.houseKw !== undefined) now.push(`huset ${fmt(r.houseKw)} kW`);
  const lines = [now.join(" · ") || "Inga effektvärden just nu"];
  if (r.batteryPct !== undefined) {
    const b = r.batteryKw;
    const what = b === undefined || Math.abs(b) < 0.02 ? "vilar" : b > 0 ? `laddar ${fmt(b)} kW` : `laddar ur ${fmt(-b)} kW`;
    lines.push(`Batteri ${r.batteryPct} % – ${what}`);
  }
  if (r.today?.solarKwh !== undefined) lines.push(`Idag: ${fmt(r.today.solarKwh)} kWh solel`);
  if (r.updated) lines.push(`Senast rapporterat ${new Date(r.updated).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}`);
  if (r.station) lines.push(`Anläggning: ${r.station.name}`);
  return lines;
}

export const solis: SolarProvider = {
  meta: {
    id: "solis",
    category: "solar",
    name: "Solis (SolisCloud)",
    description: "Solceller, hembatteri och köp/sälj direkt från SolisCloud – ingen Home Assistant behövs.",
    status: "experimental",
    fields: [
      { key: "keyId", label: "API-ID (KeyId)", type: "text", secret: true },
      { key: "keySecret", label: "Hemlig nyckel (KeySecret)", type: "password", secret: true },
      {
        key: "url",
        label: "API-adress",
        type: "url",
        optional: true,
        placeholder: "https://www.soliscloud.com:13333",
        help: "Står bredvid nyckeln i SolisCloud. Lämna tomt för standardadressen.",
      },
      { key: "stationId", label: "Anläggning", type: "text", optional: true, help: "Lämna tomt för den första anläggningen på kontot." },
    ],
    guide: [
      "Skicka ett serviceärende till Solis och be om API-åtkomst (om du inte redan har det).",
      "Logga in på soliscloud.com → Basic Settings → API Management → Activate.",
      "Tryck View Key, gör verifieringen och klistra in API-ID, hemlig nyckel och adressen här.",
      "SolisCloud uppdateras ungefär var femte minut, så tavlan ligger några minuter efter.",
    ],
  },

  async test(ctx) {
    const c = creds(ctx);
    const stationId = ctx.str("stationId");
    if (!stationId) {
      const stations = await solisStations(c);
      if (!stations.length) throw new Error("Nyckeln fungerar, men kontot har ingen anläggning.");
      if (stations.length > 1) {
        return {
          ok: true,
          message: "Kontot har flera anläggningar – välj vilken tavlan ska visa.",
          choices: { field: "stationId", options: stations.map((s) => ({ value: s.id, label: s.name })) },
        };
      }
    }
    return { ok: true, preview: describeReading(await solisReading(c, stationId || undefined)) };
  },

  async fetch(ctx) {
    return solisReading(creds(ctx), ctx.str("stationId") || undefined);
  },
};
