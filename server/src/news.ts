import type { SchoolData, SourcedEvent } from "./sources.js";
import { loadLocal, saveLocal, type OwnEvent } from "./store.js";
import type { Person, Reminder, SchoolNews } from "./types.js";

const SHORT_MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** News for the board, newest first, with who it is about and whether someone has read it. */
export function buildSchoolNews(news: SchoolData["news"], people: Map<string, Person>): SchoolNews[] {
  const seen = new Set(loadLocal().newsSeen ?? []);
  const unique = new Map<string, SchoolData["news"][number]>();
  for (const n of news) if (!unique.has(n.id)) unique.set(n.id, n);
  return [...unique.values()]
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, 20)
    .map((n) => {
      const p = n.personId ? people.get(n.personId) : undefined;
      const d = n.published ? new Date(n.published) : undefined;
      return {
        id: n.id,
        personId: n.personId,
        who: p?.name,
        color: p?.color,
        title: n.title,
        text: n.text,
        published: n.published,
        date: d ? `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}` : undefined,
        files: n.files.map((f) => ({ name: f.name, url: `api/school/file?u=${encodeURIComponent(f.url)}` })),
        seen: seen.has(n.id),
      };
    });
}

/** Unread news from the last week in Kom ihåg (at most two, the rest are on Skolan). */
export function newsReminders(news: SchoolNews[], now: Date): Reminder[] {
  const week = now.getTime() - 7 * 86_400_000;
  return news
    .filter((n) => !n.seen && (!n.published || Date.parse(n.published) >= week))
    .slice(0, 2)
    .map((n) => ({ icon: "school" as const, title: `Från skolan: ${n.title}`, sub: `${n.who ? `${n.who} · ` : ""}läs på Skolan`, tone: "blue" as const }));
}

export function markNewsSeen(ids: string[]) {
  const all = [...new Set([...ids, ...(loadLocal().newsSeen ?? [])])].slice(0, 200);
  saveLocal({ newsSeen: all });
}

// ---------- Own events ----------

export function loadOwnEvents(): OwnEvent[] {
  return loadLocal().ownEvents ?? [];
}

export function addOwnEvent(e: Omit<OwnEvent, "id">, now = new Date()): OwnEvent {
  const ev = { ...e, id: `own${now.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}` };
  // Old events (more than a week ago) are dropped so the file stays small.
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  saveLocal({ ownEvents: [...loadOwnEvents().filter((x) => x.date >= cutoff), ev] });
  return ev;
}

export function removeOwnEvent(id: string) {
  saveLocal({ ownEvents: loadOwnEvents().filter((e) => e.id !== id) });
}

/** Own events as calendar events, so they show in the week, Nu and Planera veckan like any other. */
export function ownCalendarEvents(): SourcedEvent[] {
  return loadOwnEvents().map((e) => {
    const [y, m, d] = e.date.split("-").map(Number);
    const at = (t?: string) => (t ? new Date(y, m - 1, d, Number(t.slice(0, 2)), Number(t.slice(3, 5))) : new Date(y, m - 1, d));
    const start = at(e.time);
    const end = e.time ? (e.end ? at(e.end) : new Date(start.getTime() + 60 * 60_000)) : new Date(y, m - 1, d + 1);
    return { sourceId: "own", uid: e.id, title: e.title, description: e.note, start, end, allDay: !e.time, personId: e.personId, category: "family" as const };
  });
}
