import { ha, type HaConn, type HaState } from "./connectors/ha.js";

/**
 * Music Assistant (a free Home Assistant app): the family's Spotify playlists, albums and podcasts
 * as covers on the board, played on any speaker – Google/Nest, Sonos, AirPlay, Echo … Home
 * Assistant's own Spotify integration can only browse while something already plays, and Google
 * speakers rarely show up as Spotify Connect devices, so the library goes through Music Assistant.
 */

export const MA_APP = "d5369777_music_assistant";
export const MA_REPO = "https://github.com/music-assistant/home-assistant-addon";

/** Music Assistant marks its own players with this attribute. */
export const isMaPlayer = (s: HaState | undefined) => Boolean(s && s.entity_id.startsWith("media_player.") && (s.attributes as Record<string, unknown>).mass_player_type !== undefined);

export interface Tile {
  uri: string;
  type: MediaType;
  title: string;
  subtitle?: string;
  image?: string;
}

export const MEDIA_TYPES = ["playlist", "album", "artist", "track", "podcast", "audiobook", "radio"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** The shelves on the left, like the car's: what you played last, your playlists, albums, podcasts. */
export const SHELVES = {
  recent: { media_type: "playlist", order_by: "last_played_desc" },
  playlists: { media_type: "playlist", order_by: "name" },
  albums: { media_type: "album", order_by: "timestamp_added_desc" },
  podcasts: { media_type: "podcast", order_by: "name" },
} as const;
export type Shelf = keyof typeof SHELVES;

interface MaItem {
  uri?: string;
  name?: string;
  media_type?: string;
  image?: string | null;
  version?: string;
  artists?: { name?: string }[];
}

export function toTile(x: MaItem): Tile | null {
  const type = MEDIA_TYPES.find((t) => t === x.media_type);
  if (!x.uri || !x.name || !type || !/^[a-z0-9_-]+:\/\/\S{1,300}$/i.test(x.uri)) return null;
  const by = (x.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  return {
    uri: x.uri,
    type,
    title: x.name.slice(0, 80),
    subtitle: (by || (x.version ?? "")).slice(0, 60) || undefined,
    // Only https covers: the board may run on https and must not load mixed content.
    image: x.image && /^https:\/\//.test(x.image) ? x.image : undefined,
  };
}

const tiles = (list: unknown): Tile[] => (Array.isArray(list) ? list.map((x) => toTile(x as MaItem)).filter((t): t is Tile => t !== null) : []);

interface MaSetup {
  entryId: string;
  players: { e: string; d: string | null; n: string }[];
  speakers: Record<string, string | null>;
}

/** Music Assistant's config entry, its players and the device of each board speaker – one template. */
async function setup(conn: HaConn, speakers: string[]): Promise<MaSetup | null> {
  const ids = JSON.stringify(speakers.filter((s) => /^media_player\.[a-z0-9_]+$/.test(s)));
  const tpl = `{% set ns = namespace(p=[], c=none, s=[]) %}{% for e in integration_entities('music_assistant') %}{% if e.startswith('media_player.') %}{% set ns.c = ns.c or config_entry_id(e) %}{% set ns.p = ns.p + [{'e': e, 'd': device_id(e), 'n': state_attr(e, 'friendly_name') or e}] %}{% endif %}{% endfor %}{% for e in ${ids} %}{% set ns.s = ns.s + [[e, device_id(e)]] %}{% endfor %}{{ {'entryId': ns.c, 'players': ns.p, 'speakers': ns.s} | tojson }}`;
  const r = await ha.template(conn, tpl);
  const raw = (typeof r === "string" ? JSON.parse(r) : r) as Omit<MaSetup, "speakers"> & { speakers: [string, string | null][] };
  return raw.entryId ? { ...raw, speakers: Object.fromEntries(raw.speakers) } : null;
}

let cache: { at: number; key: string; value: MaSetup | null } | null = null;
async function cachedSetup(conn: HaConn, speakers: string[]) {
  const key = speakers.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < 5 * 60_000) return cache.value;
  const value = await setup(conn, speakers);
  cache = { at: Date.now(), key, value };
  return value;
}
export function clearMaCache() {
  cache = null;
}

const simple = (n: string) => n.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/**
 * Which Music Assistant player is the board's speaker: the speaker itself if it is one, else the
 * player on the same device (Music Assistant joins its players to the speaker's device), else the
 * one with the same name.
 */
export function playerFor(s: MaSetup, speaker: { entityId: string; name: string }, names: Map<string, string>): string | undefined {
  if (s.players.some((p) => p.e === speaker.entityId)) return speaker.entityId;
  const dev = s.speakers[speaker.entityId];
  const byDevice = dev ? s.players.find((p) => p.d === dev) : undefined;
  if (byDevice) return byDevice.e;
  const want = [speaker.name, names.get(speaker.entityId) ?? ""].map(simple).filter(Boolean);
  return s.players.find((p) => want.includes(simple(p.n)))?.e;
}

const respond = async (conn: HaConn, service: string, data: Record<string, unknown>) =>
  ((await ha.service(conn, "music_assistant", service, data, true)) as { service_response?: Record<string, unknown> }).service_response ?? {};

export async function library(conn: HaConn, speakers: string[], shelf: Shelf, offset = 0): Promise<Tile[]> {
  const s = await cachedSetup(conn, speakers);
  if (!s) throw new Error("Music Assistant finns inte i Home Assistant.");
  const r = await respond(conn, "get_library", { config_entry_id: s.entryId, ...SHELVES[shelf], limit: 60, offset });
  return tiles(r.items);
}

export async function search(conn: HaConn, speakers: string[], q: string): Promise<Tile[]> {
  const s = await cachedSetup(conn, speakers);
  if (!s) throw new Error("Music Assistant finns inte i Home Assistant.");
  const r = await respond(conn, "search", { config_entry_id: s.entryId, name: q, media_type: ["playlist", "artist", "album", "track", "podcast"], limit: 8 });
  // Playlists and artists first – what a family picks from a wall – then albums, songs and podcasts.
  return ["playlists", "artists", "albums", "tracks", "podcasts"].flatMap((k) => tiles(r[k]));
}

export async function playOn(conn: HaConn, states: Map<string, HaState>, speaker: { entityId: string; name: string }, tile: { uri: string; type: MediaType }) {
  const s = await cachedSetup(conn, [speaker.entityId]);
  if (!s) throw new Error("Music Assistant finns inte i Home Assistant.");
  const names = new Map([...states.values()].map((x) => [x.entity_id, String((x.attributes as { friendly_name?: string }).friendly_name ?? "")]));
  const player = playerFor(s, speaker, names);
  if (!player) throw new Error(`Music Assistant känner inte igen ${speaker.name}. Lägg till högtalaren i Music Assistant, eller välj dess Music Assistant-spelare under Huset → Musik.`);
  // A soundbar or speaker in standby: wake it first (any brand that Home Assistant can turn on).
  if (states.get(player)?.state === "off") await ha.service(conn, "media_player", "turn_on", { entity_id: player }).catch(() => undefined);
  await ha.service(conn, "music_assistant", "play_media", { entity_id: player, media_id: tile.uri, media_type: tile.type, enqueue: "replace" });
  return player;
}
