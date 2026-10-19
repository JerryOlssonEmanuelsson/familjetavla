import { describe, expect, it } from "vitest";
import { lunchRows, noticeToEvent, schoolSlug } from "./connectors/schoolsoft.js";

describe("SchoolSoft", () => {
  it("reads the school from a pasted address or a plain name", () => {
    expect(schoolSlug("https://sms.schoolsoft.se/engelska/jsp/Login.jsp")).toBe("engelska");
    expect(schoolSlug(" engelska ")).toBe("engelska");
    expect(() => schoolSlug("en skola")).toThrow();
  });

  it("turns a calendar notice into an event with the child's name", () => {
    const e = noticeToEvent({ child: "Leo Andersson", json: { title: "Utflykt", fromDate: "2026-10-21 09:00:00", endDate: "2026-10-21 14:00:00" } })!;
    expect(e.title).toBe("Utflykt");
    expect(e.start.getHours()).toBe(9);
    expect(e.end.getHours()).toBe(14);
    expect(e.allDay).toBe(false);
    expect(e.child).toBe("Leo Andersson");
    const day = noticeToEvent({ json: { title: "Studiedag", allDay: 1, fromDate: "2026-10-23" } })!;
    expect(day.allDay).toBe(true);
    expect(noticeToEvent({ json: { title: "" } })).toBeUndefined();
  });

  it("labels the lunch menu with weekday and date", () => {
    const now = new Date(2026, 9, 19);
    const rows = lunchRows(
      [
        { week: 43, monday: "Köttbullar med potatis", tuesday: "Fiskgratäng\nVegetariskt: Pastagratäng" },
        { week: 43, dishCategoryName: "Vegetarisk", monday: "Vegobullar" },
      ],
      now,
    );
    expect(rows[0]).toEqual({ day: "Måndag 19/10", dishes: ["Köttbullar med potatis", "Vegobullar"] });
    expect(rows[1]).toEqual({ day: "Tisdag 20/10", dishes: ["Fiskgratäng", "Vegetariskt: Pastagratäng"] });
  });

  it("puts week 1 read in December in the next year", () => {
    const rows = lunchRows([{ week: 1, monday: "Soppa" }], new Date(2026, 11, 28));
    expect(rows[0].day).toBe("Måndag 4/1");
  });
});
