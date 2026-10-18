// Demo mode (VITE_DEMO=1): the whole app runs in the browser on recorded sample data.
// Every button works against this in-memory copy; nothing leaves the page.
import type { Config, ConfigResponse, Dashboard, Integration, Schedule, TestResult } from "../../../server/src/types";
import type { CalendarTest, CarDetails, Discovery, EntityOption, GraphData, GroceryLine, PostcodeInfo } from "../api";
import fixtures from "./fixtures.json";

const fx = structuredClone(fixtures) as unknown as {
  config: ConfigResponse;
  dashboard: Dashboard;
  cars: CarDetails[];
  graphs: GraphData[];
  discover: Discovery;
  entities: EntityOption[];
  calendarTest: CalendarTest;
};

const wait = <T>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const d = fx.dashboard;

function recountGroups() {
  const cfg = fx.config.config;
  d.lightGroups = d.lightGroups.map((g) => {
    const ids = cfg.entities.lightGroups[g.index]?.entities ?? [];
    const on = ids.filter((id) => d.lights.find((l) => l.entityId === id)?.on ?? groupState.get(id) ?? false).length;
    return { ...g, on };
  });
}
const groupState = new Map<string, boolean>([
  ["light.kok_bank", true],
  ["light.fonster_vardagsrum", true],
]);

function syncDayParts() {
  d.daypart = new Date().getHours() >= 7 && new Date().getHours() < 19 ? "day" : "night";
  d.night = false;
}

const providerTest = (i: Integration): TestResult => {
  switch (i.provider) {
    case "vklass":
      return { ok: true, message: "Inloggad. Hittade 2 barn.", discovered: ["Ella Demo", "Leo Demo"], preview: ["Leo Demo · Måndag: Fiskgratäng med potatis"] };
    case "skolmaten":
    case "skolmat-ha":
      return { ok: true, preview: ["Måndag 19/10: Fiskgratäng med potatis", "Tisdag 20/10: Kycklinggryta med ris", "Onsdag 21/10: Pannkakor med sylt"] };
    case "school-ics":
      return { ok: true, message: "24 händelser kommande tre veckor.", preview: ["Tis 20 okt 08:10 · Idrott", "Tor 22 okt 08:10 · Idrott"] };
    case "edp":
      if (!i.settings.building)
        return {
          ok: true,
          message: "Hittade 2 adresser – välj din och testa igen.",
          choices: { field: "building", options: ["STORGATAN 1, DEMOSTAD", "STORGATAN 1 B, DEMOSTAD"].map((v) => ({ value: v, label: v })) },
        };
      return { ok: true, message: "Hämtdagar hittade.", preview: ["Tis 20 okt · Matavfall, Kärl 140L", "Fre 23 okt · Restavfall, Kärl 190L"] };
    case "manual":
      return { ok: true, preview: ["Tis 20 okt · Matavfall", "Tis 3 nov · Matavfall"] };
    case "willys":
    case "hemkop":
      return { ok: true, message: `Inloggad hos ${i.provider === "willys" ? "Willys" : "Hemköp"} (demo).` };
    case "spot":
      return { ok: true, preview: [`24 timmar · lägst 0,10 kr · högst 1,35 kr (spot) · ${i.settings.area ?? "SE3"}`] };
    default:
      return { ok: true, preview: ["Demo: allt ser bra ut"] };
  }
};

const CANDIDATES: Record<string, GroceryLine["candidates"]> = {
  mjölk: [
    { code: "101233933_ST", name: "Mellanmjölk 1,5%", brand: "Garant", volume: "1.5l", price: "17,90 kr" },
    { code: "101233934_ST", name: "Standardmjölk 3%", brand: "Arla", volume: "1.5l", price: "21,50 kr" },
  ],
  bananer: [{ code: "101205823_KG", name: "Bananer", brand: "Eko", volume: "ca 1kg", price: "24,90 kr/kg" }],
  tacoskal: [{ code: "100181519_ST", name: "Taco Shells 12-p", brand: "Santa Maria", volume: "135g", price: "26,90 kr" }],
  ost: [{ code: "101178452_ST", name: "Hushållsost 26%", brand: "Garant", volume: "1.1kg", price: "89,90 kr" }],
};

export const demoApi = {
  config: () => wait(fx.config),
  saveConfig: (config: Config, _secrets: Record<string, string | null> = {}) => {
    fx.config.config = config;
    d.home = config.dashboard.home;
    d.tabs = config.dashboard.tabs;
    d.theme = config.dashboard.theme;
    return wait(fx.config, 300);
  },
  checkPin: () => wait({ ok: true }),
  dashboard: () => {
    syncDayParts();
    return wait(d, 120);
  },

  testProvider: (integration: Integration, _secrets: Record<string, string>) => wait(providerTest(integration), 700),
  testHa: (_url?: string, _token?: string) => wait<TestResult>({ ok: true, message: "Ansluten – 40 entiteter (demo)." }, 500),
  entities: (domains: string[]) => wait(fx.entities.filter((e) => !domains.length || domains.includes(e.entityId.split(".")[0]))),
  testCalendar: (body: { include?: string[]; exclude?: string[] }) => {
    const r = structuredClone(fx.calendarTest);
    if (body.include?.length) {
      const inc = body.include.map((x) => x.toLowerCase());
      r.preview = (r.preview ?? []).filter((p) => inc.some((t) => p.toLowerCase().includes(t)));
      r.message = `${r.preview.length * 2} av 17 händelser kommande 45 dagar visas.`;
    }
    return wait(r, 500);
  },
  postcode: (q: string) =>
    wait<PostcodeInfo>({ postcode: q.replace(/\s/g, ""), place: "Lund", municipality: "Lunds kommun", lat: 55.7, lon: 13.19, area: "SE4", wasteProvider: "lund" }, 500),

  groceryPreview: () =>
    wait(
      {
        store: "Willys",
        lines: d.shopping.items
          .filter((i) => !i.done)
          .map((i) => ({ item: i.name, remembered: null, candidates: CANDIDATES[i.name.toLowerCase()] ?? [{ code: `demo_${i.id}`, name: i.name, price: "–" }] })),
      },
      700,
    ),
  grocerySend: (lines: { item: string; code: string; name: string; qty: number }[]) =>
    wait({ ok: true, store: "Willys", items: lines.reduce((s, l) => s + l.qty, 0), total: `${(lines.length * 23.4).toFixed(2).replace(".", ",")} kr` }, 900),

  discover: () => wait(fx.discover, 900),
  car: (index: number) => wait(fx.cars[index]),
  carAction: (index: number, entityId: string, action: "on" | "off" | "press") => {
    const a = fx.cars[index].actions.find((x) => x.entityId === entityId);
    if (a && a.domain !== "button") a.state = a.domain === "lock" ? (action === "off" ? "unlocked" : "locked") : action === "off" ? "off" : "on";
    return wait({});
  },
  run: (entityId: string, action: "on" | "off" | "press" = "on") => {
    for (const c of d.cars) if (c.climate?.entityId === entityId) c.climate.on = action !== "off";
    return wait({});
  },
  saveSchedule: (s: Schedule) => {
    for (const c of d.cars) {
      if (c.climate?.entityId !== s.entityId) continue;
      c.schedules = [...c.schedules.filter((x) => x.id !== s.id), { id: s.id, name: s.name, days: s.days, time: s.time, enabled: s.enabled }].sort((a, b) =>
        a.time.localeCompare(b.time),
      );
    }
    return wait({});
  },
  deleteSchedule: (id: string) => {
    for (const c of d.cars) c.schedules = c.schedules.filter((s) => s.id !== id);
    return wait({});
  },
  control: (entityId: string, op: "toggle" | "select" | "set" | "press", value?: string | number) => {
    for (const c of [...d.deviceCards.flatMap((x) => x.controls), ...d.climates.flatMap((x) => x.controls)]) {
      if (c.entityId !== entityId) continue;
      if (op === "toggle") c.on = !c.on;
      if (op === "select" || op === "set") c.state = String(value);
    }
    return wait({});
  },
  climateMode: (entityId: string, _field: string, value: string) => {
    const c = d.climates.find((x) => x.entityId === entityId);
    if (c) c.active = value;
    return wait({});
  },
  climateTarget: (entityId: string, temperature: number) => {
    const c = d.climates.find((x) => x.entityId === entityId);
    if (c) c.target = temperature;
    return wait({});
  },
  lightGroup: (index: number, on: boolean) => {
    const ids = fx.config.config.entities.lightGroups[index]?.entities ?? [];
    for (const id of ids) {
      const l = d.lights.find((x) => x.entityId === id);
      if (l && !l.offline) l.on = on;
      else if (!l) groupState.set(id, on);
    }
    recountGroups();
    return wait({});
  },
  button: (_entityId: string) => {
    for (const l of d.lights) if (l.name !== "Ute") l.on = false;
    for (const k of groupState.keys()) groupState.set(k, false);
    recountGroups();
    return wait({});
  },
  graph: (index: number) => wait(fx.graphs[index]),
  toggleLight: (entityId: string) => {
    const l = d.lights.find((x) => x.entityId === entityId);
    if (l) l.on = !l.on;
    recountGroups();
    return wait({});
  },
  lightsOff: () => {
    for (const l of d.lights) l.on = false;
    recountGroups();
    return wait({});
  },
  addItem: (name: string) => {
    d.shopping.items.push({ id: String(Date.now()), name, done: false });
    return wait({});
  },
  toggleItem: (id: string, done: boolean) => {
    d.shopping.items = d.shopping.items.map((i) => (i.id === id ? { ...i, done } : i));
    return wait({});
  },
  clearDone: () => {
    d.shopping.items = d.shopping.items.filter((i) => !i.done);
    return wait({});
  },
};
