// Temporary: print the STRUCTURE of the Vklass start page (tags, classes, link paths) to find
// where the menu and care times are. All text is masked except a few known words, so no names
// or personal details end up in the log.
import * as cheerio from "cheerio";
import { vklassLogin, vklassPage } from "../server/dist/connectors/vklass.js";

const KEEP = /^(matsedel|meny|lunch|mat|dagens|vecka|idag|imorgon|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|omsorg|omsorgstid|schema|frånvaro|närvaro|fritids|förskola)$/i;
const mask = (t) => t.split(/\s+/).filter(Boolean).map((w) => (KEEP.test(w.replace(/[^\p{L}]/gu, "")) ? w : /^\d/.test(w) ? "#" : "·")).join(" ").slice(0, 80);
const path = (h = "") => h.replace(/\d+/g, "#").replace(/=[^&#]+/g, "=…");

const s = await vklassLogin(process.env.VKLASS_USERNAME, process.env.VKLASS_PASSWORD);
const html = await vklassPage(s, "/Home/Welcome");
const $ = cheerio.load(html);
console.log(`Welcome: ${html.length} tecken, .vk-student-card: ${$(".vk-student-card").length}`);
console.log("Länkar:", [...new Set($("a[href]").map((_, a) => path($(a).attr("href"))).get())].filter((h) => h.startsWith("/") || h.includes("vklass")).join("  "));
const card = $(".vk-student-card").first();
function walk(el, depth) {
  if (depth > 9) return;
  $(el).children().each((_, c) => {
    const tag = c.tagName;
    if (["script", "style", "svg", "path"].includes(tag)) return;
    const cls = ($(c).attr("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    const own = $(c).contents().filter((__, n) => n.type === "text").text().trim();
    const href = $(c).attr("href");
    console.log(`${"  ".repeat(depth)}<${tag}${cls ? "." + cls : ""}>${href ? ` href=${path(href)}` : ""}${own ? `  "${mask(own)}"` : ""}`);
    walk(c, depth + 1);
  });
}
console.log("--- första barnkortet ---");
walk(card, 0);
