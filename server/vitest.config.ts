import { defineConfig } from "vitest/config";

// Date logic is Swedish local time, as in the container (TZ=Europe/Stockholm).
process.env.TZ = "Europe/Stockholm";

export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
