import { cached } from "./cache.js";
import { cheapestBlock, priceLevel, type HourPrice } from "./connectors/elpris.js";
import { ha, haConnection, type HaState } from "./connectors/ha.js";
import { forecast, rainBetween, weatherSummary, type Forecast } from "./connectors/weather.js";
import { custodyStatus, isHome } from "./custody.js";
import {
  collectCalendars,
  collectPrices,
  collectSchool,
  collectWaste,
  groceryIntegration,
  hasPriceExtras,
  totalPrice,
  type SourceError,
  type SourcedEvent,
} from "./sources.js";
import { loadConfig, loadLocalList } from "./store.js";
import {
  addDays,
  daysBetween,
  dayKey,
  hhmm,
  inTimeWindow,
  isoWeek,
  longDate,
  relativeDay,
  shortDate,
  shortWeekday,
  startOfDay,
} from "./time.js";
import type { Config, DashDay, DashEvent, Dashboard, Person, Reminder } from "./types.js";

const MIN = 60_000;
const WASTE_COLOR = "#9aa0bf";
const FAMILY_COLOR = "#34e0a1";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/** Child-owned calendars (sport, school…) only show on days the child is here. */
export function visibleOn(ev: SourcedEvent, people: Map<string, Person>, day: Date): boolean {
  if (!ev.personId || ev.ignoreCustody) return true;
  const p = people.get(ev.personId);
  if (!p || p.kind !== "child") return true;
  return isHome(p.custody, day);
}

function eventsOnDay(events: SourcedEvent[], day: Date): SourcedEvent[] {
  const s = startOfDay(day).getTime();
  const e = addDays(startOfDay(day), 1).getTime();
  return events.filter((ev) => ev.start.getTime() < e && ev.end.getTime() > s && !(ev.allDay && ev.end.getTime() === s));
}

function toDash(ev: SourcedEvent, people: Map<string, Person>): DashEvent {
  const p = ev.personId ? people.get(ev.personId) : undefined;
  return {
    time: ev.allDay ? "" : hhmm(ev.start),
    title: ev.title,
    color: p?.color ?? FAMILY_COLOR,
    who: p?.name ?? "",
    category: ev.category,
  };
}

function haValue(states: Map<string, HaState>, id?: string): string | undefined {
  if (!id) return undefined;
  const s = states.get(id);
  if (!s || s.state === "unavailable" || s.state === "unknown") return undefined;
  return s.state;
}

function formatTemp(states: Map<string, HaState>, id: string): string {
  const v = haValue(states, id);
  if (v === undefined) return "–";
  const n = Number(v);
  const unit = String(states.get(id)?.attributes.unit_of_measurement ?? "°");
  return Number.isFinite(n) ? `${n.toFixed(1).replace(".", ",").replace(",0", "")}${unit === "°C" ? "°" : unit}` : v;
}

export async function buildDashboard(now = new Date()): Promise<Dashboard> {
  const cfg = loadConfig();
  const errors: SourceError[] = [];
  const today = startOfDay(now);
  const horizon = addDays(today, 7);
  const people = new Map(cfg.people.map((p) => [p.id, p]));
  const children = cfg.people.filter((p) => p.kind === "child");

  const conn = haConnection();
  const [calEvents, school, waste, weather, prices, states, shopping] = await Promise.all([
    collectCalendars(cfg, today, horizon, errors),
    collectSchool(cfg, today, horizon, errors),
    collectWaste(cfg, errors),
    cfg.household.lat != null && cfg.household.lon != null
      ? cached(`weather`, 30 * MIN, () => forecast(cfg.household.lat!, cfg.household.lon!)).catch((e) => {
          errors.push({ source: "Väder", message: (e as Error).message });
          return null;
        })
      : Promise.resolve(null),
    collectPrices(cfg, now, errors),
    conn
      ? cached("ha:states", 20_000, () => ha.states(conn)).catch((e) => {
          errors.push({ source: "Home Assistant", message: (e as Error).message });
          return [] as HaState[];
        })
      : Promise.resolve([] as HaState[]),
    loadShopping(cfg, errors),
  ]);
  const stateMap = new Map(states.map((s) => [s.entity_id, s]));
  const all = [...calEvents, ...school.events];

  // ---- Days ----
  const days: DashDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, i);
    const prev = addDays(day, -1);
    const evs = eventsOnDay(all, day)
      .filter((e) => visibleOn(e, people, day))
      // School lessons are noise on a family board – keep only gym (packing matters) and all-day items.
      .filter((e) => !e.sourceId.startsWith("school:") || e.gym || e.allDay)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
      .map((e) => toDash(e, people));

    const arriving = children.filter((c) => isHome(c.custody, day) && !isHome(c.custody, prev));
    const leaving = children.filter((c) => !isHome(c.custody, day) && isHome(c.custody, prev));
    const extra: DashEvent[] = [];
    if (arriving.length) extra.push({ time: "", title: `${joinNames(arriving.map((c) => c.name))} kommer`, color: FAMILY_COLOR, who: "", category: "family" });
    if (leaving.length) extra.push({ time: "", title: `${joinNames(leaving.map((c) => c.name))} åker`, color: FAMILY_COLOR, who: "", category: "family" });
    for (const w of waste.filter((p) => daysBetween(day, p.date) === 0)) {
      extra.push({ time: "", title: w.type, color: WASTE_COLOR, who: "", category: "waste" });
    }

    days.push({
      key: dayKey(day),
      name: i === 0 ? "Idag" : i === 1 ? "Imorgon" : shortWeekday(day),
      date: i === 0 ? `${shortWeekday(day).toLowerCase()} ${day.getDate()}` : shortDate(day),
      isToday: i === 0,
      childrenHome: children.filter((c) => isHome(c.custody, day)).map((c) => c.name),
      events: [...extra, ...evs],
    });
  }

  // ---- Custody card ----
  let custody: Dashboard["custody"];
  const shared = children.filter((c) => c.custody && c.custody.mode !== "always");
  if (shared.length) {
    const st = custodyStatus(shared[0].custody, now);
    const names = joinNames(shared.map((c) => c.name));
    const when = st.nextChange ? relativeDay(st.nextChange, now) : "";
    custody = {
      headline: st.home
        ? st.daysLeft <= 1 ? `${names} åker ${when}` : `${names} är här`
        : st.daysLeft <= 1 ? `${names} kommer ${when}` : `${names} kommer om ${st.daysLeft} dagar`,
      sub: st.nextChange
        ? `${st.home ? "Byte" : "Barnvecka"} ${shortWeekday(st.nextChange).toLowerCase()} ${shortDate(st.nextChange)} · v${isoWeek(st.nextChange)}`
        : "",
      daysLeft: st.daysLeft,
      progress: st.progress,
    };
  }

  return {
    generatedAt: now.toISOString(),
    header: {
      dateLabel: longDate(now),
      week: isoWeek(now),
      weather: weather ? weatherSummary(weather, now) : undefined,
    },
    reminders: buildReminders(now, all, people, waste, weather),
    custody,
    legend: [
      ...cfg.people.map((p) => ({ name: p.name, color: p.color })),
      { name: "Familj", color: FAMILY_COLOR },
      ...(cfg.integrations.some((i) => i.category === "waste") ? [{ name: "Sopor", color: WASTE_COLOR }] : []),
    ],
    days,
    shopping,
    grocery: (() => {
      const g = groceryIntegration(cfg);
      return g ? { provider: g.provider.meta.id, name: g.provider.meta.name } : undefined;
    })(),
    prices: buildPrices(cfg, prices, now),
    energy: buildEnergy(cfg, stateMap),
    schoolFood: todaysFood(school.food, now),
    cars: cfg.entities.cars.map((c) => buildCar(c, stateMap, now)),
    lights: cfg.entities.lights.map((l) => ({
      entityId: l.entityId,
      name: l.name,
      on: stateMap.get(l.entityId)?.state === "on",
      offline: isOffline(stateMap, l.entityId),
    })),
    lightGroups: (cfg.entities.lightGroups ?? []).map((g, index) => ({
      index,
      name: g.name,
      on: g.entities.filter((id) => stateMap.get(id)?.state === "on").length,
      total: g.entities.length,
      offline: g.entities.filter((id) => isOffline(stateMap, id)).map((id) => friendly(stateMap, id)),
    })),
    buttons: cfg.entities.buttons ?? [],
    climates: (cfg.entities.climates ?? []).map((c) => buildClimate(c.entityId, c.name, stateMap)),
    temps: cfg.entities.temps.map((t) => ({ name: t.name, value: formatTemp(stateMap, t.entityId) })),
    graphs: (cfg.entities.graphs ?? []).map((g, index) => ({ index, title: g.title })),
    accent: cfg.dashboard.accent,
    theme: cfg.dashboard.theme ?? "auto",
    daypart: inTimeWindow(now, "07:00", "19:00") ? "day" : "night",
    night: inTimeWindow(now, cfg.dashboard.nightFrom, cfg.dashboard.nightTo),
    errors,
  };
}

function isOffline(states: Map<string, HaState>, id: string): boolean {
  const s = states.get(id);
  return !s || s.state === "unavailable" || s.state === "unknown";
}

function friendly(states: Map<string, HaState>, id: string): string {
  return String(states.get(id)?.attributes.friendly_name ?? id.split(".")[1] ?? id);
}

function num(states: Map<string, HaState>, id?: string): number | null {
  const v = haValue(states, id);
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : null;
}

function buildCar(c: Config["entities"]["cars"][number], states: Map<string, HaState>, now: Date): Dashboard["cars"][number] {
  const battery = num(states, c.battery);
  const rangeKm = num(states, c.range);
  const loc = haValue(states, c.location);
  const home = loc === undefined ? null : loc === "home" || loc === "on" || loc === "true";
  const ch = haValue(states, c.charging);
  const charging = ch === "on" || ch === "charging" || ch === "true";
  const changed = states.get(c.battery)?.last_changed;
  // last_changed only moves when the value changes; last_reported/updated is closer to "fresh".
  const s = states.get(c.battery) as (HaState & { last_reported?: string; last_updated?: string }) | undefined;
  const stamp = s?.last_reported ?? s?.last_updated ?? changed;
  const ageHours = stamp ? Math.max(0, Math.round((now.getTime() - new Date(stamp).getTime()) / 3_600_000)) : null;
  const status = [
    home === null ? "" : home ? "Hemma" : "Borta",
    rangeKm !== null ? `${Math.round(rangeKm)} km` : "",
    charging ? "laddar" : "",
  ].filter(Boolean);
  return { name: c.name, battery: battery === null ? null : Math.round(battery), rangeKm, home, charging, ageHours, status: status.join(" · ") };
}

const MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  heat: "Värme",
  cool: "Kyla",
  off: "Av",
  heat_cool: "Auto",
  dry: "Avfukta",
  fan_only: "Fläkt",
  home: "Hemma",
  away: "Borta",
  eco: "Eco",
  comfort: "Komfort",
  boost: "Boost",
  sleep: "Natt",
  none: "Normal",
  electric: "El",
  heat_pump: "Värmepump",
  performance: "Max",
  high_demand: "Hög",
  gas: "Gas",
  on: "Till",
};

function buildClimate(entityId: string, name: string, states: Map<string, HaState>): Dashboard["climates"][number] {
  const s = states.get(entityId);
  const domain = entityId.startsWith("water_heater.") ? "water_heater" : "climate";
  const a = (s?.attributes ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  let modes: Dashboard["climates"][number]["modes"] = [];
  let active: string | undefined;
  if (domain === "water_heater") {
    modes = list(a.operation_list).map((m) => ({ value: m, label: MODE_LABELS[m] ?? m, field: "operation_mode" as const }));
    active = String(a.operation_mode ?? s?.state ?? "");
  } else if (list(a.preset_modes).length) {
    modes = list(a.preset_modes).map((m) => ({ value: m, label: MODE_LABELS[m] ?? m, field: "preset_mode" as const }));
    active = String(a.preset_mode ?? "");
  } else {
    modes = list(a.hvac_modes).map((m) => ({ value: m, label: MODE_LABELS[m] ?? m, field: "hvac_mode" as const }));
    active = s?.state;
  }
  const n = (v: unknown) => (typeof v === "number" ? v : v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    entityId,
    name,
    domain,
    current: n(a.current_temperature),
    target: n(a.temperature ?? a.target_temp_high),
    action: typeof a.hvac_action === "string" ? a.hvac_action : undefined,
    modes: modes.slice(0, 5),
    active,
  };
}

async function loadShopping(cfg: Config, errors: SourceError[]): Promise<Dashboard["shopping"]> {
  if (cfg.shopping.source === "ha" && cfg.shopping.entityId) {
    const conn = haConnection();
    if (conn) {
      try {
        const items = await cached(`todo:${cfg.shopping.entityId}`, 15_000, () => ha.todoItems(conn, cfg.shopping.entityId!));
        return { source: "ha", items: items.map((i) => ({ id: i.uid, name: i.summary, done: i.status === "completed" })) };
      } catch (e) {
        errors.push({ source: "Inköpslista", message: (e as Error).message });
      }
    }
    return { source: "ha", items: [] };
  }
  return { source: "local", items: loadLocalList() };
}

const WEEKDAY_NAMES = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

/** School lunch for today (or tomorrow after 14:00) – matched on the weekday name Vklass uses. */
function todaysFood(food: { child: string; day: string; dishes: string[] }[], now: Date): Dashboard["schoolFood"] {
  if (!food.length) return undefined;
  const target = now.getHours() >= 14 ? addDays(now, 1) : now;
  const name = WEEKDAY_NAMES[target.getDay()];
  const hits = food.filter((f) => f.day.toLowerCase().includes(name) || f.day.includes(String(target.getDate())));
  const seen = new Set<string>();
  return hits.filter((f) => {
    const k = f.dishes.join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Power in kW regardless of whether the sensor reports W or kW. */
function kw(states: Map<string, HaState>, id?: string): number | undefined {
  const v = haValue(states, id);
  const n = Number(v);
  if (v === undefined || !Number.isFinite(n)) return undefined;
  const unit = String(states.get(id!)?.attributes.unit_of_measurement ?? "");
  return Math.round((unit === "W" ? n / 1000 : unit === "MW" ? n * 1000 : n) * 100) / 100;
}

function buildEnergy(cfg: Config, states: Map<string, HaState>): Dashboard["energy"] {
  const e = cfg.entities.energy ?? {};
  const out = {
    solarKw: kw(states, e.solar),
    gridKw: kw(states, e.grid),
    houseKw: kw(states, e.house),
    batteryPct: num(states, e.battery) ?? undefined,
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

function buildPrices(cfg: Config, spot: HourPrice[], now: Date): Dashboard["prices"] {
  if (spot.length === 0) return undefined;
  const withExtras = hasPriceExtras(cfg);
  const prices = withExtras ? spot.map((p) => ({ ...p, price: totalPrice(cfg, p.price) })) : spot;
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
  const upcoming = prices.filter((p) => p.start.getTime() >= currentHour).slice(0, 24);
  const nowPrice = upcoming[0]?.price ?? prices[prices.length - 1].price;
  const block = cheapestBlock(upcoming, Math.max(1, Math.min(8, cfg.electricity.cheapHours)), now);
  const cheapSet = new Set(block?.hours ?? []);
  return {
    now: nowPrice,
    kind: withExtras ? "total" : "spot",
    level: priceLevel(nowPrice, upcoming),
    bars: upcoming.map((p, i) => ({
      hour: String(p.start.getHours()).padStart(2, "0"),
      price: p.price,
      cheap: cheapSet.has(p.start.getTime()),
      current: i === 0,
    })),
    cheapest: block ? { from: hhmm(block.start).slice(0, 2), to: hhmm(block.end).slice(0, 2), avg: block.avg } : undefined,
  };
}

export function buildReminders(
  now: Date,
  events: SourcedEvent[],
  people: Map<string, Person>,
  waste: { date: Date; type: string }[],
  weather: Forecast | null,
): Reminder[] {
  const out: Reminder[] = [];
  const today = startOfDay(now);
  const evening = now.getHours() >= 17;
  const focusDay = evening ? addDays(today, 1) : today; // after 17 we prepare for tomorrow
  const focusLabel = evening ? "imorgon" : "idag";

  // Rain
  if (weather) {
    const mm = evening ? rainBetween(weather, 1, 6, 18, now) : rainBetween(weather, 0, Math.max(now.getHours(), 7), 19, now);
    if (mm >= 0.8) {
      out.push({
        icon: "rain",
        title: evening ? "Regn imorgon" : now.getHours() < 12 ? "Regn under dagen" : "Regn i eftermiddag",
        sub: "Ta regnjackan",
        tone: "blue",
      });
    }
  }

  // Custody handover
  for (const c of [...people.values()].filter((p) => p.kind === "child")) {
    const tomorrow = addDays(today, 1);
    if (!isHome(c.custody, today) && isHome(c.custody, tomorrow)) {
      out.push({ icon: "kids", title: `${c.name} kommer imorgon`, sub: "Barnvecka börjar", tone: "green" });
    }
  }

  // Sport and gym for the focus day, and sport tomorrow morning
  const horizonEnd = addDays(focusDay, 1);
  const upcoming = events
    .filter((e) => e.start >= (evening ? focusDay : now) && e.start < horizonEnd)
    .filter((e) => visibleOn(e, people, startOfDay(e.start)));
  const seen = new Set<string>();
  for (const e of upcoming) {
    const p = e.personId ? people.get(e.personId) : undefined;
    if (!p) continue;
    if (e.category === "sport") {
      const key = `sport:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ icon: "bag", title: `${p.name} · ${e.title} ${e.allDay ? focusLabel : hhmm(e.start)}`, sub: "Packa träningsväskan", tone: "blue" });
    } else if (e.gym) {
      const key = `gym:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ icon: "gym", title: `${p.name} · Idrott ${focusLabel}`, sub: "Gympapåse · från Vklass", tone: "amber" });
    }
  }

  // Waste: today or tomorrow
  for (const w of waste) {
    const diff = daysBetween(today, w.date);
    if (diff === 0) out.push({ icon: "trash", title: `${w.type} hämtas idag`, sub: "Har kärlet ställts ut?", tone: "neutral" });
    else if (diff === 1) out.push({ icon: "trash", title: `${w.type} hämtas imorgon`, sub: "Ställ ut kärlet ikväll", tone: "neutral" });
  }

  return out.slice(0, 5);
}
