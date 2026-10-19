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
