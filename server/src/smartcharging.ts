import type { HaState } from "./connectors/ha.js";

/**
 * Smart laddning (märkesoberoende). Alla smartstyrningar som lägger en laddplan och ett laddläge i Home Assistant kan visas här,
 * utan inställningar, om de följer avtalet (se docs/SMART-LADDNING.md):
 *
 *  - Laddplan: en sensor med attributet `slots` = [{ start, end, kw? }] (ISO 8601, helst med tidszon). Tillståndet är en kort text
 *    ("Laddar nu", "Planerad 01:15"). Valfria attribut: soc_after_plan, planned_kwh, source.
 *  - Laddläge: en select/input_select med alternativ för automatik, ladda nu och pausa (t.ex. Auto / Ladda nu / Pausa,
 *    Auto / Charge now / Pause). Att välja ett alternativ ska ge samma överstyrning som smartstyrningens egen knapp.
 */
export interface Slot {
  start: string;
  end: string;
  kw: number | null;
}

export interface SmartCharging {
  planEntity: string;
  modeEntity?: string;
  state: string;
  mode?: string;
  options: string[];
  /** Alternativet som motsvarar "ladda nu" respektive "pausa" (för laddknappen), om det finns. */
  nowOption?: string;
  pauseOption?: string;
  autoOption?: string;
  slots: Slot[];
  socAfter: number | null;
  plannedKwh: number | null;
  source?: string;
}

const NOW = /(ladda nu|charge now|force|tvinga|start now|ladda direkt|max)/i;
const PAUSE = /(pausa|pause|stopp|stop|hold|vänta|av$|off$)/i;
const AUTO = /(auto|smart)/i;

const attrs = (s: HaState) => s.attributes as Record<string, unknown>;

export function parseSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  const out: Slot[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const start = String(r.start ?? r.from ?? "");
    const end = String(r.end ?? r.to ?? "");
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) continue;
    const kw = Number(r.kw ?? r.power_kw);
    out.push({ start, end, kw: Number.isFinite(kw) ? kw : null });
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9åäö]+/g, "_").replace(/^_+|_+$/g, "");

/** Hittar bilens laddplan och laddläge: uttryckligt valda entiteter först, annars entiteter som följer avtalet och hör till bilen (namn i entitets-id:t). */
export function findSmartCharging(states: Map<string, HaState>, carName: string, explicit?: { plan?: string; mode?: string }): SmartCharging | undefined {
  const all = [...states.values()];
  const plans = all.filter((s) => s.entity_id.startsWith("sensor.") && Array.isArray(attrs(s).slots));
  const modes = all.filter((s) => /^(input_select|select)\./.test(s.entity_id) && Array.isArray(attrs(s).options) && /ladd|charg/i.test(s.entity_id) && (attrs(s).options as unknown[]).some((o) => AUTO.test(String(o))) && (attrs(s).options as unknown[]).some((o) => PAUSE.test(String(o))));
  const key = slug(carName);
  const first = key.split("_")[0];
  const pick = (list: HaState[], want?: string) => {
    if (want) return states.get(want);
    const byFull = list.find((s) => s.entity_id.includes(key));
    if (byFull) return byFull;
    const byFirst = first.length >= 3 ? list.filter((s) => s.entity_id.includes(first)) : [];
    if (byFirst.length === 1) return byFirst[0];
    return list.length === 1 && !explicit ? list[0] : undefined;
  };
  const plan = pick(plans, explicit?.plan);
  const modeS = pick(modes, explicit?.mode);
  if (!plan && !modeS) return undefined;
  const options = modeS ? (attrs(modeS).options as unknown[]).map(String) : [];
  const a = plan ? attrs(plan) : {};
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    planEntity: plan?.entity_id ?? "",
    modeEntity: modeS?.entity_id,
    state: plan ? (plan.state === "unknown" || plan.state === "unavailable" ? "" : plan.state) : "",
    mode: modeS?.state,
    options,
    nowOption: options.find((o) => NOW.test(o)),
    pauseOption: options.find((o) => PAUSE.test(o) && !AUTO.test(o)),
    autoOption: options.find((o) => AUTO.test(o) && !NOW.test(o)),
    slots: parseSlots(a.slots),
    socAfter: num(a.soc_after_plan),
    plannedKwh: num(a.planned_kwh),
    source: a.source ? String(a.source) : undefined,
  };
}
