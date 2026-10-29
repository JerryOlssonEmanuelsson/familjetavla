import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { kw, kwh, pvKw, solisHeaders, toReading } from "./connectors/solis.js";
import { mergeSolar } from "./dashboard.js";

describe("SolisCloud signing", () => {
  it("signs POST, Content-MD5, type, date and path with HMAC-SHA1", () => {
    const body = '{"pageNo":1,"pageSize":20}';
    const now = new Date("2026-10-29T11:40:00Z");
    const h = solisHeaders(body, "/v1/api/userStationList", "1300386381676", "secret", now);
    const md5 = createHash("md5").update(body).digest("base64");
    expect(h["Content-MD5"]).toBe(md5);
    expect(h.Date).toBe("Thu, 29 Oct 2026 11:40:00 GMT");
    const expected = createHmac("sha1", "secret").update(`POST\n${md5}\napplication/json\nThu, 29 Oct 2026 11:40:00 GMT\n/v1/api/userStationList`).digest("base64");
    expect(h.Authorization).toBe(`API 1300386381676:${expected}`);
  });
});

describe("Solis units", () => {
  it("reads the unit next to each value", () => {
    expect(kw({ pac: 2300, pacStr: "W" }, "pac")).toBe(2.3);
    expect(kw({ pac: 2.3, pacStr: "kW" }, "pac")).toBe(2.3);
    expect(kwh({ e: 1.2, eStr: "MWh" }, "e")).toBe(1200);
    expect(kwh({ e: 500, eStr: "Wh" }, "e")).toBe(0.5);
    expect(pvKw({ pow1: 1500, pow2: 1000 })).toBe(2.5);
    expect(pvKw({ pac: 1 })).toBeUndefined();
  });
});

describe("Solis reading", () => {
  const inverter = {
    pow1: 2000,
    pow2: 1000,
    pac: 2.4,
    pacStr: "kW",
    batteryCapacitySoc: 76,
    batteryPower: 0.8,
    batteryPowerStr: "kW",
    storageBatteryCurrent: 15,
    familyLoadPower: 1.2,
    familyLoadPowerStr: "kW",
    psum: 1.0,
    psumStr: "kW",
    eToday: 12.4,
    eTodayStr: "kWh",
    batteryTodayChargeEnergy: 3,
    batteryTodayDischargeEnergy: 1,
    dataTimestamp: "1793271600000",
  };

  it("uses the DC strings for the sun and the battery current for direction", () => {
    const r = toReading([inverter], undefined);
    expect(r.solarKw).toBe(3);
    expect(r.batteryPct).toBe(76);
    expect(r.batteryKw).toBe(0.8); // charging
    expect(r.houseKw).toBe(1.2);
    expect(r.gridKw).toBe(-1); // 3 − 0.8 − 1.0 = 1.2: selling 1 kW
    expect(r.today?.solarKwh).toBe(12.4);
    expect(r.updated).toBe(1793271600000);
  });

  it("marks discharging as negative", () => {
    const r = toReading([{ ...inverter, storageBatteryCurrent: -10 }], undefined);
    expect(r.batteryKw).toBe(-0.8);
  });

  it("flips the grid sign when the energy balance says the meter counts import as positive", () => {
    // Night: no sun, battery idle, house 1.5 kW, psum +1.5 → buying.
    const r = toReading([{ ...inverter, pow1: 0, pow2: 0, batteryPower: 0, familyLoadPower: 1.5, psum: 1.5 }], undefined);
    expect(r.gridKw).toBe(1.5);
  });

  it("prefers the plant's day totals", () => {
    const r = toReading([inverter], { dayEnergy: 13, dayEnergyStr: "kWh", gridPurchasedDayEnergy: 2, gridSellDayEnergy: 4, homeLoadEnergy: 9 });
    expect(r.today).toMatchObject({ solarKwh: 13, importKwh: 2, exportKwh: 4, houseKwh: 9 });
  });

  it("goes before Home Assistant on the board", () => {
    const r = toReading([inverter], { gridPurchasedDayEnergy: 2, gridSellDayEnergy: 4, homeLoadEnergy: 10 });
    const e = mergeSolar({ solarKw: 0.1 }, r, "Solis");
    expect(e.solarKw).toBe(3);
    expect(e.batteryKw).toBe(0.8);
    expect(e.selfUseKw).toBe(1.2); // 3 − 1 sold − 0.8 charged
    // Egen solel: 12,4 − 4 såld = 8,4 av 10 förbrukat.
    expect(e.today?.selfUseKwh).toBe(8.4);
    expect(e.today?.selfSufficiencyPct).toBe(84);
    expect(e.source).toBe("Solis");
  });

  it("does not count a battery charged from the grid against the sun", () => {
    // Som en vinterdag: 10,8 sol, 7,4 såld, 36,2 köpt (mest till batteriet), 23 förbrukat.
    const r = toReading([{ ...inverter, batteryTodayChargeEnergy: 23, batteryTodayDischargeEnergy: 9 }], { dayEnergy: 10.8, gridPurchasedDayEnergy: 36.2, gridSellDayEnergy: 7.4, homeLoadEnergy: 23 });
    const e = mergeSolar({}, r, "Solis");
    expect(e.today?.selfUseKwh).toBe(3.4);
    expect(e.today?.selfSufficiencyPct).toBe(15);
  });
});
