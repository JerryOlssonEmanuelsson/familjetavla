/**
 * MALL / TEMPLATE – a data source (here: waste pickup) that is NOT registered.
 * Copy this file, rename it, fill in the fetch, and add it to PROVIDERS in registry.ts.
 * See CONTRIBUTING.md. The same pattern works for school, grocery and electricity price –
 * only the `fetch` shape differs (see the interfaces in types.ts).
 */
import { getJson } from "../http.js";
import type { WasteProvider } from "./types.js";

/** What the service answers – describe only the fields you use. */
interface ApiPickup {
  date: string; // "2026-10-22"
  bin: string; // "Matavfall"
}

export const exampleWaste: WasteProvider = {
  meta: {
    id: "example-waste", // unique, never change once released (it is stored in people's settings)
    category: "waste",
    name: "Exempelkommun",
    description: "Hämtdagar från Exempelkommuns webb.",
    status: "experimental", // "beta" once someone has tested it in their own home, "stable" when it has run a while
    // The setup guide draws its form and the "Testa" button from these fields.
    fields: [
      { key: "address", label: "Adress", type: "text", placeholder: "Storgatan 1" },
      // secret: true → stored encrypted, never sent back to the browser (use for passwords and private links)
      { key: "token", label: "Kundnummer", type: "text", secret: true, optional: true },
    ],
    guide: ["Kundnumret står på fakturan från renhållaren."],
  },

  /** Runs when the user taps "Testa" in the guide: throw an Error with a clear Swedish message on failure. */
  async test(ctx) {
    const pickups = await this.fetch(ctx);
    if (!pickups.length) throw new Error("Hittade inga hämtdagar för adressen.");
    return { ok: true, preview: pickups.slice(0, 4).map((p) => `${p.date.toLocaleDateString("sv-SE")} ${p.type}`) };
  },

  /** Called by the board (results are cached). Return the next weeks' pickups. */
  async fetch(ctx) {
    const address = ctx.str("address");
    if (!address) return [];
    const rows = await getJson<ApiPickup[]>(`https://example.invalid/api/pickups?address=${encodeURIComponent(address)}`);
    return rows.map((r) => ({ date: new Date(`${r.date}T00:00`), type: r.bin }));
  },
};
