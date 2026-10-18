import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { HOME_WIDGETS, TAB_IDS, type Config, type SecretKey } from "./types.js";

/**
 * All state lives in one data directory (/data in the add-on, ./data in dev):
 *   config.json  – non-secret settings, safe to back up and inspect
 *   secrets.json – passwords, tokens and private calendar URLs, AES-256-GCM encrypted
 *   secret.key   – the encryption key, created on first start (chmod 600)
 *   local.json   – the built-in shopping list (when Home Assistant's is not used) and travel choices
 */
export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");

const CONFIG_FILE = join(DATA_DIR, "config.json");
const SECRETS_FILE = join(DATA_DIR, "secrets.json");
const KEY_FILE = join(DATA_DIR, "secret.key");
const LOCAL_FILE = join(DATA_DIR, "local.json");

export function defaultConfig(): Config {
  return {
    version: 1,
    setupComplete: false,
    household: { name: "Familjen" },
    people: [],
    calendars: [],
    integrations: [{ id: "price", category: "price", provider: "spot", settings: { area: "SE3" } }],
    shopping: { source: "local", mappings: {} },
    electricity: { cheapHours: 4, markupOre: 0, gridOre: 0, taxOre: 0, vat: false },
    ha: { mode: process.env.SUPERVISOR_TOKEN ? "supervisor" : "none" },
    schedules: [],
    entities: { cars: [], energy: {}, lights: [], temps: [], lightGroups: [], buttons: [], climates: [], deviceCards: [], graphs: [] },
    dashboard: {
      accent: "#34e0a1",
      theme: "auto",
      home: HOME_WIDGETS.map((id) => ({ id, on: !["temps", "energy", "climates"].includes(id) })),
      tabs: TAB_IDS.map((id) => ({ id, on: true })),
      nightFrom: "22:00",
      nightTo: "06:00",
      idleMinutes: 10,
    },
  };
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function writeAtomic(file: string, data: string, mode?: number) {
  ensureDir();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data, { encoding: "utf8", mode });
  renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

// ---------- Config ----------

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const stored = readJson<Partial<Config>>(CONFIG_FILE, {});
  // Shallow-merge onto defaults so new fields in later versions get sane values.
  const base = defaultConfig();
  cached = {
    ...base,
    ...stored,
    household: { ...base.household, ...stored.household },
    shopping: { ...base.shopping, ...stored.shopping },
    electricity: { ...base.electricity, ...stored.electricity },
    ha: { ...base.ha, ...stored.ha },
    entities: { ...base.entities, ...stored.entities },
    dashboard: { ...base.dashboard, ...stored.dashboard },
  } as Config;
  // Widgets/tabs added in later versions are appended (off for widgets, on for tabs).
  const d = cached.dashboard;
  // "now" (the big Nu-zon) is the headline of the 2026 layout, so it goes first and on.
  if (!d.home.some((w) => w.id === "now")) d.home.unshift({ id: "now", on: true });
  for (const id of HOME_WIDGETS) if (!d.home.some((w) => w.id === id)) d.home.push({ id, on: false });
  for (const id of TAB_IDS) if (!d.tabs.some((t) => t.id === id)) d.tabs.push({ id, on: true });
  return cached;
}

export function saveConfig(config: Config) {
  cached = config;
  writeAtomic(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ---------- Secrets ----------

function key(): Buffer {
  ensureDir();
  if (!existsSync(KEY_FILE)) {
    writeFileSync(KEY_FILE, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {
    /* read-only fs: ignore */
  }
  return Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function secretsFile(): Record<string, string> {
  return readJson<Record<string, string>>(SECRETS_FILE, {});
}

export function getSecret(k: SecretKey): string | undefined {
  const blob = secretsFile()[k];
  if (!blob) return undefined;
  try {
    return decrypt(blob);
  } catch {
    return undefined;
  }
}

export function setSecret(k: SecretKey, value: string | null) {
  const all = secretsFile();
  if (value === null || value === "") delete all[k];
  else all[k] = encrypt(value);
  writeAtomic(SECRETS_FILE, JSON.stringify(all, null, 2), 0o600);
}

export function listSecretKeys(): string[] {
  return Object.keys(secretsFile());
}

// ---------- Local shopping list ----------

export interface LocalItem {
  id: string;
  name: string;
  done: boolean;
}

export interface LocalFile {
  shopping?: LocalItem[];
  /** Dit/hem-val per händelse, nyckel = travelKey(). */
  travel?: Record<string, import("./types.js").TravelChoice>;
}

export function loadLocal(): LocalFile {
  return readJson<LocalFile>(LOCAL_FILE, {});
}

/** Merge into local.json so the shopping list and travel choices never overwrite each other. */
export function saveLocal(part: LocalFile) {
  writeAtomic(LOCAL_FILE, JSON.stringify({ ...loadLocal(), ...part }, null, 2));
}

export function loadLocalList(): LocalItem[] {
  return loadLocal().shopping ?? [];
}

export function saveLocalList(items: LocalItem[]) {
  saveLocal({ shopping: items });
}

// ---------- Photo frame ----------

export const PHOTO_DIR = join(DATA_DIR, "photos");
const PHOTO_NAME = /^[a-z0-9-]{1,40}\.(jpe?g|png|webp)$/i;

export function listPhotos(): string[] {
  try {
    return readdirSync(PHOTO_DIR).filter((f) => PHOTO_NAME.test(f)).sort();
  } catch {
    return [];
  }
}

export function savePhoto(name: string, data: Buffer) {
  if (!PHOTO_NAME.test(name)) throw new Error("Ogiltigt filnamn");
  if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });
  writeFileSync(join(PHOTO_DIR, name), data);
}

export function deletePhoto(name: string) {
  if (!PHOTO_NAME.test(name)) throw new Error("Ogiltigt filnamn");
  try {
    unlinkSync(join(PHOTO_DIR, name));
  } catch {
    /* already gone */
  }
}

export function photoPath(name: string): string | null {
  if (!PHOTO_NAME.test(name)) return null;
  const p = join(PHOTO_DIR, name);
  return existsSync(p) ? p : null;
}
