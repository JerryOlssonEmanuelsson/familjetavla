import { describe, expect, it } from "vitest";
import { careTimesFor } from "./custody.js";

describe("rolling care schedule", () => {
  it("repeats a 2-week and a 4-week schedule from the anchor week", () => {
    const two = { days: { "1": "07:30-16:00" }, weeks: [{ "1": "09:00-17:00" }], anchorDate: "2026-10-21" };
    expect(careTimesFor(two, new Date(2026, 9, 19))).toBe("07:30-16:00");
    expect(careTimesFor(two, new Date(2026, 9, 26))).toBe("09:00-17:00");
    expect(careTimesFor(two, new Date(2026, 10, 2))).toBe("07:30-16:00");
    expect(careTimesFor(two, new Date(2026, 9, 12))).toBe("09:00-17:00");
    const four = { days: { "2": "A" }, weeks: [{ "2": "B" }, {}, { "2": "D" }], anchorDate: "2026-12-28" };
    expect([0, 1, 2, 3, 4].map((w) => careTimesFor(four, new Date(2026, 11, 29 + 7 * w)))).toEqual(["A", "B", undefined, "D", "A"]);
    expect(careTimesFor({ days: { "3": "08:00-15:00" } }, new Date(2026, 9, 21))).toBe("08:00-15:00");
  });
});
