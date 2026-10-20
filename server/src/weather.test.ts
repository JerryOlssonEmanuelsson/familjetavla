import { describe, expect, it } from "vitest";
import { sunToday, type Forecast } from "./connectors/weather.js";

describe("sun today", () => {
  const f: Forecast = { hourly: [], daily: [{ date: "2026-10-20", tmax: 9, tmin: 1, precip: 0, wind: 3, sunrise: "07:35", sunset: "17:35" }] };
  it("gives how far the sun has come between sunrise and sunset", () => {
    expect(sunToday(f, new Date(2026, 9, 20, 12, 35))).toEqual({ rise: "07:35", set: "17:35", pos: 0.5 });
  });
  it("has no sun position at night, and nothing without times", () => {
    expect(sunToday(f, new Date(2026, 9, 20, 21, 0))?.pos).toBeUndefined();
    expect(sunToday({ hourly: [], daily: [{ date: "x", tmax: 0, tmin: 0, precip: 0, wind: 0 }] })).toBeUndefined();
  });
});
