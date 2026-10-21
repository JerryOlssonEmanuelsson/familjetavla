import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { exportSecrets, importBackup, loadConfig, loadLocal } from "./store.js";
import type { Config } from "./types.js";
import { VERSION } from "./version.js";

/**
 * A backup file of the board's settings (people, calendars, care schedules, choices) and local lists.
 * Passwords and tokens only come along when a backup password is given, and then encrypted with it
 * (scrypt + AES-256-GCM) – the file alone never reveals them.
 */
export interface BackupFile {
  app: "familjetavla";
  version: string;
  created: string;
  config: Config;
  local: ReturnType<typeof loadLocal>;
  /** "salt.iv.tag.data" (base64), only with a backup password. */
  secrets?: string;
}

const derive = (password: string, salt: Buffer) => scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });

export function makeBackup(password?: string, now = new Date()): BackupFile {
  const file: BackupFile = { app: "familjetavla", version: VERSION, created: now.toISOString(), config: loadConfig(), local: loadLocal() };
  if (password) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", derive(password, salt), iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(exportSecrets()), "utf8"), cipher.final()]);
    file.secrets = [salt, iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
  }
  return file;
}

export function restoreBackup(file: unknown, password?: string): { secrets: boolean } {
  const b = file as Partial<BackupFile>;
  if (!b || b.app !== "familjetavla" || typeof b.config !== "object" || !b.config || !Array.isArray(b.config.people)) {
    throw new Error("Det här är ingen säkerhetskopia från Familjetavla.");
  }
  let secrets: Record<string, string> | undefined;
  if (b.secrets) {
    if (!password) throw new Error("Säkerhetskopian har lösenord – skriv lösenordet du valde när den sparades.");
    const [salt, iv, tag, enc] = b.secrets.split(".").map((x) => Buffer.from(x, "base64"));
    try {
      const d = createDecipheriv("aes-256-gcm", derive(password, salt), iv);
      d.setAuthTag(tag);
      secrets = JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
    } catch {
      throw new Error("Fel lösenord för säkerhetskopian.");
    }
  }
  importBackup(b.config as Config, b.local ?? {}, secrets);
  return { secrets: Boolean(secrets) };
}
