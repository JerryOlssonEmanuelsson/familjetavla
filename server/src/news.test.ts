import { describe, expect, it } from "vitest";
import { newsReminders } from "./news.js";
import type { SchoolNews } from "./types.js";

const n = (id: string, published: string, seen = false): SchoolNews => ({ id, title: `Nyhet ${id}`, text: "", published, files: [], seen });

describe("school news reminders", () => {
  it("shows at most two unread news from the last week", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const r = newsReminders([n("a", "2026-10-20T08:00:00Z"), n("b", "2026-10-19T08:00:00Z", true), n("c", "2026-10-18T08:00:00Z"), n("d", "2026-10-17T08:00:00Z"), n("e", "2026-10-01T08:00:00Z")], now);
    expect(r.map((x) => x.title)).toEqual(["Från skolan: Nyhet a", "Från skolan: Nyhet c"]);
  });
});
