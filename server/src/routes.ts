import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cached, invalidate } from "./cache.js";
import { lookupPostcode } from "./connectors/geo.js";
import { detectGroups, fetchIcs, filterEvents } from "./connectors/ics.js";
import { ha, haConnection } from "./connectors/ha.js";
import { geocode } from "./connectors/weather.js";
import { buildDashboard } from "./dashboard.js";
import { MULTIPLE, allMeta, findProvider, makeCtx, secretKey } from "./providers/registry.js";
import { calendarEvents, groceryIntegration } from "./sources.js";
import { getSecret, listSecretKeys, loadConfig, loadLocalList, saveConfig, saveLocalList, setSecret } from "./store.js";
import { addDays, hhmm, shortDate, shortWeekday, startOfDay } from "./time.js";
import type { Config, ConfigResponse, Integration, IntegrationCategory, SecretKey } from "./types.js";

export const VERSION = "0.1.0";
const ID = /^[a-z0-9-]{1,40}$/;
const SUPERVISOR_IP = "172.30.32.2";

function pinOk(req: FastifyRequest): boolean {
  // Inside the HA add-on, ingress requests arrive from the Supervisor and are already authenticated.
  if (process.env.SUPERVISOR_TOKEN && req.ip === SUPERVISOR_IP) return true;
  const pin = getSecret("admin.pin");
  if (!pin) return true;
  const given = String(req.headers["x-admin-pin"] ?? "");
  const a = Buffer.from(pin);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function guard(req: FastifyRequest, reply: FastifyReply) {
  if (!pinOk(req)) await reply.code(401).send({ error: "PIN krävs för inställningar." });
}

function fail(reply: FastifyReply, e: unknown, code = 400) {
  return reply.code(code).send({ error: (e as Error).message ?? String(e) });
}

// ---------- Validation ----------

const personSchema = z.object({
  id: z.string().regex(ID),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  kind: z.enum(["adult", "child"]),
  custody: z
    .object({
      mode: z.enum(["always", "oddWeeks", "evenWeeks", "alternating"]),
      anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      handoverDay: z.number().int().min(1).max(7).optional(),
    })
    .optional(),
});

const calendarSchema = z.object({
  id: z.string().regex(ID),
  name: z.string().min(1).max(60),
  provider: z.enum(["google", "icloud", "laget", "sportadmin", "outlook", "ics", "ha"]),
  kind: z.enum(["ics", "ha"]),
  entityId: z.string().optional(),
  personId: z.string().optional(),
  category: z.enum(["family", "sport", "school", "work", "other"]),
  include: z.array(z.string().max(60)).max(20).optional(),
  exclude: z.array(z.string().max(60)).max(20).optional(),
  visibility: z.enum(["custody", "always"]).optional(),
  alwaysShow: z.array(z.string().max(60)).max(20).optional(),
});

const integrationSchema = z.object({
  id: z.string().regex(ID),
  category: z.enum(["school", "grocery", "waste", "price"]),
  provider: z.string().max(40),
  settings: z.record(z.union([z.string().max(4000), z.number(), z.boolean()])),
  personMap: z.record(z.string()).optional(),
  personId: z.string().optional(),
});

const entity = z.string().max(120);
const configSchema = z
  .object({
    version: z.literal(1),
    setupComplete: z.boolean(),
    household: z.object({
      name: z.string().max(60),
      postcode: z.string().max(6).optional(),
      place: z.string().max(80).optional(),
      municipality: z.string().max(80).optional(),
      lat: z.number().optional(),
      lon: z.number().optional(),
    }),
    people: z.array(personSchema).max(12),
    calendars: z.array(calendarSchema).max(40),
    integrations: z.array(integrationSchema).max(20),
    shopping: z.object({
      source: z.enum(["local", "ha"]),
      entityId: entity.optional(),
      mappings: z.record(z.record(z.object({ code: z.string(), name: z.string() }))),
    }),
    electricity: z.object({
      cheapHours: z.number().int().min(1).max(8),
      markupOre: z.number().min(0).max(500),
      gridOre: z.number().min(0).max(500),
      taxOre: z.number().min(0).max(500),
      vat: z.boolean(),
    }),
    ha: z.object({ mode: z.enum(["none", "supervisor", "manual"]), url: z.string().url().optional() }),
    entities: z.object({
      cars: z.array(z.object({ name: z.string().max(40), battery: entity, range: entity.optional(), location: entity.optional(), charging: entity.optional() })).max(6),
      energy: z.object({ solar: entity.optional(), grid: entity.optional(), house: entity.optional(), battery: entity.optional() }),
      lights: z.array(z.object({ name: z.string().max(40), entityId: entity })).max(16),
      temps: z.array(z.object({ name: z.string().max(40), entityId: entity })).max(8),
      lightGroups: z.array(z.object({ name: z.string().max(40), entities: z.array(entity).max(40) })).max(12),
      buttons: z
        .array(z.object({ name: z.string().max(40), entityId: entity.regex(/^(scene|script|button|input_button|automation)\./), style: z.enum(["accent", "blue", "amber", "plain"]) }))
        .max(12),
      climates: z.array(z.object({ name: z.string().max(40), entityId: entity.regex(/^(climate|water_heater)\./) })).max(8),
      graphs: z
        .array(z.object({ title: z.string().max(40), series: z.array(z.object({ name: z.string().max(30), entityId: entity, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(6) }))
        .max(6),
    }),
    dashboard: z.object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      theme: z.enum(["auto", "dark", "light"]),
      nightFrom: z.string().regex(/^\d{2}:\d{2}$/),
      nightTo: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  })
  .superRefine((c, ctx) => {
    for (const i of c.integrations) {
      if (!findProvider(i.category as IntegrationCategory, i.provider)) ctx.addIssue({ code: "custom", message: `okänd leverantör ${i.provider}`, path: ["integrations"] });
    }
    for (const cat of ["grocery", "waste", "price"] as const) {
      if (c.integrations.filter((i) => i.category === cat).length > 1) ctx.addIssue({ code: "custom", message: `bara en ${cat} åt gången`, path: ["integrations"] });
    }
  });

function allowedSecret(k: string): k is SecretKey {
  return ["ha.token", "admin.pin"].includes(k) || /^calendar\.[a-z0-9-]{1,40}\.url$/.test(k) || /^int\.[a-z0-9-]{1,40}\.[a-zA-Z]{1,30}$/.test(k);
}

/** Secrets that belong to provider fields marked secret – the only ones the browser may set. */
function isUserSecret(k: string, cfg: Config): boolean {
  const m = /^int\.([a-z0-9-]+)\.([a-zA-Z]+)$/.exec(k);
  if (!m) return allowedSecret(k);
  const integ = cfg.integrations.find((i) => i.id === m[1]);
  const provider = integ && findProvider(integ.category, integ.provider);
  return Boolean(provider?.meta.fields.some((f) => f.key === m[2] && f.secret));
}

function configResponse(): ConfigResponse {
  return {
    config: loadConfig(),
    secretsSet: listSecretKeys().filter((k) => !k.endsWith(".session")),
    providers: allMeta(),
    runtime: { supervisor: Boolean(process.env.SUPERVISOR_TOKEN), version: VERSION, pinRequired: Boolean(getSecret("admin.pin")) },
  };
}

const previewEvent = (e: { start: Date; allDay: boolean; title: string }) =>
  `${shortWeekday(e.start)} ${shortDate(e.start)}${e.allDay ? "" : ` ${hhmm(e.start)}`} · ${e.title}`;

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true, version: VERSION }));

  // ---------- Config ----------
  app.get("/api/config", async () => configResponse());

  app.post("/api/auth/check", async (req, reply) => (pinOk(req) ? { ok: true } : reply.code(401).send({ error: "Fel PIN" })));

  app.put("/api/config", { preHandler: guard }, async (req, reply) => {
    const body = req.body as { config: Config; secrets?: Record<string, string | null> };
    const parsed = configSchema.safeParse(body?.config);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(reply, new Error(`Ogiltiga inställningar: ${issue?.path.join(".")} ${issue?.message}`));
    }
    const prev = loadConfig();
    const next = parsed.data as unknown as Config;
    for (const [k, v] of Object.entries(body.secrets ?? {})) {
      if (!isUserSecret(k, next)) return fail(reply, new Error(`Okänd hemlighet ${k}`));
    }
    for (const [k, v] of Object.entries(body.secrets ?? {})) setSecret(k as SecretKey, v);

    // Clean up secrets of removed calendars and integrations; a new login drops the old session.
    const cals = new Set(next.calendars.map((c) => c.id));
    for (const c of prev.calendars) if (!cals.has(c.id)) setSecret(`calendar.${c.id}.url`, null);
    const ints = new Set(next.integrations.map((i) => i.id));
    for (const k of listSecretKeys()) {
      const m = /^int\.([a-z0-9-]+)\./.exec(k);
      if (m && !ints.has(m[1])) setSecret(k as SecretKey, null);
    }
    for (const k of Object.keys(body.secrets ?? {})) {
      const m = /^int\.([a-z0-9-]+)\.password$/.exec(k);
      if (m) setSecret(secretKey(m[1], "session"), null);
    }
    saveConfig(next);
    invalidate();
    return configResponse();
  });

  // ---------- Dashboard ----------
  app.get("/api/dashboard", async () => buildDashboard());

  // ---------- Providers ----------
  app.get("/api/providers", async () => allMeta());

  /**
   * Test a provider with the values typed in the wizard. Body: { integration, secrets }
   * where secrets holds fields typed but not yet saved (falls back to stored ones).
   */
  app.post("/api/providers/test", { preHandler: guard }, async (req, reply) => {
    const { integration, secrets } = (req.body ?? {}) as { integration?: Integration; secrets?: Record<string, string> };
    const parsed = integrationSchema.safeParse(integration);
    if (!parsed.success) return fail(reply, new Error("Ogiltig koppling"));
    const integ = parsed.data as Integration;
    const provider = findProvider(integ.category, integ.provider);
    if (!provider) return fail(reply, new Error("Okänd leverantör"));
    if (provider.meta.needsHa && !haConnection()) return fail(reply, new Error("Anslut Home Assistant först."));
    try {
      return await provider.test(makeCtx(integ, secrets ?? {}));
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/providers/multiple", async () => MULTIPLE);

  // ---------- Home Assistant ----------
  app.post("/api/test/ha", { preHandler: guard }, async (req, reply) => {
    const { url, token } = (req.body ?? {}) as { url?: string; token?: string };
    const conn = haConnection(url ? { url, token: token || getSecret("ha.token") } : undefined);
    if (!conn) return fail(reply, new Error("Ange adress och token till Home Assistant."));
    try {
      await ha.ping(conn);
      const states = await ha.states(conn);
      return { ok: true, message: `Ansluten – ${states.length} entiteter.` };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/ha/entities", { preHandler: guard }, async (req, reply) => {
    const conn = haConnection();
    if (!conn) return fail(reply, new Error("Home Assistant är inte anslutet."));
    const { domains } = req.query as { domains?: string };
    const want = (domains ?? "").split(",").filter(Boolean);
    try {
      const states = await ha.states(conn);
      return states
        .filter((s) => want.length === 0 || want.includes(s.entity_id.split(".")[0]))
        .map((s) => ({
          entityId: s.entity_id,
          name: s.attributes.friendly_name ?? s.entity_id,
          state: s.state,
          unit: s.attributes.unit_of_measurement,
          deviceClass: s.attributes.device_class as string | undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------- Calendars ----------
  app.post("/api/test/calendar", { preHandler: guard }, async (req, reply) => {
    const { url, entityId, sourceId, include, exclude } = (req.body ?? {}) as {
      url?: string;
      entityId?: string;
      sourceId?: string;
      include?: string[];
      exclude?: string[];
    };
    const from = startOfDay(new Date());
    const to = addDays(from, 45);
    try {
      let events;
      if (entityId) {
        const conn = haConnection();
        if (!conn) throw new Error("Home Assistant är inte anslutet.");
        events = await ha.calendarEvents(conn, entityId, from, to);
      } else if (url) {
        events = await fetchIcs(url, from, to);
      } else if (sourceId) {
        const src = loadConfig().calendars.find((c) => c.id === sourceId);
        if (!src) throw new Error("Okänd kalender");
        events = await calendarEvents(src, from, to);
      } else throw new Error("Klistra in en länk.");
      const shown = filterEvents(events, include, exclude);
      return {
        ok: true,
        message: `${shown.length} av ${events.length} händelser kommande 45 dagar visas.`,
        groups: detectGroups(events),
        preview: shown.slice(0, 6).map(previewEvent),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------- Places ----------
  app.get("/api/postcode", async (req, reply) => {
    const { q } = req.query as { q?: string };
    try {
      return await lookupPostcode(q ?? "");
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/geocode", async (req, reply) => {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) return [];
    try {
      return await geocode(q);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // ---------- Grocery: send the shopping list to a store ----------
  app.post("/api/grocery/preview", async (_req, reply) => {
    const cfg = loadConfig();
    const g = groceryIntegration(cfg);
    if (!g) return fail(reply, new Error("Ingen butik vald."));
    const dash = await buildDashboard();
    const remembered = cfg.shopping.mappings[g.provider.meta.id] ?? {};
    const ctx = makeCtx(g.integ);
    const lines = await Promise.all(
      dash.shopping.items
        .filter((i) => !i.done)
        .map(async (i) => ({
          item: i.name,
          remembered: remembered[i.name.trim().toLowerCase()] ?? null,
          candidates: await g.provider.search(ctx, i.name).catch(() => []),
        })),
    );
    return { store: g.provider.meta.name, lines };
  });

  app.post("/api/grocery/send", async (req, reply) => {
    const { lines } = (req.body ?? {}) as { lines?: { item: string; code: string; name: string; qty?: number }[] };
    if (!lines?.length) return fail(reply, new Error("Inget att skicka."));
    const cfg = loadConfig();
    const g = groceryIntegration(cfg);
    if (!g) return fail(reply, new Error("Ingen butik vald."));
    try {
      const result = await g.provider.addToCart(
        makeCtx(g.integ),
        lines.map((l) => ({ code: l.code, qty: Math.max(1, Math.min(20, Math.round(l.qty ?? 1))) })),
      );
      const map = (cfg.shopping.mappings[g.provider.meta.id] ??= {});
      for (const l of lines) map[l.item.trim().toLowerCase()] = { code: l.code, name: l.name };
      saveConfig(cfg);
      return { ok: true, store: g.provider.meta.name, ...result };
    } catch (e) {
      return fail(reply, e, 502);
    }
  });

  // ---------- Actions from the board ----------
  app.post("/api/lights/toggle", async (req, reply) => {
    const { entityId } = (req.body ?? {}) as { entityId?: string };
    const cfg = loadConfig();
    if (!entityId || !cfg.entities.lights.some((l) => l.entityId === entityId)) return fail(reply, new Error("Okänd lampa"));
    const conn = haConnection();
    if (!conn) return fail(reply, new Error("Home Assistant är inte anslutet."));
    await ha.service(conn, "homeassistant", "toggle", { entity_id: entityId });
    invalidate("ha:states");
    return { ok: true };
  });

  app.post("/api/lights/off", async (_req, reply) => {
    const cfg = loadConfig();
    const conn = haConnection();
    if (!conn) return fail(reply, new Error("Home Assistant är inte anslutet."));
    if (cfg.entities.lights.length) {
      await ha.service(conn, "homeassistant", "turn_off", { entity_id: cfg.entities.lights.map((l) => l.entityId) });
    }
    invalidate("ha:states");
    return { ok: true };
  });

  app.post("/api/lights/group", async (req, reply) => {
    const { index, on } = (req.body ?? {}) as { index?: number; on?: boolean };
    const group = loadConfig().entities.lightGroups?.[Number(index)];
    const conn = haConnection();
    if (!group || !conn) return fail(reply, new Error(group ? "Home Assistant är inte anslutet." : "Okänd grupp"));
    if (group.entities.length) {
      await ha.service(conn, "homeassistant", on ? "turn_on" : "turn_off", { entity_id: group.entities });
    }
    invalidate("ha:states");
    return { ok: true };
  });

  app.post("/api/button", async (req, reply) => {
    const { entityId } = (req.body ?? {}) as { entityId?: string };
    const btn = loadConfig().entities.buttons?.find((b) => b.entityId === entityId);
    const conn = haConnection();
    if (!btn || !conn) return fail(reply, new Error(btn ? "Home Assistant är inte anslutet." : "Okänd knapp"));
    const domain = btn.entityId.split(".")[0];
    const service = domain === "button" || domain === "input_button" ? "press" : domain === "automation" ? "trigger" : "turn_on";
    await ha.service(conn, domain, service, { entity_id: btn.entityId });
    invalidate("ha:states");
    return { ok: true };
  });

  app.post("/api/climate/mode", async (req, reply) => {
    const { entityId, field, value } = (req.body ?? {}) as { entityId?: string; field?: string; value?: string };
    const known = loadConfig().entities.climates?.some((c) => c.entityId === entityId);
    const conn = haConnection();
    if (!known || !conn || !entityId || !value) return fail(reply, new Error("Okänd enhet"));
    if (field === "operation_mode") await ha.service(conn, "water_heater", "set_operation_mode", { entity_id: entityId, operation_mode: value });
    else if (field === "preset_mode") await ha.service(conn, "climate", "set_preset_mode", { entity_id: entityId, preset_mode: value });
    else await ha.service(conn, "climate", "set_hvac_mode", { entity_id: entityId, hvac_mode: value });
    invalidate("ha:states");
    return { ok: true };
  });

  app.post("/api/climate/target", async (req, reply) => {
    const { entityId, temperature } = (req.body ?? {}) as { entityId?: string; temperature?: number };
    const known = loadConfig().entities.climates?.some((c) => c.entityId === entityId);
    const conn = haConnection();
    if (!known || !conn || !entityId || !Number.isFinite(temperature)) return fail(reply, new Error("Okänd enhet"));
    const domain = entityId.startsWith("water_heater.") ? "water_heater" : "climate";
    await ha.service(conn, domain, "set_temperature", { entity_id: entityId, temperature });
    invalidate("ha:states");
    return { ok: true };
  });

  app.get("/api/graph/:index", async (req, reply) => {
    const g = loadConfig().entities.graphs?.[Number((req.params as { index: string }).index)];
    const conn = haConnection();
    if (!g || !conn) return fail(reply, new Error(g ? "Home Assistant är inte anslutet." : "Okänd graf"));
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 3_600_000);
    try {
      const data = await cached(`graph:${(req.params as { index: string }).index}:${Math.floor(to.getTime() / 300_000)}`, 300_000, () =>
        ha.history(conn, g.series.map((s) => s.entityId), from, to, 30),
      );
      return {
        title: g.title,
        from: from.toISOString(),
        to: to.toISOString(),
        series: g.series.map((s) => ({ name: s.name, color: s.color, points: data[s.entityId] ?? [] })),
      };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post("/api/shopping/add", async (req, reply) => {
    const { name } = (req.body ?? {}) as { name?: string };
    const clean = name?.trim().slice(0, 80);
    if (!clean) return fail(reply, new Error("Skriv en vara."));
    const cfg = loadConfig();
    if (cfg.shopping.source === "ha" && cfg.shopping.entityId) {
      const conn = haConnection();
      if (!conn) return fail(reply, new Error("Home Assistant är inte anslutet."));
      await ha.service(conn, "todo", "add_item", { entity_id: cfg.shopping.entityId, item: clean });
      invalidate("todo:");
    } else {
      const list = loadLocalList();
      list.push({ id: Math.random().toString(36).slice(2, 10), name: clean, done: false });
      saveLocalList(list);
    }
    return { ok: true };
  });

  app.post("/api/shopping/toggle", async (req, reply) => {
    const { id, done } = (req.body ?? {}) as { id?: string; done?: boolean };
    if (!id) return fail(reply, new Error("Saknar id"));
    const cfg = loadConfig();
    if (cfg.shopping.source === "ha" && cfg.shopping.entityId) {
      const conn = haConnection();
      if (!conn) return fail(reply, new Error("Home Assistant är inte anslutet."));
      await ha.service(conn, "todo", "update_item", { entity_id: cfg.shopping.entityId, item: id, status: done ? "completed" : "needs_action" });
      invalidate("todo:");
    } else {
      saveLocalList(loadLocalList().map((i) => (i.id === id ? { ...i, done: Boolean(done) } : i)));
    }
    return { ok: true };
  });

  app.post("/api/shopping/clear-done", async () => {
    const cfg = loadConfig();
    if (cfg.shopping.source === "ha" && cfg.shopping.entityId) {
      const conn = haConnection();
      if (conn) await ha.service(conn, "todo", "remove_completed_items", { entity_id: cfg.shopping.entityId });
      invalidate("todo:");
    } else {
      saveLocalList(loadLocalList().filter((i) => !i.done));
    }
    return { ok: true };
  });
}
