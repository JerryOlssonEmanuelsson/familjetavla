// The board against a real Home Assistant (HA_URL + HA_TOKEN). Run only from the PRIVATE test repo:
// it lists what the board finds in that home. It only reads – nothing is switched or started.
// Writes a Markdown report to $REPORT (default ha-report.md); exit 1 if something the board needs fails.
import { writeFileSync } from "node:fs";
import { ha, haConnection } from "../server/dist/connectors/ha.js";
import { carCharging, discover, readRegistry } from "../server/dist/discovery.js";
import { initHaSocket } from "../server/dist/connectors/haws.js";

const url = process.env.HA_URL;
const token = process.env.HA_TOKEN;
if (!url || !token) {
  console.log("HA_URL/HA_TOKEN saknas – hoppar över.");
  process.exit(0);
}
const conn = haConnection({ url, token });
const ok = [];
const problems = [];
async function check(name, fn) {
  try {
    ok.push(`**${name}:** ${await fn()}`);
  } catch (e) {
    problems.push(`**${name}:** ${e.message}`);
  }
}

let states = [];
let all = [];
await check("Anslutning", async () => {
  await ha.ping(conn);
  states = await ha.states(conn);
  const cfg = await fetch(`${url.replace(/\/+$/, "")}/api/config`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  return `Home Assistant ${cfg.version ?? "?"}, ${states.length} entiteter`;
});
if (!states.length) {
  writeFileSync(process.env.REPORT ?? "ha-report.md", `## Behöver ses över\n${problems.map((p) => `- ${p}`).join("\n")}\n`);
  console.log(problems.join("\n"));
  process.exit(1);
}

// The board reads the registry over the websocket when it is connected, else in parts over REST.
await check("Register via REST (reserv)", async () => {
  const viaRest = await readRegistry(conn);
  return `${viaRest.length} entiteter, ${viaRest.filter((x) => x.d).length} med enhet, ${viaRest.filter((x) => x.a).length} med rum`;
});
const quiet = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return quiet; } };
const sock = initHaSocket(quiet);
sock.start(conn);
for (let i = 0; i < 40 && !(sock.connected && sock.states.size); i++) await new Promise((r) => setTimeout(r, 250));
await check("Register via websocket", async () => {
  if (!sock.connected) throw new Error("websocket ansluter inte – kontrollera att adressen tillåter websocket (wss://…/api/websocket)");
  all = await readRegistry(conn);
  return `${all.length} entiteter, ${all.filter((x) => x.d).length} med enhet, ${all.filter((x) => x.a).length} med rum`;
});
if (!all.length) all = await readRegistry(conn).catch(() => []);

const found = all.length ? discover(all) : null;
const byDomain = (d) => states.filter((s) => s.entity_id.startsWith(`${d}.`));

await check("Lampor", async () => {
  const lights = byDomain("light");
  const off = lights.filter((s) => s.state === "unavailable").length;
  const dim = lights.filter((s) => (s.attributes.supported_color_modes ?? []).some((m) => m !== "onoff")).length;
  const groups = found?.lightGroups ?? [];
  return `${lights.length} lampor (${dim} dimbara, ${off} otillgängliga), ${groups.length} rum/grupper: ${groups.map((g) => `${g.name} (${g.entities.length})`).join(", ") || "-"}`;
});

await check("Bilar", async () => {
  const cars = found?.cars ?? [];
  if (!cars.length) return "inga bilar hittade";
  return cars
    .map((c) => {
      const ents = all.filter((x) => x.d && x.d === all.find((y) => y.e === c.battery)?.d);
      const ch = carCharging(ents, c.deviceName);
      const how = ch.switch ? `laddknapp (${ch.switch.name}, ${ch.switch.on ? "laddar" : "laddar inte"})` : ch.start || ch.stop ? `start/stopp-knappar` : "ingen laddknapp";
      return `${c.name}: batteri ${states.find((s) => s.entity_id === c.battery)?.state ?? "?"} %, ${how}, laddschema ${ch.schedule.length} st${ch.schedule.length ? ` (${ch.schedule.map((s) => `${s.name}=${s.value}`).join(", ")})` : ""}`;
    })
    .join("; ");
});

await check("Kalendrar", async () => {
  const cals = byDomain("calendar");
  const now = new Date();
  const to = new Date(now.getTime() + 7 * 86_400_000);
  const rows = [];
  for (const c of cals.slice(0, 15)) {
    let err = "";
    const evs = await ha.calendarEvents(conn, c.entity_id, now, to).catch((e) => ((err = e.message), null));
    rows.push(evs ? `${c.attributes.friendly_name ?? c.entity_id}: ${evs.length} händelser (${evs.filter((e) => e.description).length} med anteckningar)` : `${c.entity_id} (${c.state}): ${err}`);
  }
  return `${cals.length} kalendrar – ${rows.join("; ") || "-"}`;
});

await check("Inköpslistor", async () => {
  const lists = byDomain("todo");
  const rows = [];
  for (const l of lists.slice(0, 5)) {
    const items = await ha.todoItems(conn, l.entity_id).catch(() => null);
    rows.push(items ? `${l.attributes.friendly_name ?? l.entity_id}: ${items.filter((i) => i.status === "needs_action").length} kvar` : `${l.entity_id}: kunde inte läsas`);
  }
  return rows.join("; ") || "inga listor";
});

const services = await ha.services(conn).catch(() => []);
const phones = Object.keys(services.find((s) => s.domain === "notify")?.services ?? {}).filter((n) => n.startsWith("mobile_app")).length;
await check("Övrigt tavlan hittar", async () =>
  [
    `temperaturer ${found?.temps.length ?? 0}`,
    `värme/klimat ${found?.climates.length ?? 0}`,
    `energi: ${Object.keys(found?.energy ?? {}).join(", ") || "-"}`,
    `elprissensorer ${found?.priceSensors.length ?? 0}`,
    `knappar ${found?.buttons.length ?? 0}`,
    `enhetskort ${found?.deviceCards.length ?? 0}`,
    `personer ${byDomain("person").length}`,
    `telefoner för påminnelser ${phones}`,
  ].join(", "),
);

const report = [
  problems.length ? "## Behöver ses över\n" + problems.map((p) => `- ${p}`).join("\n") : "## Home Assistant: allt fungerar",
  "\n## Det tavlan hittar\n" + ok.map((o) => `- ${o}`).join("\n"),
  "\n_Testet läser bara – inget tänds, släcks eller startas._",
].join("\n");
writeFileSync(process.env.REPORT ?? "ha-report.md", report + "\n");
console.log(report);
sock.stop();
process.exit(problems.length ? 1 : 0);
