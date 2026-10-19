import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Date logic is Swedish local time, as in the container (TZ=Europe/Stockholm).
process.env.TZ = "Europe/Stockholm";
// Tests that save (middagar, hyllan) write to a throwaway folder, never to ./data.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "familjetavla-test-"));

export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
