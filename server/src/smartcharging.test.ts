import { describe, expect, it } from "vitest";
import type { HaState } from "./connectors/ha.js";
import { findSmartCharging, parseSlots } from "./smartcharging.js";

const st = (id: string, state: string, attributes: Record<string, unknown> = {}): HaState => ({ entity_id: id, state, attributes, last_changed: "2026-10-23T10:00:00Z" });
const slots = [
  { start: "2026-10-24T23:45+02:00", end: "2026-10-25T00:45+02:00", kw: 11 },
  { start: "2026-10-25T02:15+02:00", end: "2026-10-25T02:45+02:00", kw: 10.5 },
];
const world = new Map<string, HaState>(
  [
    st("sensor.tesla_model_y_laddplan", "Planerad 23:45", { slots, soc_after_plan: 100, planned_kwh: 49.4, source: "EnergyWizard" }),
    st("input_select.tesla_model_y_laddlage", "Auto", { options: ["Auto", "Ladda nu", "Pausa"] }),
    st("sensor.nissan_leaf_laddplan", "Ingen plan", { slots: [] }),
    st("input_select.nissan_leaf_laddlage", "Pausa", { options: ["Auto", "Ladda nu", "Pausa"] }),
    st("sensor.tesla_battery", "41"),
  ].map((s) => [s.entity_id, s]),
);

describe("smart charging", () => {
  it("matches plan and mode to the right car by name", () => {
    const t = findSmartCharging(world, "Tesla Model Y")!;
    expect(t.planEntity).toBe("sensor.tesla_model_y_laddplan");
    expect(t.modeEntity).toBe("input_select.tesla_model_y_laddlage");
    expect(t.slots).toHaveLength(2);
    expect(t.nowOption).toBe("Ladda nu");
    expect(t.pauseOption).toBe("Pausa");
    expect(t.autoOption).toBe("Auto");
    expect(t.socAfter).toBe(100);
    const n = findSmartCharging(world, "Nissan Leaf")!;
    expect(n.modeEntity).toBe("input_select.nissan_leaf_laddlage");
    expect(n.mode).toBe("Pausa");
    expect(n.slots).toEqual([]);
  });

  it("does not guess when several cars could match", () => {
    expect(findSmartCharging(world, "Volvo")).toBeUndefined();
  });

  it("uses the only smart-charging entities for the only car, and understands English options", () => {
    const one = new Map<string, HaState>([
      ["sensor.ev_plan", st("sensor.ev_plan", "Charging now", { slots })],
      ["select.ev_charge_mode", st("select.ev_charge_mode", "Auto", { options: ["Auto", "Charge now", "Pause"] })],
    ]);
    const c = findSmartCharging(one, "Min bil")!;
    expect(c.nowOption).toBe("Charge now");
    expect(c.pauseOption).toBe("Pause");
  });

  it("ignores broken slots", () => {
    expect(parseSlots([{ start: "x", end: "y" }, { start: "2026-10-24T10:00:00Z", end: "2026-10-24T09:00:00Z" }, { start: "2026-10-24T10:00:00Z", end: "2026-10-24T11:00:00Z", kw: "7" }])).toEqual([{ start: "2026-10-24T10:00:00Z", end: "2026-10-24T11:00:00Z", kw: 7 }]);
    expect(parseSlots("nej")).toEqual([]);
  });

  it("returns nothing without any smart-charging entities", () => {
    expect(findSmartCharging(new Map([["sensor.tesla_battery", st("sensor.tesla_battery", "41")]]), "Tesla")).toBeUndefined();
  });
});
