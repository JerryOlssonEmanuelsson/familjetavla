import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ft-backup-"));

describe("säkerhetskopia", () => {
  it("sparar och återställer inställningar, listor och – med lösenord – inloggningar", async () => {
    const store = await import("./store.js");
    const { makeBackup, restoreBackup } = await import("./backup.js");
    const cfg = store.defaultConfig();
    cfg.people = [{ id: "maja", name: "Maja", color: "#3be6a7", kind: "child" }];
    store.saveConfig(cfg);
    store.saveLocal({ shelf: { maja: ["Blöjor"] } });
    store.setSecret("pin", "1234");

    const plain = makeBackup();
    expect(plain.secrets).toBeUndefined();
    expect(JSON.stringify(plain)).not.toContain("1234");
    const locked = makeBackup("hemligt");
    expect(JSON.stringify(locked)).not.toContain("1234");

    store.saveConfig(store.defaultConfig());
    store.saveLocal({ shelf: {} });
    store.setSecret("pin", null);

    expect(() => restoreBackup(locked)).toThrow(/lösenord/);
    expect(() => restoreBackup(locked, "fel")).toThrow(/Fel lösenord/);
    expect(restoreBackup(locked, "hemligt")).toEqual({ secrets: true });
    expect(store.loadConfig().people.map((p) => p.name)).toEqual(["Maja"]);
    expect(store.loadLocal().shelf).toEqual({ maja: ["Blöjor"] });
    expect(store.getSecret("pin")).toBe("1234");
    expect(() => restoreBackup({ app: "annat" })).toThrow(/ingen säkerhetskopia/);
  });
});
