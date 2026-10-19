import { readFileSync } from "node:fs";

/** The version from server/package.json, so it can never drift from the release. */
export const VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
  } catch {
    return "okänd";
  }
})();
