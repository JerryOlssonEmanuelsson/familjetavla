import { describe, expect, it } from "vitest";
import { carCharging, type HaEntityInfo } from "./discovery.js";

const e = (id: string, name: string, st: string, u: string | null = null): HaEntityInfo => ({ e: id, n: `Tesla ${name}`, a: null, d: "d1", dn: "Tesla", m: null, mo: null, dc: null, u, st, lu: "2026-10-19T10:00:00Z" });

describe("car charging", () => {
  it("finds the charge switch and the schedule, not the charge port or the limit", () => {
    const c = carCharging(
      [
        e("switch.tesla_off_peak_charging", "Off-peak charging", "on"),
        e("switch.tesla_charger", "Charger", "off"),
        e("cover.tesla_charge_port_door", "Charge port door", "closed"),
        e("number.tesla_charge_limit", "Charge limit", "80", "%"),
        e("time.tesla_scheduled_charging", "Scheduled charging", "01:00:00"),
        e("sensor.tesla_battery", "Battery", "62", "%"),
      ],
      "Tesla",
    );
    expect(c.switch).toEqual({ entityId: "switch.tesla_charger", name: "Charger", on: false });
    expect(c.schedule.map((s) => `${s.name}=${s.value}`)).toEqual(["Off-peak charging=På", "Scheduled charging=01:00"]);
  });

  it("uses start/stop buttons when there is no switch", () => {
    const c = carCharging([e("button.leaf_start_charging", "Start charging", "unknown"), e("button.leaf_stop_charging", "Stop charging", "unknown")], "Tesla");
    expect(c.switch).toBeUndefined();
    expect(c.start?.entityId).toBe("button.leaf_start_charging");
    expect(c.stop?.entityId).toBe("button.leaf_stop_charging");
  });
});

describe("car discovery", () => {
  it("does not take a phone with battery, location and charging for a car", async () => {
    const { discover } = await import("./discovery.js");
    const ent = (e: string, n: string, extra: Partial<HaEntityInfo> = {}): HaEntityInfo => ({ e, n, a: null, d: "p1", dn: "Emil-S24", m: "samsung", mo: "SM-S921B", dc: null, u: null, st: "1", lu: "", ...extra });
    const phone = [
      ent("sensor.s24_battery_level", "Emil-S24 Battery level", { u: "%", dc: "battery", st: "82" }),
      ent("device_tracker.s24", "Emil-S24"),
      ent("sensor.s24_charger_type", "Emil-S24 Charger type"),
    ];
    const car = ["sensor.tesla_battery|Tesla Battery|%|battery|97", "device_tracker.tesla|Tesla Location||", "sensor.tesla_range|Tesla Range|km||410"].map((r) => {
      const [e, n, u, dc, st] = r.split("|");
      return { e, n, a: null, d: "c1", dn: "Tesla MY", m: "Tesla", mo: "Model Y", dc: dc || null, u: u || null, st: st ?? "1", lu: "" };
    });
    expect(discover([...phone, ...car]).cars.map((c) => c.name)).toEqual(["Tesla MY"]);
  });
});
