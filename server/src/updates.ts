import { getText } from "./http.js";
import { VERSION } from "./version.js";

/** The add-on's config.yaml on main says which version is published. Set UPDATE_CHECK=off to skip. */
const SOURCE = "https://raw.githubusercontent.com/murre87/familjetavla/main/familjetavla/config.yaml";
const EVERY = 6 * 60 * 60_000;

export function newer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

let latest: string | null = null;
let lastTry = 0;

/** The version running, and the published one once GitHub has answered (shown small in the header). */
export function versionInfo(now = Date.now()): { current: string; latest?: string } {
  updateAvailable(now);
  return { current: VERSION, ...(latest ? { latest } : {}) };
}

/** Answers at once from what is known and checks GitHub in the background now and then – never slows the board. */
export function updateAvailable(now = Date.now()): { latest: string; current: string } | undefined {
  if (process.env.UPDATE_CHECK !== "off" && now - lastTry > EVERY) {
    lastTry = now;
    getText(SOURCE, { timeoutMs: 8000 })
      .then((yaml) => {
        latest = yaml.match(/^version:\s*"?([0-9][0-9.]*)"?/m)?.[1] ?? latest;
      })
      .catch(() => {
        /* offline or GitHub unreachable: say nothing */
      });
  }
  return latest && newer(latest, VERSION) ? { latest, current: VERSION } : undefined;
}
