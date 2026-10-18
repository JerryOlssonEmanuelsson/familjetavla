import { AXFOOD_SITES, AuthExpired, axfoodAddToCart, axfoodLogin, axfoodSearch } from "../connectors/axfood.js";
import type { GroceryProvider, ProviderCtx } from "./types.js";

function axfoodProvider(id: "willys" | "hemkop", status: "beta" | "experimental"): GroceryProvider {
  const site = AXFOOD_SITES[id];

  async function session(ctx: ProviderCtx, force = false): Promise<string> {
    const existing = ctx.secret("session");
    if (existing && !force) return existing;
    const username = ctx.str("username");
    const password = ctx.secret("password");
    if (!username || !password) throw new Error(`${site.label} är inte inställt.`);
    const cookies = await axfoodLogin(site, username, password);
    ctx.remember("session", cookies);
    return cookies;
  }

  return {
    meta: {
      id,
      category: "grocery",
      name: site.label,
      description: `Skicka inköpslistan till varukorgen på ${site.base.replace("https://www.", "")}. Du väljer produkt första gången, sedan kommer den ihåg.`,
      status,
      fields: [
        { key: "username", label: "Personnummer eller kundkortsnummer", type: "text", placeholder: "ÅÅMMDDXXXX", help: "10 eller 12 siffror, eller 16 siffror för kundkort. E-post fungerar inte." },
        { key: "password", label: "Lösenord", type: "password", secret: true, help: "Kontot behöver ett lösenord – BankID går inte att automatisera." },
      ],
      guide: [
        "Inloggningen görs av en dold webbläsare på servern, precis som när du loggar in själv.",
        "Varorna läggs i varukorgen – du väljer tid och betalar själv i appen.",
        "Inofficiell koppling: kan sluta fungera om butiken ändrar sin webb.",
      ],
    },
    async test(ctx) {
      await session(ctx, true);
      return { ok: true, message: `Inloggad hos ${site.label}.` };
    },
    async search(ctx, query) {
      // Search works anonymously; with a session the prices match the user's own store.
      return axfoodSearch(site, ctx.secret("session") ?? "", query);
    },
    async addToCart(ctx, lines) {
      try {
        return await axfoodAddToCart(site, await session(ctx), lines);
      } catch (e) {
        if (e instanceof AuthExpired) return axfoodAddToCart(site, await session(ctx, true), lines);
        throw e;
      }
    },
  };
}

export const willys = axfoodProvider("willys", "beta");
export const hemkop = axfoodProvider("hemkop", "experimental");
