import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { HOME_WIDGETS, TAB_IDS, type Config, type SecretKey } from "./types.js";

/**
 * All state lives in one data directory (/data in the add-on, ./data in dev):
 *   config.json  – non-secret settings, safe to back up and inspect
 *   secrets.json – passwords, tokens and private calendar URLs, AES-256-GCM encrypted
 *   secret.key   – the encryption key, created on first start (chmod 600)
 *   local.json   – the built-in shopping list when Home Assistant's is not used
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

export function loadLocalList(): LocalItem[] {
  return readJson<{ shopping?: LocalItem[] }>(LOCAL_FILE, {}).shopping ?? [];
}

export function saveLocalList(items: LocalItem[]) {
  writeAtomic(LOCAL_FILE, JSON.stringify({ shopping: items }, null, 2));
}
