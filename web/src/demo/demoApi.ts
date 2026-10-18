// Demo mode (VITE_DEMO=1): the whole app runs in the browser on recorded sample data.
// Every button works against this in-memory copy; nothing leaves the page.
import type { Config, ConfigResponse, DashEvent, Dashboard, Integration, Schedule, TestResult, TravelChoice, TravelLeg } from "../../../server/src/types";
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

// "#forsta" opens the demo as a brand-new install: empty settings, the wizard from step one.
const firstRun = typeof location !== "undefined" && location.hash === "#forsta";
if (firstRun) {
  const c = fx.config.config;
  fx.config.config = {
    ...c,
    setupComplete: false,
    household: { name: "" },
    people: [],
    calendars: [],
    integrations: [{ id: "price", category: "price", provider: "spot", settings: { area: "SE3" } }],
    shopping: { source: "local", mappings: {} },
    electricity: { cheapHours: 4, markupOre: 0, gridOre: 0, taxOre: 0, vat: false },
    ha: { mode: "none" },
    schedules: [],
    entities: { cars: [], energy: {}, lights: [], temps: [], lightGroups: [], buttons: [], climates: [], deviceCards: [], graphs: [] },
  };
  fx.config.secretsSet = [];
  history.replaceState(null, "", location.pathname);
}

const wait = <T>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const d = fx.dashboard;

// ---- A mixed family like the one we build for: two children every other week (Ella, Leo) and
// two at home all the time (Maja on förskola with drop-off/pick-up, Nils). Added on top of the
// recorded data so the demo shows care days, a planning day and "Hos oss". ----
{
  const c = fx.config.config;
  c.people = [
    ...c.people.slice(0, 1),
    { id: "anna", name: "Anna", color: "#ff8fa3", kind: "adult" },
    ...c.people.slice(1),
    {
      id: "maja",
      name: "Maja",
      color: "#34e0a1",
      kind: "child",
      custody: { mode: "always" },
      care: { name: "Förskola", days: { "1": "07:30-16:00", "2": "07:30-16:00", "3": "07:30-16:00", "4": "07:30-16:00", "5": "08:00-15:00" }, travel: { to: { mode: "adult:emil" }, home: { mode: "adult:anna" } } },
    },
    { id: "nils", name: "Nils", color: "#ff9f5a", kind: "child", custody: { mode: "always" } },
  ];
  const dd = fx.dashboard;
  dd.people = [
    dd.people[0],
    { name: "Anna", color: "#ff8fa3", initial: "A", home: true, kind: "adult" },
    ...dd.people.slice(1),
    { name: "Maja", color: "#34e0a1", initial: "M", home: true, kind: "child" },
    { name: "Nils", color: "#ff9f5a", initial: "N", home: true, kind: "child" },
  ];
  dd.legend = [dd.legend[0], { name: "Anna", color: "#ff8fa3" }, ...dd.legend.slice(1, 3), { name: "Maja", color: "#34e0a1" }, { name: "Nils", color: "#ff9f5a" }, ...dd.legend.slice(3)];
  const careTravel = {
    key: "care:maja@care@2026-10-19",
    calendarId: "care:maja",
    calendarName: "Förskola",
    to: { mode: "adult:emil" as const, label: "Emil" },
    home: { mode: "adult:anna" as const, label: "Anna" },
    fromCalendar: true,
    kind: "care" as const,
  };
  dd.now.items.push({
    time: "07:30",
    end: "16:00",
    title: "Lämning · Förskola",
    color: "#34e0a1",
    who: "Maja",
    initial: "M",
    category: "school",
    icon: "school",
    travel: careTravel,
    inMinutes: 0,
    dayLabel: "imorgon",
  });
  dd.reminders.splice(2, 0, { icon: "kids", title: "Maja · förskola imorgon 07:30–16:00", sub: "Emil lämnar · Anna hämtar", tone: "green" });
  dd.reminders.splice(1, 0, { icon: "school", title: "Maja · Planeringsdag – förskolan stängd fre 23 okt", sub: "Om 5 dagar – ordna barnomsorg", tone: "amber" });
  dd.reminders = dd.reminders.map((r) => (r.icon === "kids" && r.sub === "Barnvecka börjar" ? { ...r, sub: "Byte" } : r));
  if (dd.custody) dd.custody.sub = "Byte mån 19 okt · v43";
  const fri = dd.days.find((x) => x.key === "2026-10-23");
  fri?.events.unshift({ time: "", title: "Planeringsdag – förskolan stängd", color: "#34e0a1", who: "Maja", initial: "M", category: "school", icon: "school" });
}

// ---- Dit/hem in the demo: the same rules as server/src/travel.ts, on the recorded events ----
d.travelOptions = [
  { mode: "adult:emil", label: "Emil skjutsar" },
  { mode: "adult:anna", label: "Anna skjutsar" },
  { mode: "ride", label: "Blir skjutsad" },
  { mode: "bus", label: "Buss" },
  { mode: "self", label: "Cyklar/går" },
];
const demoCal = (title: string) => (title.startsWith("F14") ? { id: "ella-sport", name: "Fotboll F14" } : { id: "leo-sim", name: "Simning" });
const savedTravel: Record<string, TravelChoice> = {
  "ella-sport@2026-10-19T17:30": { to: { mode: "adult:emil" }, home: { mode: "ride", by: "Saras pappa" } },
};
const calTravel: Record<string, TravelChoice> = { "leo-sim": { to: { mode: "bus" }, home: { mode: "adult:emil" } } };
const legLabel = (l: TravelLeg) =>
  l.mode === "bus" ? "Buss" : l.mode === "self" ? "Cyklar/går" : l.mode === "ride" ? (l.by ? `Skjuts med ${l.by}` : "Blir skjutsad") : l.mode === "adult:anna" ? "Anna skjutsar" : "Emil skjutsar";
function decorate(e: DashEvent, dayKey: string) {
  if (e.category !== "sport" || !e.time) return;
  const cal = demoCal(e.title);
  const key = `${cal.id}@${dayKey}T${e.time}`;
  const own = savedTravel[key];
  const c = own ?? calTravel[cal.id] ?? {};
  const fmt = (l?: TravelLeg) => (l ? { ...l, label: legLabel(l) } : undefined);
  e.travel = { key, calendarId: cal.id, calendarName: cal.name, to: fmt(c.to), home: fmt(c.home), fromCalendar: !own && Boolean(calTravel[cal.id]) };
}
function summary(e: DashEvent) {
  const t = e.travel;
  if (!t || (!t.to && !t.home)) return "";
  if (t.to && t.home && t.to.label === t.home.label) return `${t.to.label} dit och hem`;
  const low = (x: string) => (/^(Emil|Anna)/.test(x) ? x : x[0].toLowerCase() + x.slice(1));
  return [t.to && `${t.to.label} dit`, t.home && `${low(t.home.label)} hem`].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase());
}
function syncTravel() {
  for (const day of d.days) for (const e of day.events) decorate(e, day.key);
  const tomorrow = d.days[1]?.key ?? "";
  for (const e of d.now.items) decorate(e, e.dayLabel === "imorgon" ? tomorrow : d.days[0].key);
  for (const r of d.reminders) {
    if (r.icon !== "bag") continue;
    const ev = d.days[1]?.events.find((e) => r.title.includes(e.title));
    const s = ev ? summary(ev) : "";
    r.sub = s ? `Packa väskan · ${s}` : "Packa väskan · tryck i kalendern för att välja skjuts";
  }
}

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
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  d.daypart = h >= 7 && h < 19 ? "day" : "night";
  d.header.phase = h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 17.5 ? "day" : h >= 17.5 && h < 21 ? "dusk" : "night";
  d.night = false;
  syncNow();
}

/** Recompute the Nu-zon from the viewer's clock so "Om 45 min" is always true in the demo. */
const baseNow = structuredClone(fx.dashboard.now);
function syncNow() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const at = (t: string, day: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m + (day === "imorgon" ? 1440 : 0) - mins;
  };
  const items = baseNow.items
    .map((e) => ({ ...e, inMinutes: at(e.time, e.dayLabel) }))
    .filter((e) => e.inMinutes > -60)
    .sort((a, b) => a.inMinutes - b.inMinutes)
    .slice(0, 3);
  const first = items[0];
  let headline = "Inget mer inplanerat idag";
  if (first) {
    const m = first.inMinutes;
    if (m <= 0) headline = `Pågår: ${first.title}`;
    else if (m < 60) headline = `Om ${m} min`;
    else if (m < 180) headline = `Om ${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
    else headline = first.dayLabel === "idag" ? `Senare idag kl ${first.time}` : `Imorgon kl ${first.time}`;
  }
  d.now = { headline, items };
  syncTravel();
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
  authStatus: () => wait({ paired: true, pinRequired: false, supervisor: false }),
  pair: (_pin: string, _name: string) => wait({ ok: true as const }),
  forgetDevices: () => wait({ ok: true as const }),
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
  photos: () => wait(d.idle.photos),
  uploadPhoto: (_data: string, _type: string) => wait({ photos: d.idle.photos }),
  deletePhoto: (_name: string) => wait({ photos: d.idle.photos }),
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
  travel: (key: string, choice: TravelChoice | null, forCalendar = false) => {
    if (key.startsWith("care:")) {
      // Förskola in the demo: update the drop-off item and the reminder.
      const name = (l?: TravelLeg) => (!l ? undefined : l.mode === "adult:anna" ? "Anna" : l.mode === "adult:emil" ? "Emil" : l.by || "Någon annan");
      for (const e of [...baseNow.items, ...d.now.items]) {
        if (e.travel?.key !== key) continue;
        e.travel = { ...e.travel, to: choice?.to && { ...choice.to, label: name(choice.to)! }, home: choice?.home && { ...choice.home, label: name(choice.home)! }, fromCalendar: forCalendar };
      }
      const r = d.reminders.find((x) => x.title.startsWith("Maja · förskola"));
      if (r) r.sub = [choice?.to && `${name(choice.to)} lämnar`, choice?.home && `${name(choice.home)} hämtar`].filter(Boolean).join(" · ") || "Vem lämnar och hämtar? Tryck på lämningen i Nu";
      return wait({ ok: true as const }, 150);
    }
    if (forCalendar) {
      const calId = key.slice(0, key.lastIndexOf("@"));
      if (choice) calTravel[calId] = choice;
      else delete calTravel[calId];
      delete savedTravel[key];
    } else if (choice && (choice.to || choice.home)) savedTravel[key] = choice;
    else delete savedTravel[key];
    syncTravel();
    return wait({ ok: true as const }, 150);
  },
};
