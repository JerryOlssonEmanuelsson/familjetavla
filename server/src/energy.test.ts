import { describe, expect, it } from "vitest";
import { energyLive, energyNow, energyToday, increase, liveEnergyIds } from "./energy.js";
import type { HaState } from "./connectors/ha.js";
import { discover, type HaEntityInfo } from "./discovery.js";

const st = (entity_id: string, state: string, unit: string): HaState => ({ entity_id, state, attributes: { unit_of_measurement: unit }, last_changed: "" });

describe("energy now", () => {
  it("house = sun + bought − sold, like a real home with SolarEdge and Tibber Pulse", () => {
    const states = new Map([st("sensor.solar", "128", "W"), st("sensor.pulse", "425", "W"), st("sensor.pulse_prod", "0", "W")].map((s) => [s.entity_id, s]));
    expect(energyNow({ solar: "sensor.solar", grid: "sensor.pulse", gridExport: "sensor.pulse_prod" }, states)).toEqual({ solarKw: 0.13, gridKw: 0.43, houseKw: 0.56, selfUseKw: 0.13 });
  });
  it("selling: the grid goes negative and only the rest of the sun is used at home", () => {
    const states = new Map([st("sensor.solar", "5.2", "kW"), st("sensor.pulse", "0", "W"), st("sensor.pulse_prod", "3800", "W")].map((s) => [s.entity_id, s]));
    expect(energyNow({ solar: "sensor.solar", grid: "sensor.pulse", gridExport: "sensor.pulse_prod" }, states)).toEqual({ solarKw: 5.2, gridKw: -3.8, houseKw: 1.4, selfUseKw: 1.4 });
  });
  it("a home's own consumption sensor that is only the bought power does not hide the sun", () => {
    // Tibber Effekt is 0 while selling; a template copying it says the house uses nothing.
    const states = new Map([st("sensor.solar", "4000", "W"), st("sensor.pulse", "0", "W"), st("sensor.pulse_prod", "2500", "W"), st("sensor.tpl", "0", "kW")].map((s) => [s.entity_id, s]));
    expect(energyNow({ solar: "sensor.solar", grid: "sensor.pulse", gridExport: "sensor.pulse_prod", house: "sensor.tpl" }, states).houseKw).toBe(1.5);
    // Without a solar sensor the house sensor is used.
    expect(energyNow({ grid: "sensor.pulse", house: "sensor.tpl" }, states).houseKw).toBe(0);
  });
  it("live: the flow and the battery, and only power sensors move it (not the kWh meters)", () => {
    const states = new Map([st("sensor.solar", "2000", "W"), st("sensor.pulse", "500", "W"), st("sensor.bat", "64", "%")].map((s) => [s.entity_id, s]));
    const e = { solar: "sensor.solar", grid: "sensor.pulse", battery: "sensor.bat", importEnergy: "sensor.meter" };
    expect(energyLive(e, states)).toEqual({ solarKw: 2, gridKw: 0.5, houseKw: 2.5, selfUseKw: 2, batteryPct: 64 });
    expect(liveEnergyIds(e)).toEqual(["sensor.solar", "sensor.pulse", "sensor.bat"]);
  });
});

describe("energy today", () => {
  const t = (h: number, m = 0) => new Date(2026, 9, 20, h, m).getTime();
  it("counts a lifetime meter and a counter that restarts at midnight the same way", () => {
    expect(increase([{ t: t(0), v: 56079.4 }, { t: t(8), v: 56090 }, { t: t(14), v: 56103.0 }])).toBeCloseTo(23.6, 1);
    expect(increase([{ t: t(0), v: 21.4 }, { t: t(0, 1), v: 0.2 }, { t: t(14), v: 23.6 }])).toBeCloseTo(23.6, 1);
  });
  it("a short glitch to 0 is not counted twice (real home: 57.5 kWh instead of 31.9)", () => {
    const pts = [{ t: t(0), v: 0 }, { t: t(12), v: 20 }, { t: t(18, 40), v: 25.6 }, { t: t(18, 41), v: 0 }, { t: t(18, 43), v: 25.7 }, { t: t(21), v: 31.9 }];
    expect(increase(pts)).toBeCloseTo(31.9, 1);
  });
  it("a day that passes yesterday's total still counts from midnight", () => {
    expect(increase([{ t: t(0), v: 30 }, { t: t(0, 1), v: 0.1 }, { t: t(0, 20), v: 0.5 }, { t: t(21), v: 35 }])).toBeCloseTo(35, 1);
  });
  it("hourly counters restart every hour, small corrections count nothing", () => {
    expect(increase([{ t: t(9, 50), v: 1.8 }, { t: t(10, 0), v: 0 }, { t: t(10, 20), v: 2 }, { t: t(10, 59), v: 3 }, { t: t(11, 1), v: 0.1 }])).toBeCloseTo(3.1, 1);
    expect(increase([{ t: t(9), v: 10 }, { t: t(10), v: 9.99 }, { t: t(11), v: 11 }])).toBeCloseTo(1, 1);
  });
  it("gives consumption, own solar use, self-sufficiency and cost", () => {
    const series = {
      "sensor.sol": [{ t: t(0), v: 55982453 }, { t: t(14), v: 55996176 }],
      "sensor.in": [{ t: t(0), v: 56079.431 }, { t: t(1), v: 56081.431 }, { t: t(14), v: 56103.031 }],
      "sensor.out": [{ t: t(0), v: 41665.478 }, { t: t(14), v: 41670.19 }],
    };
    const prices = Array.from({ length: 24 }, (_, h) => ({ start: new Date(t(h)), price: 1 }));
    const r = energyToday({ solarEnergy: "sensor.sol", importEnergy: "sensor.in", exportEnergy: "sensor.out" }, series, { "sensor.sol": "Wh", "sensor.in": "kWh", "sensor.out": "kWh" }, prices, (p) => p);
    expect(r).toMatchObject({ solarKwh: 13.72, importKwh: 23.6, exportKwh: 4.71, houseKwh: 32.61, selfUseKwh: 9.01, selfSufficiencyPct: 28 });
    expect(r?.costKr).toBe(24);
  });
});

describe("energy discovery", () => {
  it("finds Tibber Pulse bought/sold power and the meter readings", () => {
    const e = (id: string, n: string, d: string, m: string, dc: string | null, u: string, st: string): HaEntityInfo => ({ e: id, n, a: null, d, dn: null, m, mo: null, dc, u, st, lu: "" });
    const d = discover([
      e("sensor.ac_power", "Solaredge-modbus AC Power", "inv", "SolarEdge", "power", "W", "128"),
      e("sensor.ac_energy", "Solaredge-modbus AC Energy", "inv", "SolarEdge", "energy", "kWh", "55996.176"),
      e("sensor.pulse_effekt", "Tibber Pulse Malmgatan 34 Effekt", "pulse", "Tibber", "power", "W", "425"),
      e("sensor.pulse_max", "Tibber Pulse Malmgatan 34 Max effekt", "pulse", "Tibber", "power", "W", "8399"),
      e("sensor.elproduktion", "Elproduktion", "pulse", "Tibber", "power", "W", "0"),
      e("sensor.pulse_meter_in", "Tibber Pulse Malmgatan 34 Senaste mätarförbrukning", "pulse", "Tibber", "energy", "kWh", "56103.031"),
      e("sensor.pulse_meter_out", "Tibber Pulse Malmgatan 34 Senaste mätarproduktion", "pulse", "Tibber", "energy", "kWh", "41670.19"),
      e("sensor.pulse_hour", "Tibber Pulse Malmgatan 34 Ackumulerad förbrukning under aktuell timme", "pulse", "Tibber", "energy", "kWh", "0.6"),
    ]);
    expect(d.energy).toMatchObject({ solar: "sensor.ac_power", grid: "sensor.pulse_effekt", gridExport: "sensor.elproduktion", solarEnergy: "sensor.ac_energy", importEnergy: "sensor.pulse_meter_in", exportEnergy: "sensor.pulse_meter_out" });
  });
});
