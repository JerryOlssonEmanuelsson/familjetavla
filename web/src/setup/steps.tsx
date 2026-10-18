import { useMemo, useState } from "react";
import { isHome } from "../../../server/src/custody";
import type {
  CalendarCategory,
  CalendarProvider,
  CalendarSource,
  Config,
  Custody,
  Integration,
  IntegrationCategory,
  Person,
  TestResult,
} from "../../../server/src/types";
import { api, type CalendarTest, type Discovery } from "../api";
import { Icon } from "../Icon";
import { EntityPicker, MultiEntityPicker, PALETTE, ProviderForm, ProviderTiles, Result, Select, Text, Toggle, Words, uid } from "./parts";
import type { StepProps } from "./Wizard";

const WEEKDAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];

// ======================= Hem =======================

export function HomeStep({ cfg, set, postcode, setPostcode }: StepProps) {
  const [pnr, setPnr] = useState(cfg.household.postcode ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    setBusy(true);
    setError("");
    try {
      const p = await api.postcode(pnr);
      setPostcode(p);
      const integrations = cfg.integrations.map((i) =>
        i.category === "price" && i.provider === "spot" ? { ...i, settings: { ...i.settings, area: p.area } } : i,
      );
      set({ ...cfg, integrations, household: { ...cfg.household, postcode: p.postcode, place: p.place, municipality: p.municipality, lat: p.lat, lon: p.lon } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <Text label="Vad heter hushållet?" value={cfg.household.name} onChange={(v) => set({ ...cfg, household: { ...cfg.household, name: v } })} placeholder="Familjen Svensson" />
      <div className="row gap" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <Text label="Postnummer" inputMode="numeric" value={pnr} onChange={setPnr} placeholder="123 45" />
        </div>
        <button className="btn" onClick={lookup} disabled={busy || pnr.replace(/\s/g, "").length !== 5}>
          {busy ? "Söker…" : "Hämta"}
        </button>
      </div>
      {error && <Result error={error} />}
      {cfg.household.place && (
        <div className="result">
          <b>
            {cfg.household.place}
            {cfg.household.municipality ? ` · ${cfg.household.municipality}` : ""}
          </b>
          {postcode && (
            <span className="muted">
              Förslag: elområde <b>{postcode.area}</b>
              {postcode.wasteProvider ? " · sophämtning kan hämtas på adress" : ""}. Du kan ändra senare.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ======================= Familjen =======================

function WeekPreview({ custody }: { custody: Custody }) {
  const weeks = useMemo(() => {
    const out: { label: string; home: boolean }[] = [];
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 0; i < 8; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i * 7 + ((custody.handoverDay ?? 1) - 1));
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      const w = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
      out.push({ label: `v${w}`, home: isHome(custody, d) });
    }
    return out;
  }, [custody.mode, custody.anchorDate, custody.handoverDay]);
  return (
    <div className="weeks" aria-label="Kommande veckor">
      {weeks.map((w, i) => (
        <div key={i} className={w.home ? "home" : ""} title={w.home ? "Hemma" : "I andra hemmet"}>
          {w.label}
        </div>
      ))}
    </div>
  );
}

function PersonEditor({ p, onChange, onRemove }: { p: Person; onChange: (p: Person) => void; onRemove: () => void }) {
  const custody = p.custody ?? { mode: "always" as const, handoverDay: 1 as const };
  const setC = (c: Partial<Custody>) => onChange({ ...p, custody: { ...custody, ...c } as Custody });
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row gap" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <Text label={p.kind === "child" ? "Barnets namn" : "Namn"} value={p.name} onChange={(v) => onChange({ ...p, name: v })} />
        </div>
        <button className="btn ghost" aria-label={`Ta bort ${p.name || "person"}`} onClick={onRemove}>
          <Icon name="trashSmall" size={20} />
        </button>
      </div>
      <div className="row gap wrap" role="radiogroup" aria-label="Färg">
        {PALETTE.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={p.color === c}
            aria-label={`Färg ${c}`}
            onClick={() => onChange({ ...p, color: c })}
            style={{ width: 40, height: 40, borderRadius: 20, background: c, border: p.color === c ? "3px solid var(--text)" : "2px solid transparent" }}
          />
        ))}
      </div>
      {p.kind === "child" && (
        <>
          <div className="grid-2">
            <Select
              label="Bor här"
              value={custody.mode}
              onChange={(v) => setC({ mode: v as Custody["mode"], anchorDate: v === "alternating" ? custody.anchorDate ?? new Date().toISOString().slice(0, 10) : custody.anchorDate })}
              options={[
                { value: "always", label: "Alltid" },
                { value: "alternating", label: "Varannan vecka (rekommenderas)" },
                { value: "oddWeeks", label: "Udda veckor" },
                { value: "evenWeeks", label: "Jämna veckor" },
              ]}
              help={custody.mode === "oddWeeks" || custody.mode === "evenWeeks" ? "OBS: 2026 har vecka 53, då blir det två udda veckor i rad. Varannan vecka följer er rytm." : undefined}
            />
            {custody.mode !== "always" && (
              <Select
                label="Bytesdag"
                value={String(custody.handoverDay ?? 1)}
                onChange={(v) => setC({ handoverDay: Number(v) as Custody["handoverDay"] })}
                options={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d[0].toUpperCase() + d.slice(1) }))}
              />
            )}
          </div>
          {custody.mode === "alternating" && (
            <label className="field">
              <span>En dag då {p.name || "barnet"} är hos er</span>
              <input type="date" value={custody.anchorDate ?? ""} onChange={(e) => setC({ anchorDate: e.target.value })} />
            </label>
          )}
          {custody.mode !== "always" && <WeekPreview custody={custody} />}
          <details>
            <summary className="muted" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
              Undantag ({custody.overrides?.length ?? 0}) – bytt helg, lov, klämdag
            </summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {(custody.overrides ?? []).map((o, i) => {
                const setO = (patch: Partial<typeof o>) => setC({ overrides: custody.overrides!.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div className="row gap wrap" key={i}>
                    <label className="field">
                      <span>Från</span>
                      <input type="date" value={o.from} onChange={(e) => setO({ from: e.target.value, to: o.to < e.target.value ? e.target.value : o.to })} />
                    </label>
                    <label className="field">
                      <span>Till</span>
                      <input type="date" value={o.to} min={o.from} onChange={(e) => setO({ to: e.target.value })} />
                    </label>
                    <Select label="Då är barnet" value={o.home ? "home" : "away"} onChange={(v) => setO({ home: v === "home" })} options={[{ value: "home", label: "Hemma" }, { value: "away", label: "I andra hemmet" }]} />
                    <button className="btn small ghost" style={{ alignSelf: "flex-end" }} aria-label="Ta bort undantag" onClick={() => setC({ overrides: custody.overrides!.filter((_, j) => j !== i) })}>
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                );
              })}
              <button
                className="btn small"
                style={{ alignSelf: "flex-start" }}
                onClick={() => {
                  const d = new Date().toISOString().slice(0, 10);
                  setC({ overrides: [...(custody.overrides ?? []), { from: d, to: d, home: true }] });
                }}
              >
                <Icon name="plus" size={18} /> Lägg till undantag
              </button>
              <small className="faint">Tips: en byteskalender (steget Kalendrar) gör samma sak automatiskt.</small>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export function FamilyStep({ cfg, set }: StepProps) {
  const add = (kind: Person["kind"]) =>
    set({
      ...cfg,
      people: [
        ...cfg.people,
        { id: uid("p"), name: "", kind, color: PALETTE[cfg.people.length % PALETTE.length], custody: kind === "child" ? { mode: "always", handoverDay: 1 } : undefined },
      ],
    });
  return (
    <div className="stack">
      {cfg.people.map((p, i) => (
        <PersonEditor
          key={p.id}
          p={p}
          onChange={(np) => set({ ...cfg, people: cfg.people.map((x, j) => (j === i ? np : x)) })}
          onRemove={() => set({ ...cfg, people: cfg.people.filter((_, j) => j !== i) })}
        />
      ))}
      <div className="row gap wrap">
        <button className="btn" onClick={() => add("adult")}>
          <Icon name="plus" size={20} /> Vuxen
        </button>
        <button className="btn" onClick={() => add("child")}>
          <Icon name="plus" size={20} /> Barn
        </button>
      </div>
    </div>
  );
}

// ======================= Home Assistant =======================

export function HaStep({ cfg, set, secrets, setSecrets, resp, setHaOk, saveNow }: StepProps) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const tokenSet = resp.secretsSet.includes("ha.token");
  const test = async () => {
    setError("");
    setResult(null);
    try {
      const r = cfg.ha.mode === "supervisor" ? await api.testHa() : await api.testHa(cfg.ha.url, secrets["ha.token"] ?? undefined);
      setResult(r);
      setHaOk(true);
      await saveNow();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (resp.runtime.supervisor) {
    return (
      <section className="card">
        <div className="result">
          <b>Körs som tillägg i Home Assistant – anslutet automatiskt.</b>
        </div>
        <button className="btn" onClick={test}>
          Testa anslutningen
        </button>
        <Result result={result} error={error} />
      </section>
    );
  }
  return (
    <section className="card">
      <div className="tiles">
        <button
          className={`tile ${cfg.ha.mode === "manual" ? "selected" : ""}`}
          onClick={() => set({ ...cfg, ha: { ...cfg.ha, mode: "manual" } })}
          aria-pressed={cfg.ha.mode === "manual"}
        >
          <b>Ja, anslut</b>
          <small>Adress och långlivad token</small>
        </button>
        <button
          className={`tile ${cfg.ha.mode === "none" ? "selected" : ""}`}
          onClick={() => {
            set({ ...cfg, ha: { mode: "none" } });
            setHaOk(false);
          }}
          aria-pressed={cfg.ha.mode === "none"}
        >
          <b>Jag har inte Home Assistant</b>
          <small>Kalendrar, skola, sopor, inköp och elpris fungerar ändå</small>
        </button>
      </div>
      {cfg.ha.mode === "manual" && (
        <>
          <Text label="Adress till Home Assistant" type="url" value={cfg.ha.url ?? ""} placeholder="http://homeassistant.local:8123" onChange={(v) => set({ ...cfg, ha: { ...cfg.ha, url: v } })} />
          <Text
            label="Långlivad token"
            type="password"
            value={secrets["ha.token"] ?? ""}
            placeholder={tokenSet ? "•••••• sparad – skriv för att byta" : "eyJ…"}
            help="I Home Assistant: klicka på ditt namn nere till vänster → Säkerhet → Långlivade åtkomsttoken → Skapa. Använd en administratör så att automatisk hämtning fungerar."
            onChange={(v) => setSecrets({ ...secrets, "ha.token": v })}
          />
          <button className="btn" onClick={test} disabled={!cfg.ha.url}>
            Testa
          </button>
          <Result result={result} error={error} />
        </>
      )}
    </section>
  );
}

// ======================= Hämta från HA =======================

export function DiscoverStep({ cfg, set }: StepProps) {
  const [d, setD] = useState<Discovery | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState(false);

  const scan = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.discover();
      setD(r);
      const p: Record<string, boolean> = {};
      r.cars.forEach((_, i) => (p[`car${i}`] = true));
      (["solar", "grid", "house", "battery"] as const).forEach((k) => (p[`en.${k}`] = Boolean(r.energy[k])));
      r.climates.forEach((_, i) => (p[`cl${i}`] = true));
      r.deviceCards.forEach((_, i) => (p[`dc${i}`] = true));
      r.lightGroups.forEach((_, i) => (p[`lg${i}`] = true));
      r.temps.slice(0, 3).forEach((_, i) => (p[`t${i}`] = true));
      p.todo = r.todo.length > 0;
      p.waste = r.calendars.some((c) => c.waste);
      p.price = false;
      setPick(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!d) return;
    const on = (k: string) => pick[k];
    const next: Config = structuredClone(cfg);
    next.entities.cars = d.cars.filter((_, i) => on(`car${i}`)).map(({ deviceName: _d, maker: _m, ...c }) => c);
    next.entities.energy = Object.fromEntries((["solar", "grid", "house", "battery"] as const).filter((k) => on(`en.${k}`)).map((k) => [k, d.energy[k]]));
    next.entities.climates = d.climates.filter((_, i) => on(`cl${i}`));
    next.entities.deviceCards = d.deviceCards.filter((_, i) => on(`dc${i}`));
    next.entities.lightGroups = d.lightGroups.filter((_, i) => on(`lg${i}`));
    next.entities.temps = d.temps.filter((_, i) => on(`t${i}`));
    if (on("todo") && d.todo[0]) next.shopping = { ...next.shopping, source: "ha", entityId: d.todo.find((t) => /shop|inköp|handla/i.test(t.entityId + t.name))?.entityId ?? d.todo[0].entityId };
    const wasteCal = d.calendars.find((c) => c.waste);
    if (on("waste") && wasteCal) {
      next.integrations = [...next.integrations.filter((i) => i.category !== "waste"), { id: "waste", category: "waste", provider: "waste-ha", settings: { entityId: wasteCal.entityId } }];
    }
    if (on("price") && d.priceSensors[0]) {
      next.integrations = [...next.integrations.filter((i) => i.category !== "price"), { id: "price", category: "price", provider: "ha-price", settings: { entityId: d.priceSensors[0].entityId } }];
    }
    // Sensible graphs from what was found.
    const series = [
      next.entities.energy.house && { name: "Hus", entityId: next.entities.energy.house, color: "#f1f2fa" },
      next.entities.energy.solar && { name: "Sol", entityId: next.entities.energy.solar, color: "#f5c84b" },
      next.entities.energy.grid && { name: "Nät", entityId: next.entities.energy.grid, color: "#34e0a1" },
    ].filter(Boolean) as { name: string; entityId: string; color: string }[];
    const tempSeries = next.entities.temps.slice(0, 2).map((t, i) => ({ name: t.name, entityId: t.entityId, color: i ? "#8f93b3" : "#f5c84b" }));
    next.entities.graphs = [...(series.length ? [{ title: "Effekt", series }] : []), ...(tempSeries.length ? [{ title: "Temperatur", series: tempSeries }] : [])];
    if (!next.entities.lights.length) {
      next.entities.lights = d.lightGroups.flatMap((g) => g.entities.slice(0, 1).map((e) => ({ name: g.name, entityId: e }))).slice(0, 4);
    }
    set(next);
    setApplied(true);
  };

  const Box = ({ k, label, sub }: { k: string; label: string; sub?: string }) => (
    <label className="check item-row">
      <input type="checkbox" checked={Boolean(pick[k])} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} />
      <span className="grow">
        {label}
        {sub && <small className="faint" style={{ display: "block" }}>{sub}</small>}
      </span>
    </label>
  );

  return (
    <div className="stack">
      <button className="btn primary" onClick={scan} disabled={busy}>
        {busy ? "Söker…" : d ? "Sök igen" : "Hämta från Home Assistant"}
      </button>
      <Result error={error} />
      {d && (
        <>
          <div className="result">
            <b>Hittade:</b>
            <ul>
              {d.summary.length ? d.summary.map((s) => <li key={s}>{s}</li>) : <li>Inget som passar – du kan lägga till manuellt i steget Huset.</li>}
            </ul>
          </div>
          {d.cars.length > 0 && (
            <section className="card">
              <h2>Bilar</h2>
              {d.cars.map((c, i) => (
                <Box key={i} k={`car${i}`} label={c.name} sub={[c.maker, c.range && "räckvidd", c.location && "position", c.climate && "värmestart"].filter(Boolean).join(" · ")} />
              ))}
            </section>
          )}
          {Object.values(d.energy).some(Boolean) && (
            <section className="card">
              <h2>Energi</h2>
              {d.energy.solar && <Box k="en.solar" label="Solel / växelriktare" sub={d.energy.solar} />}
              {d.energy.grid && <Box k="en.grid" label="Elnät (köp/sälj)" sub={d.energy.grid} />}
              {d.energy.house && <Box k="en.house" label="Husets effekt" sub={d.energy.house} />}
              {d.energy.battery && <Box k="en.battery" label="Hembatteri" sub={d.energy.battery} />}
            </section>
          )}
          {(d.climates.length > 0 || d.deviceCards.length > 0) && (
            <section className="card">
              <h2>Värme, varmvatten och spabad</h2>
              {d.climates.map((c, i) => (
                <Box key={c.entityId} k={`cl${i}`} label={c.name} sub={c.controls?.length ? `${c.controls.length} reglage (pumpar, ljus …)` : c.entityId} />
              ))}
              {d.deviceCards.map((c, i) => (
                <Box key={i} k={`dc${i}`} label={c.title} sub={`${c.sensors.length} värden · ${c.controls.length} reglage`} />
              ))}
            </section>
          )}
          {d.lightGroups.length > 0 && (
            <section className="card">
              <h2>Lampor per rum</h2>
              {d.lightGroups.map((g, i) => (
                <Box key={g.name} k={`lg${i}`} label={g.name} sub={`${g.entities.length} lampor`} />
              ))}
            </section>
          )}
          {d.temps.length > 0 && (
            <section className="card">
              <h2>Temperaturer</h2>
              {d.temps.map((t, i) => (
                <Box key={t.entityId} k={`t${i}`} label={t.name} />
              ))}
            </section>
          )}
          <section className="card">
            <h2>Övrigt</h2>
            {d.todo.length > 0 && <Box k="todo" label="Använd Home Assistants inköpslista" sub={d.todo.map((t) => t.name).join(", ")} />}
            {d.calendars.some((c) => c.waste) && <Box k="waste" label="Sophämtning från Home Assistant" sub={d.calendars.filter((c) => c.waste).map((c) => c.name).join(", ")} />}
            {d.priceSensors.length > 0 && <Box k="price" label="Elpris från Home Assistant i stället för spotpris" sub={d.priceSensors[0].name} />}
          </section>
          <button className="btn primary" onClick={apply}>
            Använd det valda
          </button>
          {applied && (
            <div className="result" role="status">
              <b>Klart! Allt kan finjusteras i steget Huset.</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ======================= Kalendrar =======================

const CAL_PROVIDERS: { id: CalendarProvider; name: string; desc: string; guide: string[]; category: CalendarCategory }[] = [
  {
    id: "google",
    name: "Google Kalender",
    desc: "Familjens eller egen kalender",
    category: "family",
    guide: [
      "Öppna calendar.google.com på datorn → kugghjulet → Inställningar.",
      "Välj kalendern till vänster → Integrera kalender.",
      "Kopiera Hemlig adress i iCal-format och klistra in här.",
    ],
  },
  {
    id: "icloud",
    name: "iCloud / Apple",
    desc: "Delad kalender från iPhone",
    category: "family",
    guide: ["På iPhone: Kalender → Kalendrar → (i) vid kalendern → slå på Offentlig kalender.", "Tryck Dela länk → Kopiera och klistra in här."],
  },
  {
    id: "laget",
    name: "laget.se",
    desc: "Ett lag per länk",
    category: "sport",
    guide: ["Gå till lagets sida på laget.se → Kalender → Prenumerera.", "Kopiera webcal-adressen och klistra in här. Lägg till en länk per lag du vill se."],
  },
  {
    id: "sportadmin",
    name: "SportAdmin",
    desc: "Barnets aktiviteter",
    category: "sport",
    guide: [
      "Öppna SportAdmin-appen → Aktiviteter → Prenumerera på kalendern.",
      "Kopiera länken och klistra in här.",
      "Har barnet flera lag? Tryck Testa och bocka bara i laget du vill se.",
    ],
  },
  { id: "outlook", name: "Outlook / jobbet", desc: "Publicerad kalender", category: "work", guide: ["Outlook på webben → Inställningar → Kalender → Delade kalendrar → Publicera en kalender → kopiera ICS-länken."] },
  { id: "ics", name: "Annan länk", desc: "Valfri ICS/webcal-adress", category: "other", guide: ["Klistra in en adress som börjar med webcal:// eller https:// och slutar på .ics."] },
  { id: "ha", name: "Kalender i Home Assistant", desc: "Använd en kalender du redan har i HA", category: "family", guide: [] },
];

function CalendarEditor({
  cal,
  cfg,
  onChange,
  onDone,
  onRemove,
  secrets,
  setSecrets,
  urlSaved,
}: {
  cal: CalendarSource;
  cfg: Config;
  onChange: (c: CalendarSource) => void;
  onDone: () => void;
  onRemove: () => void;
  secrets: StepProps["secrets"];
  setSecrets: StepProps["setSecrets"];
  urlSaved: boolean;
}) {
  const p = CAL_PROVIDERS.find((x) => x.id === cal.provider)!;
  const key = `calendar.${cal.id}.url`;
  const [test, setTest] = useState<CalendarTest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const person = cfg.people.find((x) => x.id === cal.personId);
  const isChild = person?.kind === "child" && person.custody?.mode !== "always";

  const runTest = async (include = cal.include, exclude = cal.exclude) => {
    setBusy(true);
    setError("");
    try {
      const body =
        cal.kind === "ha" ? { entityId: cal.entityId } : secrets[key] ? { url: secrets[key]! } : { sourceId: cal.id };
      setTest(await api.testCalendar({ ...body, include, exclude }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{p.name}</h2>
        <button className="btn small ghost" onClick={onRemove}>
          <Icon name="trashSmall" size={18} /> Ta bort
        </button>
      </div>
      {p.guide.length > 0 && (
        <ol className="guide">
          {p.guide.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
      )}
      {cal.kind === "ha" ? (
        <EntityPicker label="Kalender" domains={["calendar"]} value={cal.entityId} onChange={(v, o) => onChange({ ...cal, entityId: v, name: cal.name || o?.name || "" })} optional={false} />
      ) : (
        <Text
          label="Kalenderlänk"
          type="url"
          value={secrets[key] ?? ""}
          placeholder={urlSaved ? "•••••• sparad – klistra in för att byta" : "webcal://… eller https://….ics"}
          onChange={(v) => setSecrets({ ...secrets, [key]: v })}
        />
      )}
      <div className="grid-3">
        <Text label="Namn på tavlan" value={cal.name} onChange={(v) => onChange({ ...cal, name: v })} placeholder={p.category === "sport" ? "Fotboll P14" : "Familjen"} />
        <Select
          label="Gäller"
          value={cal.personId ?? ""}
          onChange={(v) => onChange({ ...cal, personId: v || undefined })}
          options={[{ value: "", label: "Hela familjen" }, ...cfg.people.map((x) => ({ value: x.id, label: x.name || "(namnlös)" }))]}
        />
        <Select
          label="Typ"
          value={cal.category}
          onChange={(v) => onChange({ ...cal, category: v as CalendarCategory })}
          options={[
            { value: "family", label: "Familj" },
            { value: "sport", label: "Sport/aktivitet" },
            { value: "school", label: "Skola" },
            { value: "work", label: "Jobb" },
            { value: "other", label: "Övrigt" },
          ]}
        />
      </div>
      <div className="row gap">
        <button className="btn" onClick={() => runTest()} disabled={busy}>
          {busy ? "Testar…" : "Testa"}
        </button>
      </div>
      <Result result={test} error={error} />
      {test && test.groups.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <b>Vilka lag/grupper ska visas?</b>
          <small className="faint">Inget ikryssat = alla.</small>
          {test.groups.map((g) => {
            const on = (cal.include ?? []).some((x) => x.toLowerCase() === g.name.toLowerCase());
            return (
              <label key={g.name} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const include = e.target.checked ? [...(cal.include ?? []), g.name] : (cal.include ?? []).filter((x) => x.toLowerCase() !== g.name.toLowerCase());
                    onChange({ ...cal, include });
                    runTest(include);
                  }}
                />
                {g.name} <span className="faint">({g.count} händelser)</span>
              </label>
            );
          })}
        </div>
      )}
      <details>
        <summary className="muted" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
          Filtrera och visning
        </summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <Words label="Visa bara om titeln innehåller" value={cal.include} onChange={(v) => onChange({ ...cal, include: v })} placeholder="P14, Blå" help="Kommaseparerat. Tomt = allt." />
          <Words label="Dölj om titeln innehåller" value={cal.exclude} onChange={(v) => onChange({ ...cal, exclude: v })} placeholder="Föräldramöte, Inställd" />
          {isChild && (
            <>
              <Toggle
                label={`Visa alla veckor (även när ${person!.name} är i andra hemmet)`}
                checked={cal.visibility === "always"}
                onChange={(v) => onChange({ ...cal, visibility: v ? "always" : "custody" })}
              />
              {cal.visibility !== "always" && (
                <Words
                  label="Visa ändå alla veckor om titeln innehåller"
                  value={cal.alwaysShow}
                  onChange={(v) => onChange({ ...cal, alwaysShow: v })}
                  placeholder="match, cup"
                  help="T.ex. matcher varje vecka men träningar bara barnveckor."
                />
              )}
            </>
          )}
        </div>
      </details>
      <button className="btn primary" onClick={onDone} disabled={!cal.name || (cal.kind === "ha" ? !cal.entityId : !secrets[key] && !urlSaved)}>
        Klar
      </button>
    </section>
  );
}

export function CalendarsStep({ cfg, set, secrets, setSecrets, resp, haOk }: StepProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const update = (c: CalendarSource) => set({ ...cfg, calendars: cfg.calendars.map((x) => (x.id === c.id ? c : x)) });
  const add = (pid: CalendarProvider) => {
    const p = CAL_PROVIDERS.find((x) => x.id === pid)!;
    const c: CalendarSource = {
      id: uid("c"),
      name: "",
      provider: pid,
      kind: pid === "ha" ? "ha" : "ics",
      category: p.category,
      alwaysShow: p.category === "sport" ? ["match", "cup"] : undefined,
      visibility: "custody",
    };
    set({ ...cfg, calendars: [...cfg.calendars, c] });
    setEditing(c.id);
  };
  const editingCal = cfg.calendars.find((c) => c.id === editing);
  if (editingCal) {
    return (
      <CalendarEditor
        cal={editingCal}
        cfg={cfg}
        onChange={update}
        onDone={() => setEditing(null)}
        onRemove={() => {
          set({ ...cfg, calendars: cfg.calendars.filter((c) => c.id !== editingCal.id) });
          setEditing(null);
        }}
        secrets={secrets}
        setSecrets={setSecrets}
        urlSaved={resp.secretsSet.includes(`calendar.${editingCal.id}.url`)}
      />
    );
  }
  const hasShared = cfg.people.some((p) => p.kind === "child" && p.custody?.mode !== "always");
  return (
    <div className="stack">
      {hasShared && cfg.calendars.length > 0 && (
        <section className="card">
          <Select
            label="Byteskalender (valfri)"
            value={cfg.household.custodyCalendarId ?? ""}
            onChange={(v) => set({ ...cfg, household: { ...cfg.household, custodyCalendarId: v || undefined } })}
            options={[{ value: "", label: "Ingen – använd bara barnens schema" }, ...cfg.calendars.map((c) => ({ value: c.id, label: c.name || "(namnlös)" }))]}
            help='En delad kalender där en heldagshändelse med barnets namn betyder "hemma" och namnet + "borta" betyder i andra hemmet. Går före schemat. Visas inte i veckovyn.'
          />
        </section>
      )}
      {cfg.calendars.map((c) => {
        const who = cfg.people.find((p) => p.id === c.personId);
        return (
          <div className="item-row" key={c.id}>
            <span className="dot" style={{ background: who?.color ?? "var(--accent)" }} />
            <span className="grow">
              <b>{c.name || "(namnlös)"}</b>
              <small className="faint" style={{ display: "block" }}>
                {CAL_PROVIDERS.find((p) => p.id === c.provider)?.name} · {who?.name ?? "Hela familjen"}
                {c.include?.length ? ` · bara ${c.include.join(", ")}` : ""}
              </small>
            </span>
            <button className="btn small" onClick={() => setEditing(c.id)}>
              Ändra
            </button>
          </div>
        );
      })}
      <h2 style={{ fontSize: 18, marginTop: 8 }}>Lägg till</h2>
      <div className="tiles">
        {CAL_PROVIDERS.filter((p) => p.id !== "ha" || haOk).map((p) => (
          <button key={p.id} className="tile" onClick={() => add(p.id)}>
            <b>{p.name}</b>
            <small>{p.desc}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

// ======================= Leverantörssteg (skola, sopor, inköp, el) =======================

function useIntegration(cfg: Config, set: (c: Config) => void, category: IntegrationCategory) {
  const integ = cfg.integrations.find((i) => i.category === category);
  const put = (i: Integration | null) => set({ ...cfg, integrations: [...cfg.integrations.filter((x) => x.category !== category), ...(i ? [i] : [])] });
  return [integ, put] as const;
}

export function SchoolStep({ cfg, set, secrets, setSecrets, resp, haOk }: StepProps) {
  const schools = cfg.integrations.filter((i) => i.category === "school");
  const children = cfg.people.filter((p) => p.kind === "child");
  const [discovered, setDiscovered] = useState<Record<string, string[]>>({});
  const update = (i: Integration) => set({ ...cfg, integrations: cfg.integrations.map((x) => (x.id === i.id ? i : x)) });
  const add = (provider: string) => set({ ...cfg, integrations: [...cfg.integrations, { id: uid("s"), category: "school", provider, settings: {} }] });
  return (
    <div className="stack">
      {schools.map((integ) => {
        const meta = resp.providers.find((p) => p.id === integ.provider && p.category === "school")!;
        const names = discovered[integ.id] ?? Object.keys(integ.personMap ?? {});
        return (
          <section className="card" key={integ.id}>
            <div className="card-head">
              <h2>{meta.name}</h2>
              <button className="btn small ghost" onClick={() => set({ ...cfg, integrations: cfg.integrations.filter((x) => x.id !== integ.id) })}>
                <Icon name="trashSmall" size={18} /> Ta bort
              </button>
            </div>
            {!meta.discoversChildren && (
              <Select
                label="Vilket barn?"
                value={integ.personId ?? ""}
                onChange={(v) => update({ ...integ, personId: v || undefined })}
                options={[{ value: "", label: "– Välj –" }, ...children.map((c) => ({ value: c.id, label: c.name }))]}
              />
            )}
            <ProviderForm
              meta={meta}
              integ={integ}
              onChange={update}
              secrets={secrets}
              setSecrets={setSecrets}
              secretsSet={resp.secretsSet}
              extra={(r) => {
                if (r?.discovered && r.discovered.join() !== (discovered[integ.id] ?? []).join()) setTimeout(() => setDiscovered((d) => ({ ...d, [integ.id]: r.discovered! })));
                if (!meta.discoversChildren || !names.length) return null;
                return (
                  <div className="stack">
                    <b>Koppla barnen</b>
                    {names.map((n) => (
                      <Select
                        key={n}
                        label={n}
                        value={integ.personMap?.[n] ?? ""}
                        onChange={(v) => update({ ...integ, personMap: { ...(integ.personMap ?? {}), [n]: v } })}
                        options={[{ value: "", label: "– Visa inte –" }, ...children.map((c) => ({ value: c.id, label: c.name }))]}
                      />
                    ))}
                  </div>
                );
              }}
            />
          </section>
        );
      })}
      <h2 style={{ fontSize: 18 }}>Lägg till skola</h2>
      <ProviderTiles providers={resp.providers} category="school" onSelect={(id) => id && add(id)} haAvailable={haOk} />
    </div>
  );
}

export function WasteStep({ cfg, set, secrets, setSecrets, resp, haOk, postcode }: StepProps) {
  const [integ, put] = useIntegration(cfg, set, "waste");
  const meta = integ && resp.providers.find((p) => p.id === integ.provider && p.category === "waste");
  return (
    <div className="stack">
      <ProviderTiles
        providers={resp.providers}
        category="waste"
        selected={integ?.provider}
        allowNone="Ingen sophämtning"
        haAvailable={haOk}
        onSelect={(id) =>
          put(id ? { id: "waste", category: "waste", provider: id, settings: id === "edp" && postcode?.wasteProvider ? { municipality: postcode.wasteProvider } : {} } : null)
        }
      />
      {integ && meta && (
        <section className="card">
          <h2>{meta.name}</h2>
          {integ.provider === "edp" && !postcode?.wasteProvider && cfg.household.municipality && !integ.settings.municipality && (
            <p className="muted">
              {cfg.household.municipality} finns inte i listan. Prova <b>Eget schema</b> eller Waste Collection Schedule i Home Assistant.
            </p>
          )}
          <ProviderForm meta={meta} integ={integ} onChange={put} secrets={secrets} setSecrets={setSecrets} secretsSet={resp.secretsSet} />
        </section>
      )}
    </div>
  );
}

export function ShoppingStep({ cfg, set, secrets, setSecrets, resp, haOk }: StepProps) {
  const [integ, put] = useIntegration(cfg, set, "grocery");
  const meta = integ && resp.providers.find((p) => p.id === integ.provider && p.category === "grocery");
  return (
    <div className="stack">
      <section className="card">
        <h2>Inköpslistan</h2>
        <div className="tiles">
          <button className={`tile ${cfg.shopping.source === "local" ? "selected" : ""}`} onClick={() => set({ ...cfg, shopping: { ...cfg.shopping, source: "local" } })}>
            <b>På tavlan</b>
            <small>Enkel lista som bara finns här</small>
          </button>
          <button
            className={`tile ${cfg.shopping.source === "ha" ? "selected" : ""}`}
            disabled={!haOk}
            onClick={() => set({ ...cfg, shopping: { ...cfg.shopping, source: "ha" } })}
          >
            <b>Home Assistants lista</b>
            <small>{haOk ? "Synkas med HA-appen och röst: \"lägg till mjölk\"" : "Kräver Home Assistant"}</small>
          </button>
        </div>
        {cfg.shopping.source === "ha" && haOk && (
          <EntityPicker label="Lista" domains={["todo"]} value={cfg.shopping.entityId} onChange={(v) => set({ ...cfg, shopping: { ...cfg.shopping, entityId: v } })} optional={false} />
        )}
      </section>
      <h2 style={{ fontSize: 18 }}>Skicka listan till en butik</h2>
      <ProviderTiles
        providers={resp.providers}
        category="grocery"
        selected={integ?.provider}
        allowNone="Ingen butik"
        haAvailable={haOk}
        onSelect={(id) => put(id ? { id: "grocery", category: "grocery", provider: id, settings: {} } : null)}
      />
      {integ && meta && (
        <section className="card">
          <h2>{meta.name}</h2>
          <ProviderForm meta={meta} integ={integ} onChange={put} secrets={secrets} setSecrets={setSecrets} secretsSet={resp.secretsSet} />
        </section>
      )}
    </div>
  );
}

export function ElectricityStep({ cfg, set, secrets, setSecrets, resp, haOk }: StepProps) {
  const [integ, put] = useIntegration(cfg, set, "price");
  const meta = integ && resp.providers.find((p) => p.id === integ.provider && p.category === "price");
  const e = cfg.electricity;
  const setE = (patch: Partial<Config["electricity"]>) => set({ ...cfg, electricity: { ...e, ...patch } });
  const ore = (label: string, k: "markupOre" | "gridOre" | "taxOre", help: string) => (
    <Text label={label} type="number" inputMode="decimal" value={String(e[k])} help={help} onChange={(v) => setE({ [k]: Math.max(0, Number(v.replace(",", ".")) || 0) })} />
  );
  return (
    <div className="stack">
      <ProviderTiles
        providers={resp.providers}
        category="price"
        selected={integ?.provider}
        allowNone="Visa inte elpris"
        haAvailable={haOk}
        onSelect={(id) => put(id ? { id: "price", category: "price", provider: id, settings: id === "spot" ? { area: "SE3", ...(integ?.provider === "spot" ? integ.settings : {}) } : {} } : null)}
      />
      {integ && meta && (
        <section className="card">
          <h2>{meta.name}</h2>
          <ProviderForm meta={meta} integ={integ} onChange={put} secrets={secrets} setSecrets={setSecrets} secretsSet={resp.secretsSet} />
        </section>
      )}
      {integ && (
        <section className="card">
          <h2>Ditt verkliga pris</h2>
          <p className="muted">Fyll i från elräkningen (öre/kWh exkl. moms) så visar tavlan vad en kWh faktiskt kostar. Lämna 0 för bara spotpris.</p>
          <div className="grid-3">
            {ore("Elbolagets påslag", "markupOre", "Påslag + elcertifikat")}
            {ore("Elöverföring", "gridOre", "Nätbolagets rörliga avgift")}
            {ore("Energiskatt", "taxOre", "Står på nätfakturan")}
          </div>
          <Toggle label="Lägg på moms 25 %" checked={e.vat} onChange={(v) => setE({ vat: v })} />
          <Select
            label="Markera billigaste"
            value={String(e.cheapHours)}
            onChange={(v) => setE({ cheapHours: Number(v) })}
            options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: `${n} timmar i följd` }))}
            help="Bra för att ladda bilen eller köra disk/tvätt."
          />
        </section>
      )}
    </div>
  );
}

// ======================= Huset (finjustering) =======================

function ListCard<T>({
  title,
  help,
  items,
  onChange,
  make,
  render,
  addLabel,
}: {
  title: string;
  help?: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, set: (t: T) => void) => React.ReactNode;
  addLabel: string;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {help && <p className="muted">{help}</p>}
      {items.map((it, i) => (
        <div key={i} className="card" style={{ padding: 16 }}>
          {render(it, (t) => onChange(items.map((x, j) => (j === i ? t : x))))}
          <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon name="trashSmall" size={18} /> Ta bort
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => onChange([...items, make()])}>
        <Icon name="plus" size={20} /> {addLabel}
      </button>
    </section>
  );
}

export function HouseStep({ cfg, set }: StepProps) {
  const en = cfg.entities;
  const setEn = (patch: Partial<Config["entities"]>) => set({ ...cfg, entities: { ...en, ...patch } });
  return (
    <div className="stack">
      <ListCard
        title="Bilar"
        help="Fungerar med alla bilmärken som finns i Home Assistant."
        items={en.cars}
        onChange={(cars) => setEn({ cars })}
        make={(): Config["entities"]["cars"][number] => ({ name: "", battery: "" })}
        addLabel="Lägg till bil"
        render={(c, s) => (
          <div className="grid-2">
            <Text label="Namn" value={c.name} onChange={(v) => s({ ...c, name: v })} />
            <EntityPicker label="Batteri (%)" domains={["sensor"]} value={c.battery} onChange={(v) => s({ ...c, battery: v ?? "" })} optional={false} />
            <EntityPicker label="Räckvidd" domains={["sensor"]} value={c.range} onChange={(v) => s({ ...c, range: v })} />
            <EntityPicker label="Position / hemma" domains={["device_tracker", "binary_sensor", "sensor"]} value={c.location} onChange={(v) => s({ ...c, location: v })} />
            <EntityPicker label="Laddar" domains={["binary_sensor", "sensor", "switch"]} value={c.charging} onChange={(v) => s({ ...c, charging: v })} />
            <EntityPicker label="Värmestart" domains={["climate", "switch", "button"]} value={c.climate} onChange={(v) => s({ ...c, climate: v })} help="Gör att du kan starta värmen och schemalägga den." />
          </div>
        )}
      />
      <section className="card">
        <h2>Energi</h2>
        <p className="muted">Valfri växelriktare och elmätare – välj effektsensorerna (W eller kW).</p>
        <div className="grid-2">
          <EntityPicker label="Solproduktion" domains={["sensor"]} value={en.energy.solar} onChange={(v) => setEn({ energy: { ...en.energy, solar: v } })} />
          <EntityPicker label="Elnät (köp positivt)" domains={["sensor"]} value={en.energy.grid} onChange={(v) => setEn({ energy: { ...en.energy, grid: v } })} />
          <EntityPicker label="Husets förbrukning" domains={["sensor"]} value={en.energy.house} onChange={(v) => setEn({ energy: { ...en.energy, house: v } })} />
          <EntityPicker label="Hembatteri (%)" domains={["sensor"]} value={en.energy.battery} onChange={(v) => setEn({ energy: { ...en.energy, battery: v } })} />
        </div>
      </section>
      <section className="card">
        <h2>Lampor på startskärmen</h2>
        {en.lights.map((l, i) => (
          <div className="row gap" key={l.entityId}>
            <div className="grow">
              <Text label={l.entityId} value={l.name} onChange={(v) => setEn({ lights: en.lights.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
            </div>
            <button className="btn small ghost" aria-label="Ta bort" onClick={() => setEn({ lights: en.lights.filter((_, j) => j !== i) })}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        <EntityPicker
          label="Lägg till lampa"
          domains={["light", "switch"]}
          value={undefined}
          onChange={(v, o) => v && !en.lights.some((l) => l.entityId === v) && setEn({ lights: [...en.lights, { entityId: v, name: o?.name ?? v }] })}
        />
      </section>
      <ListCard
        title="Ljusgrupper"
        help="Visas på fliken Ljus med Tänd alla / Släck alla."
        items={en.lightGroups}
        onChange={(lightGroups) => setEn({ lightGroups })}
        make={() => ({ name: "", entities: [] })}
        addLabel="Lägg till grupp"
        render={(g, s) => (
          <>
            <Text label="Namn" value={g.name} onChange={(v) => s({ ...g, name: v })} placeholder="Fönsterlampor" />
            <MultiEntityPicker label="Lägg till lampa" domains={["light", "switch"]} value={g.entities} onChange={(v) => s({ ...g, entities: v })} />
          </>
        )}
      />
      <ListCard
        title="Snabbknappar"
        help="Scener och skript, t.ex. Godnatt – släck uppe."
        items={en.buttons}
        onChange={(buttons) => setEn({ buttons })}
        make={() => ({ name: "", entityId: "", style: "blue" as const })}
        addLabel="Lägg till knapp"
        render={(b, s) => (
          <div className="grid-3">
            <Text label="Text på knappen" value={b.name} onChange={(v) => s({ ...b, name: v })} />
            <EntityPicker label="Scen/skript" domains={["scene", "script", "button", "input_button", "automation"]} value={b.entityId || undefined} onChange={(v, o) => s({ ...b, entityId: v ?? "", name: b.name || o?.name || "" })} optional={false} />
            <Select
              label="Färg"
              value={b.style}
              onChange={(v) => s({ ...b, style: v as typeof b.style })}
              options={[
                { value: "blue", label: "Blå" },
                { value: "amber", label: "Gul" },
                { value: "accent", label: "Grön" },
                { value: "plain", label: "Neutral" },
              ]}
            />
          </div>
        )}
      />
      <ListCard
        title="Värme, varmvatten och spabad"
        items={en.climates}
        onChange={(climates) => setEn({ climates })}
        make={(): Config["entities"]["climates"][number] => ({ name: "", entityId: "" })}
        addLabel="Lägg till"
        render={(c, s) => (
          <>
            <div className="grid-2">
              <Text label="Namn" value={c.name} onChange={(v) => s({ ...c, name: v })} placeholder="Värme inne" />
              <EntityPicker label="Termostat / varmvatten" domains={["climate", "water_heater"]} value={c.entityId || undefined} onChange={(v, o) => s({ ...c, entityId: v ?? "", name: c.name || o?.name || "" })} optional={false} />
            </div>
            <MultiEntityPicker label="Extra reglage (pumpar, ljus, blåsare)" domains={["switch", "fan", "light", "select", "number", "button"]} value={c.controls ?? []} onChange={(v) => s({ ...c, controls: v })} />
          </>
        )}
      />
      <ListCard
        title="Enhetskort"
        help="För t.ex. värmepump via Husdata: välj ett huvudvärde, rader och reglage."
        items={en.deviceCards}
        onChange={(deviceCards) => setEn({ deviceCards })}
        make={() => ({ title: "", sensors: [], controls: [] })}
        addLabel="Lägg till kort"
        render={(d, s) => (
          <>
            <div className="grid-2">
              <Text label="Rubrik" value={d.title} onChange={(v) => s({ ...d, title: v })} placeholder="Värmepump" />
              <EntityPicker label="Huvudvärde" domains={["sensor"]} value={d.primary} onChange={(v) => s({ ...d, primary: v })} />
            </div>
            <MultiEntityPicker label="Lägg till rad" domains={["sensor", "binary_sensor"]} value={d.sensors} onChange={(v) => s({ ...d, sensors: v })} />
            <MultiEntityPicker label="Lägg till reglage" domains={["switch", "select", "number", "button", "input_number", "input_select", "input_boolean"]} value={d.controls} onChange={(v) => s({ ...d, controls: v })} />
          </>
        )}
      />
      <ListCard
        title="Temperaturer"
        items={en.temps}
        onChange={(temps) => setEn({ temps })}
        make={() => ({ name: "", entityId: "" })}
        addLabel="Lägg till"
        render={(t, s) => (
          <div className="grid-2">
            <Text label="Namn" value={t.name} onChange={(v) => s({ ...t, name: v })} placeholder="Ute" />
            <EntityPicker label="Sensor" domains={["sensor"]} value={t.entityId || undefined} onChange={(v, o) => s({ ...t, entityId: v ?? "", name: t.name || o?.name || "" })} optional={false} />
          </div>
        )}
      />
      <ListCard
        title="Grafer"
        items={en.graphs}
        onChange={(graphs) => setEn({ graphs })}
        make={() => ({ title: "", series: [] })}
        addLabel="Lägg till graf"
        render={(g, s) => (
          <>
            <Text label="Rubrik" value={g.title} onChange={(v) => s({ ...g, title: v })} placeholder="Effekt hus" />
            {g.series.map((se, i) => (
              <div className="row gap" key={i}>
                <input
                  type="color"
                  className="color-input"
                  aria-label="Färg"
                  value={se.color}
                  onChange={(e) => s({ ...g, series: g.series.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}
                />
                <span className="grow">{se.name}</span>
                <button className="btn small ghost" aria-label="Ta bort serie" onClick={() => s({ ...g, series: g.series.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={18} />
                </button>
              </div>
            ))}
            <EntityPicker
              label="Lägg till sensor"
              domains={["sensor"]}
              value={undefined}
              onChange={(v, o) => v && s({ ...g, series: [...g.series, { entityId: v, name: o?.name ?? v, color: PALETTE[g.series.length % PALETTE.length] }] })}
            />
          </>
        )}
      />
    </div>
  );
}

// ======================= Startskärm =======================

const WIDGET_LABELS: Record<string, string> = {
  reminders: "Kom ihåg (och skolmat)",
  custody: "Barnvecka",
  week: "Kommande 7 dagar",
  shopping: "Inköpslista",
  prices: "Elpris",
  cars: "Bilar",
  lights: "Ljus",
  temps: "Temperaturer",
  energy: "Energi",
  climates: "Värme",
};
const TAB_LABELS: Record<string, string> = { cars: "Bil", lights: "Ljus", house: "Hus", energy: "Energi", graphs: "Grafer" };

function OrderList<T extends { id: string; on: boolean }>({ items, labels, onChange }: { items: T[]; labels: Record<string, string>; onChange: (v: T[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((w, i) => (
        <div className="item-row" key={w.id}>
          <label className="switch">
            <input type="checkbox" checked={w.on} aria-label={`Visa ${labels[w.id]}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
            <span />
          </label>
          <span className="grow" style={{ opacity: w.on ? 1 : 0.55 }}>
            {labels[w.id] ?? w.id}
          </span>
          <button className="btn small" aria-label={`Flytta upp ${labels[w.id]}`} disabled={i === 0} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button className="btn small" aria-label={`Flytta ner ${labels[w.id]}`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}

export function DisplayStep({ cfg, set, secrets, setSecrets, resp }: StepProps) {
  const d = cfg.dashboard;
  const setD = (patch: Partial<Config["dashboard"]>) => set({ ...cfg, dashboard: { ...d, ...patch } });
  const pinSet = resp.secretsSet.includes("admin.pin");
  return (
    <div className="stack">
      <section className="card">
        <h2>Startskärmen</h2>
        <p className="muted">Slå på det du vill se och flytta i den ordning du vill. Rutor utan data döljs automatiskt.</p>
        <OrderList items={d.home} labels={WIDGET_LABELS} onChange={(home) => setD({ home })} />
      </section>
      <section className="card">
        <h2>Flikar</h2>
        <OrderList items={d.tabs} labels={TAB_LABELS} onChange={(tabs) => setD({ tabs })} />
      </section>
      <section className="card">
        <h2>Utseende</h2>
        <Select
          label="Tema"
          value={d.theme}
          onChange={(v) => setD({ theme: v as Config["dashboard"]["theme"] })}
          options={[
            { value: "auto", label: "Dygnsfärger (ljust dag, mörkt kväll)" },
            { value: "dark", label: "Alltid mörkt" },
            { value: "light", label: "Alltid ljust" },
          ]}
        />
        <div className="grid-2">
          <label className="field">
            <span>Nattläge från</span>
            <input type="time" value={d.nightFrom} onChange={(e) => setD({ nightFrom: e.target.value })} />
          </label>
          <label className="field">
            <span>till</span>
            <input type="time" value={d.nightTo} onChange={(e) => setD({ nightTo: e.target.value })} />
          </label>
        </div>
        <small className="faint">Nattläge visar bara klockan på svart skärm. Tryck för att väcka.</small>
      </section>
      {!resp.runtime.supervisor && (
        <section className="card">
          <h2>PIN för inställningar</h2>
          <p className="muted">Hindrar att någon på nätverket ändrar inställningarna. Tavlan kan användas som vanligt utan PIN.</p>
          <Text
            label="PIN-kod"
            type="password"
            inputMode="numeric"
            value={secrets["admin.pin"] ?? ""}
            placeholder={pinSet ? "•••• satt – skriv för att byta" : "Minst 4 siffror"}
            onChange={(v) => setSecrets({ ...secrets, "admin.pin": v })}
          />
          {pinSet && (
            <button className="btn small" onClick={() => setSecrets({ ...secrets, "admin.pin": null })}>
              Ta bort PIN
            </button>
          )}
        </section>
      )}
    </div>
  );
}
