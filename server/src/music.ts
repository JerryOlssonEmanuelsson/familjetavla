import type { HaState } from "./connectors/ha.js";
import { getJson } from "./http.js";
import type { Config, Music, RadioStation } from "./types.js";

/**
 * Musik: favourite radio stations played on any speaker Home Assistant knows (Google/Nest,
 * Chromecast, Sonos, Echo via Music Assistant …) with media_player.play_media. Nothing here is
 * brand specific: a station is just a stream URL.
 */

export function buildMusic(cfg: Config, states: Map<string, HaState>): Music | undefined {
  const speakers = cfg.entities.speakers ?? [];
  const stations = cfg.entities.stations ?? [];
  if (!speakers.length) return undefined;
  return {
    speakers: speakers.map((s) => {
      const st = states.get(s.entityId);
      const a = (st?.attributes ?? {}) as { media_content_id?: string; media_title?: string; media_artist?: string; app_name?: string; volume_level?: number };
      const offline = !st || st.state === "unavailable" || st.state === "unknown";
      const playing = st?.state === "playing" || st?.state === "buffering";
      const station = playing ? stationIndex(stations, a.media_content_id) : -1;
      const title = playing ? (station >= 0 ? stations[station]!.name : [a.media_artist, a.media_title].filter(Boolean).join(" – ") || a.app_name) : undefined;
      return {
        entityId: s.entityId,
        name: s.name,
        offline,
        playing,
        title: title || undefined,
        station: station >= 0 ? station : undefined,
        volume: typeof a.volume_level === "number" ? Math.round(a.volume_level * 100) : undefined,
      };
    }),
    stations: stations.map((s, index) => ({ index, name: s.name, logo: s.logo })),
  };
}

/** Which favourite is playing: speakers report the stream URL back, sometimes with a changed scheme or query. */
export function stationIndex(stations: RadioStation[], contentId?: string): number {
  if (!contentId) return -1;
  const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  const id = norm(contentId);
  return stations.findIndex((s) => norm(s.url) === id);
}

/** The service call that starts a station on a speaker. */
export function playCall(speaker: string, station: RadioStation) {
  return {
    domain: "media_player",
    service: "play_media",
    data: {
      entity_id: speaker,
      media_content_id: station.url,
      media_content_type: "music",
      // Shown on speakers with a screen (Nest Hub) and in the Home Assistant app.
      extra: { title: station.name, ...(station.logo ? { thumb: station.logo } : {}) },
    },
  };
}

// ---------- Finding stations ----------

interface RbStation {
  name: string;
  url_resolved: string;
  favicon?: string;
  countrycode?: string;
  codec?: string;
  bitrate?: number;
  lastcheckok?: number;
  clickcount?: number;
}

export interface StationHit extends RadioStation {
  country?: string;
  /** e.g. "MP3 128 kbit/s". */
  quality?: string;
}

/** radio-browser.info: an open directory of ~50 000 stations, all Sveriges Radio and the big commercial ones included. */
const MIRRORS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"];

export async function searchStations(q: string, fetchJson: typeof getJson = getJson): Promise<StationHit[]> {
  const query = q.trim().slice(0, 60);
  if (query.length < 2) return [];
  const path = `/json/stations/search?name=${encodeURIComponent(query)}&hidebroken=true&order=clickcount&reverse=true&limit=40`;
  let last: Error | undefined;
  for (const m of MIRRORS) {
    try {
      return pickStations(await fetchJson<RbStation[]>(m + path, { timeoutMs: 8000 }));
    } catch (e) {
      last = e as Error;
    }
  }
  throw new Error(`Radiokatalogen svarar inte just nu. ${last?.message ?? ""}`.trim());
}

/** Working streams only, Swedish first, one entry per name (the https one when there is a choice). */
export function pickStations(list: RbStation[]): StationHit[] {
  const ok = list.filter((s) => s.lastcheckok !== 0 && /^https?:\/\//.test(s.url_resolved ?? "") && s.name?.trim());
  const rank = (s: RbStation) => (s.countrycode === "SE" ? 0 : 1) * 2 + (s.url_resolved.startsWith("https://") ? 0 : 1);
  const sorted = [...ok].sort((a, b) => rank(a) - rank(b) || (b.clickcount ?? 0) - (a.clickcount ?? 0));
  const seen = new Set<string>();
  const out: StationHit[] = [];
  for (const s of sorted) {
    const name = s.name.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      url: s.url_resolved,
      logo: s.favicon && /^https:\/\//.test(s.favicon) ? s.favicon : undefined,
      country: s.countrycode || undefined,
      quality: [s.codec, s.bitrate ? `${s.bitrate} kbit/s` : ""].filter(Boolean).join(" ") || undefined,
    });
    if (out.length >= 12) break;
  }
  return out;
}
