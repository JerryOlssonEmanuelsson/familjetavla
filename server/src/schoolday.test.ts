import { describe, expect, it } from "vitest";
import { buildSchoolDays } from "./schoolday.js";
import type { SourcedEvent } from "./sources.js";
import type { Person } from "./types.js";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
const lesson = (personId: string, d: number, sh: number, sm: number, eh: number, em: number, extra: Partial<SourcedEvent> = {}): SourcedEvent => ({
  sourceId: "school:vk",
  category: "school",
  personId,
  title: "Lektion",
  allDay: false,
  start: at(d, sh, sm),
  end: at(d, eh, em),
  ...extra,
});
const people = new Map<string, Person>([
  ["ella", { id: "ella", name: "Ella", color: "#5ab8ff", kind: "child" } as Person],
  ["leo", { id: "leo", name: "Leo", color: "#f5c84b", kind: "child" } as Person],
  ["anna", { id: "anna", name: "Anna", color: "#ff8fa3", kind: "adult" } as Person],
]);

describe("Skolan idag", () => {
  const evs = [
    lesson("ella", 20, 8, 10, 9, 0),
    lesson("ella", 20, 13, 0, 14, 30, { gym: true }),
    lesson("leo", 20, 9, 0, 15, 0),
    // Parent meeting in the evening and an all-day item must not move the end time.
    lesson("leo", 20, 18, 0, 19, 0, { title: "Föräldramöte" }),
    lesson("leo", 20, 0, 0, 0, 0, { allDay: true, end: at(21, 0) }),
    lesson("ella", 21, 8, 10, 12, 0),
    { ...lesson("leo", 20, 10, 0, 11, 0), sourceId: "cal:sport" },
  ];

  it("gives first start and last end per child, earliest end first", () => {
    const r = buildSchoolDays(evs, people, at(20, 7))!;
    expect(r.map((x) => [x.name, x.dayLabel, x.start, x.end, x.gym])).toEqual([
      ["Ella", "idag", "08:10", "14:30", true],
      ["Leo", "idag", "09:00", "15:00", false],
    ]);
  });

  it("moves on to the next school day when today is over", () => {
    const r = buildSchoolDays(evs, people, at(20, 15, 30))!;
    expect(r.map((x) => [x.name, x.dayLabel, x.end])).toEqual([["Ella", "imorgon", "12:00"]]);
  });

  it("leaves out days the child is at the other home", () => {
    const r = buildSchoolDays(evs, people, at(20, 7), (e) => e.personId !== "leo")!;
    expect(r.map((x) => x.name)).toEqual(["Ella"]);
  });
});
