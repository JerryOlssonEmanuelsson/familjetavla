import { describe, expect, it } from "vitest";
import { parseSrvSchedule, splitSrvAddress } from "./connectors/waste.js";

// Shape of www.srvatervinning.se/rest-api/core/sewagePickup/search (as used by Waste Collection Schedule).
const sample = {
  results: [
    {
      customerId: "123",
      zipCode: "13760",
      containers: [
        { address: "Skolvägen 10", city: "TUNGELSTA", contentType: "MATAVFALL", containerType: "Kärl 140 l", calendars: [{ startDate: "2026-10-16" }, { startDate: "2026-10-23" }, { startDate: "2026-10-30" }] },
        { contentType: "Restavfall", calendars: [{ startDate: "2026-10-23" }, { startDate: "2026-10-23" }, { startDate: "2026-11-06" }] },
        { contentType: "", containerType: "", hasFrequency: false, frequency: false, calendars: [{ startDate: "2027-03-01" }, { startDate: "fel" }] },
      ],
    },
  ],
  multipleAddresses: false,
};

describe("SRV Återvinning", () => {
  it("reads upcoming pickups, sorted, without duplicates or past dates", () => {
    const p = parseSrvSchedule(sample, new Date(2026, 9, 19, 12));
    expect(p.map((x) => `${x.date.getFullYear()}-${x.date.getMonth() + 1}-${x.date.getDate()} ${x.type}`)).toEqual([
      "2026-10-23 Matavfall",
      "2026-10-23 Restavfall",
      "2026-10-30 Matavfall",
      "2026-11-6 Restavfall",
      "2027-3-1 Sophämtning",
    ]);
  });

  it("refuses an unknown answer instead of showing nothing", () => {
    expect(() => parseSrvSchedule({ hits: [] })).toThrow(/okänt format/);
    expect(parseSrvSchedule({ results: [] })).toEqual([]);
  });

  it("splits a suggestion into street and city", () => {
    expect(splitSrvAddress("Skolvägen 10, 13760 TUNGELSTA")).toEqual({ street: "Skolvägen 10", city: "TUNGELSTA" });
    expect(splitSrvAddress("Centralgatan 2, 149 32 Nynäshamn")).toEqual({ street: "Centralgatan 2", city: "NYNÄSHAMN" });
    expect(splitSrvAddress("Hanvedens allé 78")).toEqual({ street: "Hanvedens allé 78", city: "" });
  });
});
