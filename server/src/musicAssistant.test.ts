import { describe, expect, it } from "vitest";
import { isMaPlayer, playerFor, toTile } from "./musicAssistant.js";

describe("Music Assistant", () => {
  it("turns library items into covers, https images only", () => {
    expect(toTile({ uri: "spotify://playlist/abc", name: "Fredagsmys", media_type: "playlist", image: "https://i.scdn.co/x.jpg" })).toEqual({
      uri: "spotify://playlist/abc",
      type: "playlist",
      title: "Fredagsmys",
      subtitle: undefined,
      image: "https://i.scdn.co/x.jpg",
    });
    expect(toTile({ uri: "spotify://album/1", name: "Hello", media_type: "album", artists: [{ name: "Laleh" }], image: "http://x/y.jpg" })).toMatchObject({ subtitle: "Laleh", image: undefined });
    expect(toTile({ uri: "javascript:alert(1)", name: "x", media_type: "track" })).toBeNull();
    expect(toTile({ uri: "spotify://x/1", name: "x", media_type: "folder" })).toBeNull();
  });

  it("knows its own players", () => {
    expect(isMaPlayer({ entity_id: "media_player.kok_2", state: "idle", attributes: { mass_player_type: "player" } } as never)).toBe(true);
    expect(isMaPlayer({ entity_id: "media_player.kok", state: "idle", attributes: {} } as never)).toBe(false);
  });

  it("finds the speaker's Music Assistant player by device, then by name", () => {
    const setup = {
      entryId: "e1",
      players: [
        { e: "media_player.kok_ma", d: "dev-kok", n: "Kök" },
        { e: "media_player.vardagsrum_ma", d: "dev-other", n: "Vardagsrum Sonos" },
      ],
      speakers: { "media_player.kok": "dev-kok", "media_player.sonos": "dev-sonos" } as Record<string, string | null>,
    };
    const names = new Map([["media_player.sonos", "Vardagsrum Sonos"]]);
    expect(playerFor(setup, { entityId: "media_player.kok", name: "Köket" }, names)).toBe("media_player.kok_ma");
    expect(playerFor(setup, { entityId: "media_player.sonos", name: "Vardagsrum" }, names)).toBe("media_player.vardagsrum_ma");
    expect(playerFor(setup, { entityId: "media_player.kok_ma", name: "x" }, names)).toBe("media_player.kok_ma");
    expect(playerFor(setup, { entityId: "media_player.hall", name: "Hall" }, names)).toBeUndefined();
  });
});
