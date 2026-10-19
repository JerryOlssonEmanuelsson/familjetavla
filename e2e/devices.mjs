// Self-check on every device class: no page scroll on tablets, nothing behind the tab bar,
// no sideways overflow, no console errors, readable scale. Writes screenshots + a report.
//   node e2e/devices.mjs [url]   (default: the demo build, docs/demo/familjetavla-demo.html)
// Exit code 1 if any check fails. Screenshots in $SHOTS/devices (default e2e/shots/devices).
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright-core");
const fs = require("node:fs");
const S = `${process.env.SHOTS ?? "e2e/shots"}/devices`;
fs.mkdirSync(S, { recursive: true });
const URL = process.argv[2] ?? pathToFileURL(resolve("docs/demo/familjetavla-demo.html")).href;
const LIST = [
  ["iPad liggande", "iPad Pro 11 landscape", true],
  ["iPad stående", "iPad Pro 11", true],
  ["iPad mini stående", "iPad Mini", true],
  ["Android-platta liggande", "Galaxy Tab S4 landscape", true],
  ["Android-platta stående", "Galaxy Tab S4", true],
  ["Android-mobil", "Pixel 7", false],
  ["iPhone", "iPhone 15 Pro", false],
  ["iPhone SE", "iPhone SE (3rd gen)", false],
  ["iPhone liggande", "iPhone 15 Pro landscape", false],
];
const ROUTES = [["start", ""], ["veckan", "#/sida/veckan"], ["kort", "#/sida/kort"], ["maten", "#/sida/maten"], ["skolan", "#/sida/skolan"], ["komihag", "#/sida/komihag"], ["inkop", "#/sida/inkop"], ["hososs", "#/sida/hososs"], ["energi", "#/flik/energy"], ["bil", "#/flik/cars"], ["ljus", "#/flik/lights"]];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = [];
for (const [name, dev, tablet] of LIST) {
  const d = devices[dev];
  const ctx = await b.newContext({ ...d, locale: "sv-SE", timezoneId: "Europe/Stockholm" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.clock.install({ time: new Date("2026-10-18T16:00:00+02:00") });
  const slug = name.replace(/[^a-zåäö]+/gi, "-").toLowerCase();
  for (const [r, hash] of ROUTES) {
    await p.goto(URL + hash);
    // Measure like a real board: the demo's extra header buttons don't exist there.
    await p.addStyleTag({ content: ".demo-only{display:none!important}" });
    await p.waitForTimeout(1400);
    if (!tablet) await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(300);
    const m = await p.evaluate((tablet) => {
      const de = document.documentElement;
      const out = { more: [...document.querySelectorAll(".fit-more")].map((m) => m.textContent.trim()), pageScroll: de.scrollHeight - window.innerHeight, sideways: de.scrollWidth - window.innerWidth, behind: [], overflow: [], scales: [], small: 0 };
      const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
      if (bar) {
        // Visible content (cards, events, lessons, buttons) that sits under the floating tab bar.
        for (const el of document.querySelectorAll(".board .card, .board .event, .board .lesson, .board .btn, .board h2")) {
          if (el.closest(".tabbar")) continue;
          const r = el.getBoundingClientRect();
          if (r.height === 0) continue;
          // Ignore what is clipped away by a fit area (not visible) – check the visible part only.
          const clip = el.closest(".fit")?.getBoundingClientRect();
          const bottom = clip ? Math.min(r.bottom, clip.bottom) : r.bottom;
          const top = clip ? Math.max(r.top, clip.top) : r.top;
          if (bottom - top < 4) continue;
          if (bottom > bar.top + 2 && top < bar.bottom && r.right > bar.left && r.left < bar.right) out.behind.push((el.textContent || el.className).trim().slice(0, 30));
        }
      }
      for (const f of document.querySelectorAll(".fit")) {
        const z = Number(f.firstElementChild?.style.zoom || 1);
        out.scales.push(Math.round(z * 100));
        if (f.classList.contains("fit-overflow")) out.overflow.push(f.className.replace("fit", "").trim());
      }
      for (const btn of document.querySelectorAll("button, a.btn")) {
        const r = btn.getBoundingClientRect();
        if (r.width && r.height && r.height < 32 && r.top < window.innerHeight && r.bottom > 0) out.small++;
      }
      return out;
    }, tablet);
    await p.screenshot({ path: `${S}/${slug}-${r}.png` });
    const issues = [];
    if (tablet && m.pageScroll > 2) issues.push(`sidan scrollar ${m.pageScroll}px`);
    if (m.sideways > 2) issues.push(`sticker ut ${m.sideways}px åt sidan`);
    if (m.behind.length) issues.push(`bakom flikraden: ${[...new Set(m.behind)].slice(0, 3).join(" | ")}`);
    // "Alla kort" and "Kommande 7 dagar" are the show-everything pages: scrolling there is allowed as a last resort.
    if (tablet && m.overflow.length && !["kort", "veckan"].includes(r)) issues.push(`ryms inte ens på 70 %: ${m.overflow.join(", ")}`);
    const minScale = m.scales.length ? Math.min(...m.scales) : 100;
    report.push({ device: name, route: r, issues, minScale, small: m.small, more: m.more });
  }
  report.push({ device: name, route: "konsol", issues: errors.slice(0, 3), minScale: 100, small: 0 });
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${S}/report.json`, JSON.stringify(report, null, 1));
let bad = 0;
for (const row of report) {
  if (row.issues.length) bad++;
  if (row.issues.length || row.minScale < 85 || row.more?.length) console.log(`${row.issues.length ? "FEL " : "obs "} ${row.device} · ${row.route}: ${row.issues.join("; ") || ""} ${row.minScale < 100 ? `(minsta skala ${row.minScale} %)` : ""} ${row.more?.length ? `[knappar: ${row.more.join(" / ")}]` : ""}`);
}
console.log(`\n${report.length} kontroller, ${bad} med fel`);
if (bad) process.exit(1);
