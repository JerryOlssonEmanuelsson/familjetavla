import { useEffect, useMemo, useState } from "react";
import type { Control, Dashboard } from "../../../server/src/types";
import { api, type CarDetails, type GraphData } from "../api";
import { Icon } from "../Icon";
import type { Actions } from "./Dashboard";
import { PriceCard, Ring } from "./Home";

const DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const fmtNum = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ","));

// ---------- Generic control (switch / select / number / button) ----------

export function ControlView({ c, actions }: { c: Control; actions: Actions }) {
  if (c.domain === "select" || c.domain === "input_select") {
    return (
      <label className="field">
        <span>{c.name}</span>
        <select value={c.state} disabled={c.offline} onChange={(e) => actions.run(c.name, () => api.control(c.entityId, "select", e.target.value))}>
          {(c.options ?? [c.state]).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (c.domain === "number" || c.domain === "input_number") {
    const v = Number(c.state);
    const step = c.step ?? 1;
    const set = (n: number) => actions.run(c.name, () => api.control(c.entityId, "set", Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, n))));
    return (
      <div className="row gap">
        <span className="grow">{c.name}</span>
        <button className="btn small" aria-label={`Sänk ${c.name}`} disabled={c.offline} onClick={() => set(v - step)}>
          −
        </button>
        <b className="tabular" style={{ minWidth: 70, textAlign: "center" }}>
          {Number.isFinite(v) ? `${fmtNum(v)}${c.unit ? ` ${c.unit}` : ""}` : "–"}
        </b>
        <button className="btn small" aria-label={`Höj ${c.name}`} disabled={c.offline} onClick={() => set(v + step)}>
          +
        </button>
      </div>
    );
  }
  if (c.domain === "button" || c.domain === "input_button") {
    return (
      <button className="btn" disabled={c.offline} onClick={() => actions.run(c.name, () => api.control(c.entityId, "press"))}>
        {c.name}
      </button>
    );
  }
  return (
    <button
      className={`light-btn ${c.on ? "on" : ""} ${c.offline ? "offline" : ""}`}
      aria-pressed={c.on}
      disabled={c.offline}
      onClick={() => actions.run(c.name, () => api.control(c.entityId, "toggle"))}
    >
      {c.name}
    </button>
  );
}

// ---------- Cars ----------

function ScheduleEditor({ car, actions }: { car: Dashboard["cars"][number]; actions: Actions }) {
  const [adding, setAdding] = useState(false);
  const [time, setTime] = useState("06:40");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  if (!car.climate) return null;
  const climate = car.climate;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Värmestart</h2>
        <button
          className={`btn ${climate.on ? "selected" : "primary"}`}
          onClick={() =>
            climate.on
              ? actions.run("Värme", () => api.run(climate.entityId, climate.entityId.startsWith("button.") ? "press" : "off"))
              : actions.confirm(`Starta värmen i ${car.name}?`, "Värme", () => api.run(climate.entityId, climate.entityId.startsWith("button.") ? "press" : "on"))
          }
        >
          <Icon name="sun" size={20} />
          {climate.on ? "Stäng av värmen" : "Starta värme nu"}
        </button>
      </div>
      {car.schedules.length === 0 && !adding && <p className="muted">Inget schema. Lägg till t.ex. vardagar 06:40.</p>}
      {car.schedules.map((s) => (
        <div className="item-row" key={s.id}>
          <label className="switch" aria-label={`Schema ${s.time} på/av`}>
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => actions.run("Schema", () => api.saveSchedule({ ...s, entityId: climate.entityId, action: "on", enabled: e.target.checked }))}
            />
            <span />
          </label>
          <b className="tabular" style={{ fontSize: 22 }}>
            {s.time}
          </b>
          <span className="grow muted">{s.days.length === 7 ? "Alla dagar" : s.days.map((d) => DAYS[d - 1]).join(" ")}</span>
          <button className="btn small ghost" aria-label="Ta bort schema" onClick={() => actions.run("Schema", () => api.deleteSchedule(s.id))}>
            <Icon name="x" size={18} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="stack">
          <div className="row gap wrap">
            {DAYS.map((d, i) => (
              <button
                key={d}
                className={`btn small ${days.includes(i + 1) ? "selected" : ""}`}
                aria-pressed={days.includes(i + 1)}
                onClick={() => setDays((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1].sort()))}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="row gap">
            <label className="field grow">
              <span>Starta kl.</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <button
              className="btn primary"
              style={{ alignSelf: "flex-end" }}
              disabled={!days.length}
              onClick={() => {
                setAdding(false);
                actions.run("Schema", () =>
                  api.saveSchedule({
                    id: `s${Date.now().toString(36)}`,
                    name: `${car.name} värme`,
                    entityId: climate.entityId,
                    action: climate.entityId.startsWith("button.") ? "press" : "on",
                    days,
                    time,
                    enabled: true,
                  }),
                );
              }}
            >
              Spara
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} /> Lägg till tid
        </button>
      )}
    </section>
  );
}

function CarDetailsSheet({ index, onClose, actions }: { index: number; onClose: () => void; actions: Actions }) {
  const [data, setData] = useState<CarDetails | null>(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("Batteri & laddning");
  const load = () =>
    api
      .car(index)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, [index]);
  const groups = useMemo(() => [...new Set(data?.rows.map((r) => r.group) ?? [])], [data]);
  const rows = data?.rows.filter((r) => r.group === group) ?? [];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Alla data" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2 style={{ fontSize: 24 }}>{data?.name ?? "Bil"} – alla data</h2>
          <button className="btn icon" aria-label="Stäng" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!data && !error && <p className="muted">Hämtar…</p>}
        {data && (
          <>
            <p className="muted">
              {data.valid} av {data.total} entiteter har giltigt värde. ✓ = färskt, ⚠ = otillgänglig eller gammal.
            </p>
            {data.actions.length > 0 && (
              <div className="grid-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {data.actions.map((a) => (
                  <button
                    key={a.entityId}
                    className={`btn ${a.domain !== "button" && (a.state === "on" || a.state === "locked") ? "selected" : ""}`}
                    onClick={() =>
                      actions.confirm(`${a.name} – ${data.name}?`, a.name, async () => {
                        const action = a.domain === "button" ? "press" : a.state === "on" || a.state === "locked" ? "off" : "on";
                        await api.carAction(index, a.entityId, action);
                        await load();
                      })
                    }
                  >
                    {a.name}
                    {a.domain !== "button" && <span className="muted">· {a.state}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="row gap wrap" style={{ justifyContent: "center" }}>
              {groups.map((g) => (
                <button key={g} className={`btn small ${g === group ? "selected" : ""}`} onClick={() => setGroup(g)}>
                  {g}
                </button>
              ))}
            </div>
            <div className="stack" style={{ gap: 0 }}>
              {rows.map((r) => (
                <div key={r.entityId} className="row gap" style={{ padding: "12px 0", borderBottom: "1px solid var(--card-border)" }}>
                  <span aria-hidden="true">{r.ok ? "✓" : "⚠"}</span>
                  <span className="grow">{r.name}</span>
                  <span style={{ color: r.ok ? "var(--muted)" : "var(--amber)", textAlign: "right" }}>
                    {r.value}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function CarsPage({ data, actions }: { data: Dashboard; actions: Actions }) {
  const [sel, setSel] = useState(0);
  const [details, setDetails] = useState(false);
  const car = data.cars[Math.min(sel, data.cars.length - 1)];
  if (!car) return null;
  return (
    <main className="stack" style={{ gap: 18 }}>
      {data.cars.length > 1 && (
        <div className="grid-2" style={{ gridTemplateColumns: `repeat(${data.cars.length}, minmax(0, 1fr))` }}>
          {data.cars.map((c, i) => (
            <button key={c.name} className={`btn ${i === sel ? "selected" : ""}`} onClick={() => setSel(i)}>
              {c.name} · {c.battery ?? "–"} %
            </button>
          ))}
        </div>
      )}
      <div className="page-grid">
        <section className="card strong" style={{ alignItems: "center" }}>
          <div className="row gap">
            <span className="muted">{car.name}</span>
            <button className="btn small ghost" style={{ color: "var(--blue)" }} onClick={() => setDetails(true)}>
              Alla data
            </button>
          </div>
          <div className="car-ring">
            <Ring progress={(car.battery ?? 0) / 100} size={170} stroke={12}>
              <b style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>
                {car.battery ?? "–"}
                <small style={{ fontSize: 18 }}>%</small>
              </b>
              <small className="muted">batteri</small>
            </Ring>
          </div>
          <div className="chips">
            {car.home !== null && <span className="chip">{car.home ? "Hemma" : "Borta"}</span>}
            {car.rangeKm !== null && <span className="chip">Räckvidd {Math.round(car.rangeKm)} km</span>}
            {car.charging && <span className="chip good">Laddar</span>}
            {car.ageHours !== null && car.ageHours >= 3 && <span className="chip warn">Data {car.ageHours} h gammal</span>}
          </div>
        </section>
        <ScheduleEditor car={car} actions={actions} />
        {data.prices && <PriceCard prices={data.prices} />}
      </div>
      {details && <CarDetailsSheet index={data.cars.indexOf(car)} onClose={() => setDetails(false)} actions={actions} />}
    </main>
  );
}

// ---------- Lights ----------

export function LightsPage({ data, actions }: { data: Dashboard; actions: Actions }) {
  return (
    <main className="page-grid">
      {data.buttons.length > 0 && (
        <section className="card">
          <h2>Snabbval</h2>
          <div className="big-buttons">
            {data.buttons.map((b) => (
              <button key={b.entityId} className={`big-btn wide ${b.style}`} onClick={() => actions.run(b.name, () => api.button(b.entityId))}>
                {b.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {data.lightGroups.map((g) => (
        <section className="card" key={g.index}>
          <h2>{g.name}</h2>
          <p className="muted">
            {g.on} av {g.total} tända{g.offline.length ? ` · offline: ${g.offline.join(", ")}` : ""}
          </p>
          <div className="big-buttons">
            <button className="big-btn amber" onClick={() => actions.run(g.name, () => api.lightGroup(g.index, true))}>
              Tänd alla
            </button>
            <button className="big-btn" onClick={() => actions.run(g.name, () => api.lightGroup(g.index, false))}>
              Släck alla
            </button>
          </div>
        </section>
      ))}
      {data.lights.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Lampor</h2>
            <button className="btn small" onClick={() => actions.run("Släck allt", () => api.lightsOff())}>
              Släck allt
            </button>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {data.lights.map((l) => (
              <button
                key={l.entityId}
                className={`light-btn ${l.on ? "on" : ""} ${l.offline ? "offline" : ""}`}
                aria-pressed={l.on}
                disabled={l.offline}
                onClick={() => actions.run(l.name, () => api.toggleLight(l.entityId))}
              >
                <Icon name="bulb" size={20} />
                {l.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// ---------- House ----------

export function HousePage({ data, actions }: { data: Dashboard; actions: Actions }) {
  return (
    <main className="page-grid">
      {data.climates.map((c) => (
        <section className="card strong" key={c.entityId}>
          <span className="muted" style={{ fontWeight: 600 }}>
            {c.name}
          </span>
          <span className="big-num" style={{ fontSize: 44 }}>
            {fmtNum(c.current ?? c.target)}
            <small>°C</small>
          </span>
          <div className="row gap">
            <span className="muted grow">
              {c.target !== null && `Mål ${fmtNum(c.target)}°`}
              {c.action ? ` · ${c.action}` : ""}
            </span>
            {c.target !== null && (
              <>
                <button className="btn small" aria-label="Sänk mål" onClick={() => actions.run(c.name, () => api.climateTarget(c.entityId, (c.target ?? 0) - 0.5))}>
                  −
                </button>
                <button className="btn small" aria-label="Höj mål" onClick={() => actions.run(c.name, () => api.climateTarget(c.entityId, (c.target ?? 0) + 0.5))}>
                  +
                </button>
              </>
            )}
          </div>
          {c.modes.length > 0 && (
            <div className="row gap wrap">
              {c.modes.map((m) => (
                <button
                  key={m.value}
                  className={`btn small ${c.active === m.value ? "selected" : ""}`}
                  aria-pressed={c.active === m.value}
                  onClick={() => actions.confirm(`Byt ${c.name} till ${m.label}?`, c.name, () => api.climateMode(c.entityId, m.field, m.value))}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {c.controls.length > 0 && (
            <div className="grid-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              {c.controls.map((ctl) => (
                <ControlView key={ctl.entityId} c={ctl} actions={actions} />
              ))}
            </div>
          )}
        </section>
      ))}
      {data.deviceCards.map((d) => (
        <section className="card strong" key={d.index}>
          <span className="muted" style={{ fontWeight: 600 }}>
            {d.title}
          </span>
          {d.primary && (
            <div>
              <span className="big-num" style={{ fontSize: 44 }}>
                {d.primary.value}
              </span>
              <div className="muted">{d.primary.name}</div>
            </div>
          )}
          {d.rows.length > 0 && (
            <div className="stack" style={{ gap: 0 }}>
              {d.rows.map((r) => (
                <div key={r.name} className="row gap" style={{ padding: "8px 0", borderBottom: "1px solid var(--card-border)" }}>
                  <span className="grow muted">{r.name}</span>
                  <b style={{ color: r.ok ? undefined : "var(--amber)" }}>{r.value}</b>
                </div>
              ))}
            </div>
          )}
          {d.controls.length > 0 && (
            <div className="stack">
              {d.controls.map((ctl) => (
                <ControlView key={ctl.entityId} c={ctl} actions={actions} />
              ))}
            </div>
          )}
        </section>
      ))}
      {data.temps.length > 0 && (
        <section className="card">
          <h2>Temperaturer</h2>
          <div className="stats">
            {data.temps.map((t) => (
              <div key={t.name}>
                <small>{t.name}</small>
                <b>{t.value}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// ---------- Energy ----------

export function EnergyPage({ data }: { data: Dashboard }) {
  const e = data.energy;
  const kw = (n?: number) => `${fmtNum(n ?? 0)} kW`;
  return (
    <main className="page-grid">
      {e?.solarKw !== undefined && (
        <section className="card strong">
          <span className="muted" style={{ fontWeight: 600 }}>
            Solel
          </span>
          <div style={{ alignSelf: "center", color: "var(--amber)", opacity: e.solarKw > 0.05 ? 1 : 0.5 }}>
            <Icon name="sun" size={72} strokeWidth={1.5} />
          </div>
          <span className="big-num" style={{ fontSize: 40 }}>
            {fmtNum(e.solarKw)}
            <small>kW</small>
          </span>
        </section>
      )}
      {e?.gridKw !== undefined && (
        <section className="card strong">
          <span className="muted" style={{ fontWeight: 600 }}>
            Elnät
          </span>
          <div className="flow" aria-hidden="true">
            <Icon name="bolt" size={56} strokeWidth={1.5} />
            <span className={`arrows ${e.gridKw < 0 ? "reverse" : ""}`}>
              <Icon name="chevronRight" size={32} strokeWidth={3} />
              <Icon name="chevronRight" size={32} strokeWidth={3} />
              <Icon name="chevronRight" size={32} strokeWidth={3} />
            </span>
            <Icon name="home" size={56} strokeWidth={1.5} />
          </div>
          <span className="big-num" style={{ fontSize: 34 }}>
            {e.gridKw >= 0 ? "Köper" : "Säljer"} {kw(Math.abs(e.gridKw))}
          </span>
        </section>
      )}
      {(e?.houseKw !== undefined || e?.batteryPct !== undefined) && (
        <section className="card">
          <div className="stats" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {e?.houseKw !== undefined && (
              <div>
                <small>Huset nu</small>
                <b className="big-num">{kw(e.houseKw)}</b>
              </div>
            )}
            {e?.batteryPct !== undefined && (
              <div>
                <small>Hembatteri</small>
                <b className="big-num">{Math.round(e.batteryPct)} %</b>
              </div>
            )}
          </div>
        </section>
      )}
      {data.prices && <PriceCard prices={data.prices} />}
    </main>
  );
}

// ---------- Graphs ----------

function LineChart({ data }: { data: GraphData }) {
  const W = 600;
  const H = 180;
  const all = data.series.flatMap((s) => s.points.filter((p): p is number => p !== null));
  if (!all.length) return <p className="muted">Ingen historik ännu.</p>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = Math.max(...data.series.map((s) => s.points.length));
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - 8 - ((v - min) / span) * (H - 16);
  const path = (pts: (number | null)[]) =>
    pts
      .map((p, i) => (p === null ? null : `${i === 0 || pts[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const time = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={data.title}>
        {data.series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="axis">
        <span>{time(data.from)}</span>
        <span>
          min {fmtNum(min)} · max {fmtNum(max)}
        </span>
        <span>{time(data.to)}</span>
      </div>
    </div>
  );
}

function GraphCard({ index }: { index: number }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .graph(index)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [index]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{data?.title ?? "Graf"}</h2>
        <span className="muted tabular">
          {data?.series
            .map((s) => {
              const last = [...s.points].reverse().find((p) => p !== null);
              return last === undefined ? "–" : fmtNum(last);
            })
            .join(" · ")}
        </span>
      </div>
      {data && (
        <div className="legend">
          {data.series.map((s) => (
            <span key={s.name}>
              <span className="dot" style={{ background: s.color, width: 16, height: 4 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {data && <LineChart data={data} />}
    </section>
  );
}

export function GraphsPage({ data }: { data: Dashboard }) {
  return (
    <main className="page-grid">
      {data.graphs.map((g) => (
        <GraphCard key={g.index} index={g.index} />
      ))}
      {data.prices && <PriceCard prices={data.prices} />}
    </main>
  );
}
