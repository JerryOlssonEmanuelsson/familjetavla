// Weekly check of the outside services we depend on without an official API.
//   node e2e/sources.mjs   (needs `npm run build -w server` first)
// 1. Has the Waste Collection Schedule file we ported changed upstream?
// 2. Does SRV Återvinning still answer for a known address?
// Writes a Markdown report to $REPORT (default sources-report.md); exit 1 if anything needs a look.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { EDP_PROVIDERS, edpByAddress, srvSchedule, srvSuggest } from "../server/dist/connectors/waste.js";

const cfg = JSON.parse(readFileSync(new URL("../.github/upstream-sources.json", import.meta.url), "utf8"));
const problems = [];
const ok = [];

for (const [file, info] of Object.entries(cfg.files)) {
  const raw = `https://raw.githubusercontent.com/${cfg.repo}/master/${cfg.path}/${file}`;
  try {
    const res = await fetch(raw);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sha = createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
    if (sha === info.sha256) ok.push(`${file}: oförändrad`);
    else
      problems.push(
        `**${file} har ändrats i Waste Collection Schedule.** Se över ${info.ours} mot ändringen och uppdatera hashen i .github/upstream-sources.json.\n` +
          `  Historik: https://github.com/${cfg.repo}/commits/master/${cfg.path}/${file}\n  Ny sha256: \`${sha}\``,
      );
  } catch (e) {
    problems.push(`${file}: kunde inte hämtas från GitHub (${e.message}).`);
  }
}

// The test address Waste Collection Schedule uses for SRV.
try {
  const found = await srvSuggest("Skolvägen 10");
  const pick = found.find((a) => /TUNGELSTA/i.test(a)) ?? found[0];
  if (!pick) throw new Error("adressförslagen gav inga träffar för Skolvägen 10");
  const pickups = await srvSchedule(pick);
  if (!pickups.length) throw new Error(`inga kommande hämtningar för ${pick}`);
  ok.push(`SRV: ${pick} → ${pickups.length} hämtningar, nästa ${pickups[0].date.toISOString().slice(0, 10)} ${pickups[0].type}`);
} catch (e) {
  problems.push(`**SRV Återvinning svarar inte som väntat:** ${e.message}. Jämför med srvatervinning_se.py i Waste Collection Schedule.`);
}

// EDP Future renhållare with the test addresses Waste Collection Schedule uses.
for (const [key, address] of [["june", "Smedjegatan 20, Jönköping"]]) {
  const p = EDP_PROVIDERS[key];
  try {
    const { building, pickups } = await edpByAddress(p.apiUrl, address);
    if (!pickups.length) throw new Error(`inga kommande hämtningar för ${building}`);
    ok.push(`${p.title}: ${building} → ${pickups.length} kärl, nästa ${pickups[0].date.toISOString().slice(0, 10)} ${pickups[0].type}`);
  } catch (e) {
    problems.push(`**${p.title} svarar inte som väntat:** ${e.message}.`);
  }
}

const report = [
  problems.length ? "## Behöver ses över\n" + problems.map((p) => `- ${p}`).join("\n") : "## Allt fungerar",
  ok.length ? "\n## OK\n" + ok.map((p) => `- ${p}`).join("\n") : "",
].join("\n");
writeFileSync(process.env.REPORT ?? "sources-report.md", report + "\n");
console.log(report);
process.exit(problems.length ? 1 : 0);
