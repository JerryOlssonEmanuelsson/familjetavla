// Temporary probe: how does June Avfall's EDP search answer? (runs in CI, which can reach it)
const base = "https://minasidor.juneavfall.se/FutureWebJuneBasic/SimpleWastePickup";
const tries = [
  ["form", "Smedjegatan 20, Jönköping"],
  ["form", "Smedjegatan 20"],
  ["query", "Smedjegatan 20"],
  ["both", "Smedjegatan 20"],
  ["form", "Storgatan 12, Huskvarna"],
];
for (const [how, text] of tries) {
  const q = new URLSearchParams({ searchText: text }).toString();
  const url = how === "form" ? `${base}/SearchAdress` : `${base}/SearchAdress?${q}`;
  const init = { method: "POST" };
  if (how !== "query") Object.assign(init, { headers: { "content-type": "application/x-www-form-urlencoded" }, body: q });
  try {
    const r = await fetch(url, init);
    console.log(`${how} "${text}" → ${r.status} ${(await r.text()).slice(0, 300)}`);
  } catch (e) {
    console.log(`${how} "${text}" → ${e.message}`);
  }
}
