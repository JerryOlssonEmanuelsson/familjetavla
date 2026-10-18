// Turns web/dist-demo into one self-contained HTML file (CSS and JS inlined) that can be
// opened directly in a browser or published as a page: docs/demo/familjetavla-demo.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "web/dist-demo");
const html = readFileSync(join(dist, "index.html"), "utf8");

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), "utf8"));
const js = [...html.matchAll(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g)].map((m) =>
  readFileSync(join(dist, m[1]), "utf8").replace(/<\/script/gi, "<\\/script"),
);
const icon = `data:image/svg+xml;base64,${readFileSync(join(root, "web/public/icon.svg")).toString("base64")}`;

const out = `<title>Familjetavla demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#141a33">
<link rel="icon" href="${icon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css.join("\n")}</style>
<div id="root"></div>
<script type="module">${js.join("\n")}</script>
`;

const target = join(root, "docs/demo/familjetavla-demo.html");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out);
console.log(`Skrev ${target} (${Math.round(out.length / 1024)} kB)`);
