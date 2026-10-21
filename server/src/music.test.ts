import { describe, expect, it } from "vitest";
import type { HaState } from "./connectors/ha.js";
import { buildMusic, pickStations, playCall, searchStations, stationIndex } from "./music.js";
import type { Config } from "./types.js";

const stations = [
  { name: "P4 Jönköping", url: "https://sverigesradio.se/topsy/direkt/srapi/203.mp3" },
  { name: "RIX FM", url: "http://fm01-ice.stream.khz.se/fm01_mp3" },
];
const cfg = { entities: { speakers: [{ name: "Köket", entityId: "media_player.kok" }, { name: "Vardagsrum", entityId: "media_player.vardagsrum" }], stations } } as unknown as Config;
const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): [string, HaState] => [entity_id, { entity_id, state, attributes } as HaState];

describe("buildMusic", () => {
  it("is absent without speakers", () => {
    expect(buildMusic({ entities: { stations } } as unknown as Config, new Map())).toBeUndefined();
  });

  it("knows which favourite plays where, and the volume", () => {
    const m = buildMusic(
      cfg,
      new Map([
        st("media_player.kok", "playing", { media_content_id: "http://sverigesradio.se/topsy/direkt/srapi/203.mp3?token=1", volume_level: 0.35 }),
        st("media_player.vardagsrum", "unavailable"),
      ]),
    )!;
    expect(m.speakers[0]).toMatchObject({ playing: true, station: 0, title: "P4 Jönköping", volume: 35, offline: false });
    expect(m.speakers[1]).toMatchObject({ playing: false, offline: true });
    expect(m.speakers[1]!.title).toBeUndefined();
    expect(m.stations.map((s) => s.name)).toEqual(["P4 Jönköping", "RIX FM"]);
  });

  it("shows what else is playing, e.g. Spotify from a phone", () => {
    const m = buildMusic(cfg, new Map([st("media_player.kok", "playing", { media_artist: "Veronica Maggio", media_title: "Jag kommer", app_name: "Spotify" })]))!;
    expect(m.speakers[0]).toMatchObject({ title: "Veronica Maggio – Jag kommer", station: undefined });
  });
});

describe("stationIndex", () => {
  it("matches across http/https, query strings and a trailing slash", () => {
    expect(stationIndex(stations, "https://fm01-ice.stream.khz.se/fm01_mp3/")).toBe(1);
    expect(stationIndex(stations, "spotify:track:1")).toBe(-1);
    expect(stationIndex(stations, undefined)).toBe(-1);
  });
});

describe("playCall", () => {
  it("is a plain play_media any speaker understands", () => {
    expect(playCall("media_player.kok", { ...stations[0]!, logo: "https://x/logo.png" })).toEqual({
      domain: "media_player",
      service: "play_media",
      data: {
        entity_id: "media_player.kok",
        media_content_id: stations[0]!.url,
        media_content_type: "music",
        extra: { title: "P4 Jönköping", thumb: "https://x/logo.png" },
      },
    });
  });
});

describe("pickStations", () => {
  it("keeps working streams, Swedish and https first, one per name", () => {
    const hits = pickStations([
      { name: "RIX FM", url_resolved: "http://a/rix", countrycode: "SE", clickcount: 50, lastcheckok: 1, codec: "MP3", bitrate: 128 },
      { name: "RIX  FM", url_resolved: "https://b/rix", countrycode: "SE", clickcount: 10, lastcheckok: 1, favicon: "https://b/logo.png" },
      { name: "Rix FM Bayern", url_resolved: "https://c/x", countrycode: "DE", clickcount: 900, lastcheckok: 1 },
      { name: "Trasig", url_resolved: "https://d/x", countrycode: "SE", clickcount: 999, lastcheckok: 0 },
      { name: "Ingen länk", url_resolved: "", countrycode: "SE", lastcheckok: 1 },
      { name: "Gammal logga", url_resolved: "https://e/x", countrycode: "SE", lastcheckok: 1, favicon: "http://e/logo.png" },
    ]);
    expect(hits.map((h) => h.name)).toEqual(["RIX FM", "Gammal logga", "Rix FM Bayern"]);
    expect(hits[0]).toMatchObject({ url: "https://b/rix", logo: "https://b/logo.png", country: "SE" });
    expect(hits[1]!.logo).toBeUndefined();
  });
});

describe("searchStations", () => {
  it("tries the next mirror when one is down", async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(new URL(url).host);
      if (asked.length === 1) throw new Error("nere");
      return [{ name: "P4 Jönköping", url_resolved: "https://sr/203", countrycode: "SE", lastcheckok: 1 }];
    }) as never;
    const hits = await searchStations("p4 jönköping", fake);
    expect(hits).toHaveLength(1);
    expect(asked).toHaveLength(2);
  });

  it("says so in plain words when the directory is unreachable", async () => {
    const down = (async () => {
      throw new Error("Tidsgräns nådd");
    }) as never;
    await expect(searchStations("rix", down)).rejects.toThrow(/Radiokatalogen svarar inte/);
  });

  it("does not search for a single letter", async () => {
    expect(await searchStations(" p ")).toEqual([]);
  });
});

describe("speaker discovery", () => {
  it("suggests speakers by room, never TVs, Spotify's own player or the home's own groups", async () => {
    const { discover } = await import("./discovery.js");
    const e = (id: string, n: string, a: string | null, m: string | null, extra: Partial<import("./discovery.js").HaEntityInfo> = {}) =>
      ({ e: id, n, a, d: `dev-${id}`, dn: n, m, mo: null, dc: null, u: null, st: "idle", lu: "", ...extra }) as import("./discovery.js").HaEntityInfo;
    const d = discover([
      e("media_player.google_home_mini", "Google Home Mini", "Kök", "Google Inc."),
      e("media_player.sonos_one", "Sonos One", "Vardagsrum", "Sonos"),
      e("media_player.nest_audio", "Nest Audio", "Vardagsrum", "Google Inc."),
      e("media_player.vardagsrum_tv", "Vardagsrum TV", "Vardagsrum", "Samsung", { dc: "tv" }),
      e("media_player.spotify_anna", "Spotify Anna", null, "Spotify AB"),
      e("media_player.mitt_hus", "Mitt hus", null, null, { o: true }),
      e("media_player.gammal", "Gammal", "Hall", "Google Inc.", { st: "unavailable" }),
    ]);
    expect(d.speakers).toEqual([
      { name: "Kök", entityId: "media_player.google_home_mini" },
      { name: "Sonos One", entityId: "media_player.sonos_one" },
      { name: "Nest Audio", entityId: "media_player.nest_audio" },
    ]);
    expect(d.summary).toContain("Högtalare: Kök, Sonos One, Nest Audio");
  });
});
