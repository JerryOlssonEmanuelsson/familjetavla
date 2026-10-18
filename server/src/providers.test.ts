import { describe, expect, it } from "vitest";
import { guessArea, matchWasteProvider } from "./connectors/geo.js";
import { detectGroups, filterEvents, type CalEvent } from "./connectors/ics.js";
import { visibleOn } from "./dashboard.js";
import { pricesFromAttributes } from "./providers/price.js";
import { expandManual } from "./providers/waste.js";
import type { SourcedEvent } from "./sources.js";
import type { Person } from "./types.js";

const ev = (title: string, extra: Partial<CalEvent> = {}): CalEvent => ({
  start: new Date(2026, 9, 20, 17),
  end: new Date(2026, 9, 20, 18),
  allDay: false,
  title,
  ...extra,
});

describe("team filter", () => {
  const feed = [ev("P14 Blå – Träning"), ev("P14 Blå – Match mot IFK"), ev("F12 – Träning"), ev("F12 – Match"), ev("Föräldramöte")];

  it("detects teams from title prefixes", () => {
    expect(detectGroups(feed).map((g) => g.name)).toEqual(["P14 Blå", "F12"]);
  });

  it("detects teams from CATEGORIES", () => {
    const withCats = [ev("Träning", { categories: ["Flickor 2014"] }), ev("Match", { categories: ["Flickor 2014"] }), ev("Träning", { categories: ["Futsal"] }), ev("Cup", { categories: ["Futsal"] })];
    expect(detectGroups(withCats).map((g) => g.name).sort()).toEqual(["Flickor 2014", "Futsal"]);
  });

  it("keeps only the chosen team and drops excluded words", () => {
    expect(filterEvents(feed, ["p14"]).length).toBe(2);
    expect(filterEvents(feed, [], ["föräldramöte"]).length).toBe(4);
    expect(filterEvents(feed, ["f12"], ["match"]).map((e) => e.title)).toEqual(["F12 – Träning"]);
  });
});

describe("custody visibility", () => {
  const child: Person = { id: "a", name: "Ella", color: "#5ab8ff", kind: "child", custody: { mode: "oddWeeks" } };
  const people = new Map([[child.id, child]]);
  const evenWeekDay = new Date(2026, 9, 14); // v42 – at the other home
  const base = { ...ev("Träning"), sourceId: "c", personId: "a", category: "sport" as const };

  it("hides training on the other parent's week but shows matches", () => {
    expect(visibleOn(base as SourcedEvent, people, evenWeekDay)).toBe(false);
    expect(visibleOn({ ...base, ignoreCustody: true } as SourcedEvent, people, evenWeekDay)).toBe(true);
    expect(visibleOn(base as SourcedEvent, people, new Date(2026, 9, 21))).toBe(true);
  });
});

describe("manual waste schedule", () => {
  it("repeats from a past first date and respects months", () => {
    const rows = [
      { type: "Matavfall", firstDate: "2026-01-06", everyWeeks: 2 },
      { type: "Trädgård", firstDate: "2026-04-01", everyWeeks: 2, months: [4, 5, 6, 7, 8, 9] },
    ];
    const out = expandManual(rows, new Date(2026, 9, 18), new Date(2026, 10, 18));
    expect(out.every((p) => p.type === "Matavfall")).toBe(true);
    expect(out.map((p) => p.date.getDate())).toEqual([27, 10]) // 6 jan + 21×14 dagar = 27 okt;
  });
});

describe("electricity area", () => {
  it.each([
    ["Luleå", 65.58, 22.15, "SE1"],
    ["Piteå", 65.32, 21.48, "SE1"],
    ["Skellefteå", 64.75, 20.95, "SE2"],
    ["Söderhamn", 61.3, 17.06, "SE2"],
    ["Mora", 61.0, 14.54, "SE3"],
    ["Gävle", 60.67, 17.14, "SE3"],
    ["Stockholm", 59.33, 18.07, "SE3"],
    ["Varberg", 57.1, 12.25, "SE3"],
    ["Falkenberg", 56.9, 12.49, "SE4"],
    ["Malmö", 55.6, 13.0, "SE4"],
  ])("%s → %s", (_n, lat, lon, area) => {
    expect(guessArea(lat as number, lon as number)).toBe(area);
  });

  it("matches municipality to waste provider", () => {
    expect(matchWasteProvider("Lunds kommun")).toBe("lund");
    expect(matchWasteProvider("Växjö kommun")).toBe("ssam");
    expect(matchWasteProvider("Stockholms kommun")).toBeUndefined();
  });
});

describe("HA price sensor", () => {
  it("reads Nordpool raw_today", () => {
    const raw = Array.from({ length: 24 }, (_, h) => ({ start: new Date(2026, 9, 18, h).toISOString(), value: h / 10 }));
    const p = pricesFromAttributes({ raw_today: raw }, "SEK/kWh", new Date(2026, 9, 18));
    expect(p).toHaveLength(24);
    expect(p[5].price).toBeCloseTo(0.5);
  });

  it("reads öre arrays", () => {
    const p = pricesFromAttributes({ today: Array.from({ length: 24 }, () => 100) }, "öre/kWh", new Date(2026, 9, 18));
    expect(p[0].price).toBeCloseTo(1);
  });
});
