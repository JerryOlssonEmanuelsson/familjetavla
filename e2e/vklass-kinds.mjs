// Temporary: which kinds of calendar items does Vklass send (lessons, assignments, events …)?
// Prints field names and the values of short type-like fields only – never titles or text.
import { vklassChildren, vklassLogin, vklassRawEvents } from "../server/dist/connectors/vklass.js";
const s = await vklassLogin(process.env.VKLASS_USERNAME, process.env.VKLASS_PASSWORD);
const kids = await vklassChildren(s);
const now = new Date();
for (const [i, k] of kids.entries()) {
  if (!k.id) { console.log(`barn ${i + 1}: inget schema-id`); continue; }
  const items = await vklassRawEvents(s, k.id, new Date(now.getTime() - 7 * 864e5), new Date(now.getTime() + 21 * 864e5));
  const keys = new Map();
  for (const it of items) for (const [key, v] of Object.entries(it)) {
    const m = keys.get(key) ?? new Map();
    const shown = typeof v === "boolean" || typeof v === "number" ? String(v) : typeof v === "string" && v.length <= 24 && !/\s/.test(v) && !/^\d{4}-/.test(v) ? v : `<${typeof v}${typeof v === "string" ? " " + v.length : ""}>`;
    const tag = /^(title|text|description|name|teacher|room|location)$/i.test(key) ? `<${typeof v}>` : shown;
    m.set(tag, (m.get(tag) ?? 0) + 1);
    keys.set(key, m);
  }
  console.log(`barn ${i + 1}: ${items.length} poster`);
  for (const [key, m] of keys) console.log(`  ${key}: ${[...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v}×${n}`).join("  ")}`);
}
