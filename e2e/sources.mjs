// Live check of the outside services the board reads without logging in.
//   node e2e/sources.mjs   (needs `npm run build -w server` first)
// - Every waste company in "Sök på adress" (EDP Future), SRV Återvinning, skolmaten.se,
//   elpriset, vädret and postnummer – with real requests.
// - Test addresses are read from Waste Collection Schedule's own sources, so they stay current.
// - Those upstream files are also watched: a change means our port should be looked over.
// Writes a Markdown report to $REPORT (default sources-report.md); exit 1 if anything fails.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { EDP_PARKED, EDP_PROVIDERS, edpSchedule, edpSearch, srvSchedule, srvSuggest } from "../server/dist/connectors/waste.js";
import { fetchPrices } from "../server/dist/connectors/elpris.js";
import { forecast } from "../server/dist/connectors/weather.js";
import { lookupPostcode } from "../server/dist/connectors/geo.js";
import { skolmaten, vklass } from "../server/dist/providers/school.js";

const cfg = JSON.parse(readFileSync(new URL("../.github/upstream-sources.json", import.meta.url), "utf8"));
const problems = [];
const ok = [];
const day = (d) => d.toISOString().slice(0, 10);

// ---- Upstream files: fetch once, watch the hash, read test addresses ----
const upstream = {};
for (const [file, info] of Object.entries(cfg.files)) {
  const raw = `https://raw.githubusercontent.com/${cfg.repo}/master/${cfg.path}/${file}`;
  try {
    const res = await fetch(raw);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    upstream[file] = text;
    const sha = createHash("sha256").update(text).digest("hex");
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

/** Test cases in a Waste Collection Schedule source: [{ street_address, url, service_provider }]. */
function testCases(text = "") {
  const block = /TEST_CASES\s*=\s*\{([\s\S]*?)\n\}/.exec(text)?.[1] ?? "";
  return [...block.matchAll(/\{([^{}]*)\}/g)].map(([, body]) => {
    const get = (k) => new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(body)?.[1];
    return { address: get("street_address"), url: get("url"), sp: get("service_provider") };
  });
}
const norm = (u = "") => u.toLowerCase().replace(/\/+$/, "");
const edpEvent = upstream["edpevent_se.py"] ?? "";
const spUrl = Object.fromEntries([...edpEvent.matchAll(/"([\w-]+)":\s*\{[^{}]*?"api_url":\s*"([^"]+)"/g)].map(([, k, u]) => [k, norm(u)]));

function addressesFor(key, apiUrl) {
  const own = cfg.edp?.[key];
  if (own) {
    const filter = own.filter ? new RegExp(own.filter, "i") : null;
    return testCases(upstream[own.file]).map((t) => t.address).filter((a) => a && (!filter || filter.test(a)));
  }
  return testCases(edpEvent)
    .filter((t) => t.address && (norm(t.url) === norm(apiUrl) || spUrl[t.sp] === norm(apiUrl)))
    .map((t) => t.address);
}

// ---- Every EDP Future company in the wizard's list (and the parked ones) ----
const edpRows = [];
const parkedNotes = [];
for (const [key, p] of [...Object.entries(EDP_PROVIDERS), ...Object.entries(EDP_PARKED)]) {
  const isParked = key in EDP_PARKED;
  const addresses = [...new Set([...(cfg.edp?.[key]?.extra ?? []), ...addressesFor(key, p.apiUrl)])].slice(0, 4);
  if (!addresses.length) {
    if (isParked) { parkedNotes.push(`${p.title}: ingen testadress`); continue; }
    problems.push(`**${p.title}:** ingen testadress finns – lägg till en under edp.${key}.extra i .github/upstream-sources.json.`);
    edpRows.push(`| ${p.title} | – | ingen testadress |`);
    continue;
  }
  const tried = [];
  let done = false;
  for (const address of addresses) {
    try {
      const found = await edpSearch(p.apiUrl, address);
      if (!found.length) {
        tried.push(`"${address}": ingen träff`);
        continue;
      }
      const pickups = await edpSchedule(p.apiUrl, found[0]);
      if (!pickups.length) {
        tried.push(`"${found[0]}": inga kommande hämtningar`);
        continue;
      }
      if (isParked) problems.push(`**${p.title} fungerar igen** (${found[0]} → ${pickups.length} kärl) – flytta tillbaka från EDP_PARKED till EDP_PROVIDERS.`);
      else ok.push(`${p.title}: ${found[0]} → ${pickups.length} kärl, nästa ${day(pickups[0].date)} ${pickups[0].type}`);
      edpRows.push(`| ${p.title} | ${found[0]} | ✅ ${pickups.length} kärl, nästa ${day(pickups[0].date)} |`);
      done = true;
      break;
    } catch (e) {
      tried.push(`"${address}": ${e.message}`);
    }
  }
  if (!done) {
    // Tell "the site is down or blocks us" apart from "the site answers but finds nothing".
    try {
      const r = await fetch(p.apiUrl, { signal: AbortSignal.timeout(15_000) });
      tried.push(`startsidan svarar ${r.status}`);
    } catch (e) {
      tried.push(`startsidan nås inte (${e.cause?.code ?? e.cause?.message ?? e.message})`);
    }
    if (isParked) {
      parkedNotes.push(`${p.title}: fortfarande ur funktion – ${tried[tried.length - 1]}`);
      continue;
    }
    problems.push(`**${p.title} fungerar inte:** ${tried.join("; ")}`);
    edpRows.push(`| ${p.title} | ${addresses[0]} | ❌ ${tried[tried.length - 1]} |`);
  }
}

// ---- SRV Återvinning ----
try {
  const found = await srvSuggest("Skolvägen 10");
  const pick = found[0];
  if (!pick) throw new Error("adressförslagen gav inga träffar för Skolvägen 10");
  const pickups = await srvSchedule(pick);
  if (!pickups.length) throw new Error(`inga kommande hämtningar för ${pick}`);
  ok.push(`SRV: ${pick} → ${pickups.length} hämtningar, nästa ${day(pickups[0].date)} ${pickups[0].type}`);
} catch (e) {
  problems.push(`**SRV Återvinning fungerar inte:** ${e.message}. Jämför med srvatervinning_se.py.`);
}

// ---- Other public services ----
async function check(name, fn) {
  try {
    ok.push(`${name}: ${await fn()}`);
  } catch (e) {
    problems.push(`**${name} fungerar inte:** ${e.message}`);
  }
}
await check("Elpris (elprisetjustnu.se)", async () => {
  const p = await fetchPrices("SE3");
  if (!p.length) throw new Error("inga priser");
  return `${p.length} timmar för SE3`;
});
await check("Väder (Open-Meteo)", async () => {
  const f = await forecast(57.78, 14.16);
  if (!f) throw new Error("ingen prognos");
  return "prognos för Jönköping";
});
await check("Postnummer (OpenStreetMap)", async () => {
  const r = await lookupPostcode("55318");
  if (!/jönköping/i.test(r.municipality ?? r.place ?? "")) throw new Error(`55318 gav ${r.place}/${r.municipality}`);
  return `55318 → ${r.place}, ${r.municipality}, sophämtning: ${r.wasteProvider ?? "–"}`;
});
for (const url of cfg.skolmaten ?? []) {
  await check(`Skolmaten.se (${url})`, async () => {
    const ctx = { integration: {}, settings: { url }, str: (k) => (k === "url" ? url : ""), secret: () => undefined, remember: () => {} };
    const now = new Date();
    const { food } = await skolmaten.fetch(ctx, now, new Date(now.getTime() + 14 * 86_400_000));
    if (!food.length) throw new Error("ingen mat de kommande två veckorna");
    return `${food.length} dagar, t.ex. ${food[0].dishes[0]}`;
  });
}

// ---- Vklass with a real account (repository secrets VKLASS_USERNAME / VKLASS_PASSWORD) ----
// Only counts are reported – never names or other details from the account.
if (process.env.VKLASS_USERNAME && process.env.VKLASS_PASSWORD) {
  await check("Vklass (riktigt konto)", async () => {
    const settings = { username: process.env.VKLASS_USERNAME };
    const ctx = { integration: {}, settings, str: (k) => settings[k] ?? "", secret: (k) => (k === "password" ? process.env.VKLASS_PASSWORD : undefined), remember: () => {} };
    const now = new Date();
    const r = await vklass.fetch(ctx, now, new Date(now.getTime() + 14 * 86_400_000));
    const kids = new Set([...r.events.map((e) => e.child), ...r.food.map((f) => f.child)].filter(Boolean)).size;
    if (!kids) throw new Error("inloggningen gick men inga barn hittades");
    if (!r.events.length && !r.food.length) throw new Error(`${kids} barn men varken schema eller mat de kommande två veckorna`);
    return `${kids} barn, ${r.events.length} lektioner/händelser (${r.events.filter((e) => e.gym).length} med idrott), ${r.food.length} dagar mat, ${r.care?.length ?? 0} omsorgstider – två veckor framåt`;
  });
} else {
  ok.push("Vklass: hoppas över (inga VKLASS_USERNAME/VKLASS_PASSWORD i repots hemliga nycklar)");
}

const report = [
  problems.length ? "## Behöver ses över\n" + problems.map((p) => `- ${p}`).join("\n") : "## Allt fungerar",
  "\n## Sopor – Sök på adress\n| Renhållare | Provad adress | Resultat |\n|---|---|---|\n" + edpRows.join("\n"),
  parkedNotes.length ? "\n## Ej valbara (provas varje vecka)\n" + parkedNotes.map((p) => `- ${p}`).join("\n") : "",
  ok.length ? "\n## OK\n" + ok.map((p) => `- ${p}`).join("\n") : "",
].join("\n");
writeFileSync(process.env.REPORT ?? "sources-report.md", report + "\n");
console.log(report);
process.exit(problems.length ? 1 : 0);
