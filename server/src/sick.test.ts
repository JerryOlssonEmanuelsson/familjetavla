import { describe, expect, it } from "vitest";
import { applySick } from "./sick.js";
import type { SourcedEvent } from "./sources.js";

const ev = (title: string, personId: string, d: number, sourceId = "cal"): SourcedEvent => ({
  title,
  personId,
  sourceId,
  start: new Date(2026, 9, d, 8),
  end: new Date(2026, 9, d, 9),
  allDay: false,
  category: "family",
});

describe("sjuk/VAB", () => {
  it("stryker barnets förskola, skola och träning den dagen och sätter en Sjuk-markering", () => {
    const events = [ev("Förskola", "maja", 21, "care:maja"), ev("F14 – Träning", "maja", 21), ev("Förskola", "maja", 22, "care:maja"), ev("Matematik", "ella", 21)];
    const { kept, hidden } = applySick(events, { maja: ["2026-10-21"] });
    expect(hidden.map((e) => e.title)).toEqual(["Förskola", "F14 – Träning"]);
    expect(kept.map((e) => `${e.title}|${e.personId}`)).toEqual(["Förskola|maja", "Matematik|ella", "Sjuk – hemma|maja"]);
    expect(kept.at(-1)).toMatchObject({ sourceId: "sick", allDay: true });
  });
});
