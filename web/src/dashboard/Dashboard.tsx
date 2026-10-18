import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DashEvent, Dashboard as Dash, TravelChoice, TravelLeg } from "../../../server/src/types";
import { api, isDemo } from "../api";
import { Icon, type IconName } from "../Icon";
import { INNER_NAME } from "../IpadFrame";
import { Avatar, EventIcon } from "./bits";
import { GroceryModal } from "./GroceryModal";
import { Home } from "./Home";
import { CarsPage, EnergyPage, GraphsPage, HousePage, LightsPage } from "./Pages";

type Tab = "home" | "cars" | "lights" | "house" | "energy" | "graphs";

const TABS: { id: Tab; label: string; icon: IconName; show: (d: Dash) => boolean }[] = [
  { id: "home", label: "Hem", icon: "calendar", show: () => true },
  { id: "cars", label: "Bil", icon: "car", show: (d) => d.cars.length > 0 },
  { id: "lights", label: "Ljus", icon: "bulb", show: (d) => d.lightGroups.length + d.buttons.length + d.lights.length > 0 },
  { id: "house", label: "Hus", icon: "home", show: (d) => d.climates.length + d.temps.length > 0 },
  { id: "energy", label: "Energi", icon: "bolt", show: (d) => Boolean(d.energy || d.prices) },
  { id: "graphs", label: "Grafer", icon: "graph", show: (d) => d.graphs.length > 0 || Boolean(d.prices) },
];

const THEME_KEY = "familjetavla.theme";

function readThemeOverride(): "dark" | "light" | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export interface Actions {
  refresh: () => Promise<void>;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  /** Like run, but asks "Är du säker?" first – for heating, locks and similar. */
  confirm: (question: string, label: string, fn: () => Promise<unknown>) => void;
  openGrocery: () => void;
  /** Tap on an event: show its details in a sheet. */
  openEvent: (e: DashEvent & { dayLabel?: string }) => void;
}

const SKY_ICON: Record<string, IconName> = { clear: "sun", partly: "partly", cloudy: "cloud", rain: "rain", snow: "snow", fog: "cloud" };

/** Photo frame shown after a while without touch: family photos (or the sky) with clock and what's next. */
function IdleFrame({ data, clock, onWake }: { data: Dash; clock: string; onWake: () => void }) {
  const photos = data.idle.photos;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % photos.length), 12_000);
    return () => clearInterval(t);
  }, [photos.length]);
  const next = data.now.items[0];
  return (
    <button className="idle" onClick={onWake} aria-label="Visa tavlan">
      {photos.length ? (
        photos.map((p, k) => <span key={p} className={`photo ${k === i ? "show" : ""}`} style={{ backgroundImage: `url("api/photos/${encodeURIComponent(p)}")` }} />)
      ) : (
        <span className="ambient sky">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="overlay-info">
        <span>
          <span className="clock">{clock}</span>
          <span className="next">
            {data.header.dateLabel}
            {next && (
              <small>
                {next.dayLabel === "idag" ? "" : `${next.dayLabel} `}
                {next.time} · {next.title}
                {next.who ? ` · ${next.who}` : ""}
              </small>
            )}
          </span>
        </span>
        {data.header.tempNow !== undefined && (
          <span className="clock" style={{ fontSize: "clamp(56px, 7vw, 96px)" }}>
            {data.header.tempNow}°
          </span>
        )}
      </span>
    </button>
  );
}

/** Latest copy of an event (after a travel change the dashboard is reloaded). */
function findEvent(data: Dash, key: string): DashEvent | undefined {
  for (const day of data.days) for (const e of day.events) if (e.travel?.key === key) return e;
  return data.now.items.find((e) => e.travel?.key === key);
}

const MODE_ICON = (mode: string): IconName => (mode === "bus" ? "bus" : mode === "self" ? "bike" : "car");

function TravelPicker({
  label,
  leg,
  options,
  onPick,
}: {
  label: string;
  leg?: TravelLeg;
  options: Dash["travelOptions"];
  onPick: (leg: TravelLeg | undefined) => void;
}) {
  const [by, setBy] = useState(leg?.by ?? "");
  useEffect(() => setBy(leg?.by ?? ""), [leg?.by]);
  return (
    <div className="travel-pick">
      <div className="travel-pick-label">
        <Icon name={label === "Dit" || label === "Lämnar" ? "arrowRight" : "arrowLeft"} size={18} />
        {label}
      </div>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = leg?.mode === o.mode;
          return (
            <button
              key={o.mode}
              role="radio"
              aria-checked={on}
              className={`seg-btn ${on ? "on" : ""}`}
              onClick={() => onPick(on ? undefined : { mode: o.mode, ...(o.mode === "ride" && by ? { by } : {}) })}
            >
              <Icon name={MODE_ICON(o.mode)} size={18} />
              {o.label}
            </button>
          );
        })}
      </div>
      {leg?.mode === "ride" && (
        <input
          className="input"
          placeholder="Med vem? (valfritt)"
          value={by}
          maxLength={40}
          onChange={(x) => setBy(x.target.value)}
          onBlur={() => by !== (leg.by ?? "") && onPick({ mode: "ride", ...(by.trim() ? { by: by.trim() } : {}) })}
        />
      )}
    </div>
  );
}

function EventSheet({
  e: initial,
  data,
  onClose,
  onChanged,
}: {
  e: DashEvent & { dayLabel?: string };
  data: Dash;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const fresh = initial.travel ? findEvent(data, initial.travel.key) : undefined;
  const e = { ...initial, ...(fresh ? { travel: fresh.travel } : {}) };
  const t = e.travel;
  const [busy, setBusy] = useState(false);
  const save = async (choice: TravelChoice, forCalendar = false) => {
    if (!t) return;
    setBusy(true);
    try {
      await api.travel(t.key, choice.to || choice.home ? choice : null, forCalendar);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const current: TravelChoice = { to: t?.to && { mode: t.to.mode, by: t.to.by }, home: t?.home && { mode: t.home.mode, by: t.home.by } };
  // Förskola: who drops off and picks up – adults by name, or someone else.
  const care = t?.kind === "care";
  const options = care
    ? data.travelOptions.filter((o) => o.mode.startsWith("adult:") || o.mode === "ride").map((o) => ({ ...o, label: o.mode === "ride" ? "Någon annan" : o.label.replace(/ skjutsar$/, "") }))
    : data.travelOptions;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={e.title} onClick={(x) => x.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="row gap">
          <EventIcon icon={e.icon} color={e.color} size={26} />
          <h2 className="grow" style={{ fontSize: 24 }}>
            {e.title}
          </h2>
          <button className="btn icon" aria-label="Stäng" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="stack" style={{ gap: 10, fontSize: 17 }}>
          <div className="row gap">
            <Icon name="event" size={20} />
            <span>
              {e.dayLabel ? `${e.dayLabel[0].toUpperCase()}${e.dayLabel.slice(1)} ` : ""}
              {e.time ? `${e.time}${e.end ? `–${e.end}` : ""}` : "Hela dagen"}
            </span>
          </div>
          {e.who && (
            <div className="row gap">
              <Avatar initial={e.initial ?? e.who[0]} color={e.color} name={e.who} />
              <span>{e.who}</span>
            </div>
          )}
          {e.location && (
            <div className="row gap">
              <Icon name="pin" size={20} />
              <span>{e.location}</span>
            </div>
          )}
        </div>
        {t && (
          <div className={`travel-box ${busy ? "busy" : ""}`}>
            <h3>{care ? `Vem lämnar och hämtar ${e.who || "barnet"}?` : `Hur tar sig ${e.who || "barnet"} dit och hem?`}</h3>
            <TravelPicker label={care ? "Lämnar" : "Dit"} leg={current.to} options={options} onPick={(to) => save({ ...current, to })} />
            <TravelPicker label={care ? "Hämtar" : "Hem"} leg={current.home} options={options} onPick={(home) => save({ ...current, home })} />
            <div className="row gap wrap travel-foot">
              <span className="muted grow">
                {t.fromCalendar ? (care ? "Brukar vara så." : `Standard för ${t.calendarName ?? "kalendern"}.`) : t.to || t.home ? (care ? "Gäller bara den här dagen." : "Gäller bara det här tillfället.") : "Inget valt än."}
              </span>
              {t.calendarId && (t.to || t.home) && !t.fromCalendar && (
                <button className="btn small ghost" onClick={() => save(current, true)}>
                  {care ? "Gör till standard" : `Använd för alla i ${t.calendarName ?? "kalendern"}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState("");
  const [grocery, setGrocery] = useState(false);
  const [awakeUntil, setAwakeUntil] = useState(0);
  const [themeOverride, setThemeOverride] = useState(readThemeOverride);
  const [asking, setAsking] = useState<{ question: string; label: string; fn: () => Promise<unknown> } | null>(null);
  const [eventOpen, setEventOpen] = useState<(DashEvent & { dayLabel?: string }) | null>(null);
  const [idle, setIdle] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<number>(0);
  const lastTouch = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 60_000);
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    // Live updates: the server pushes "change" when something on the board changes in HA.
    let es: EventSource | null = null;
    let soon = 0;
    try {
      if (!isDemo) es = new EventSource("api/events");
      if (es)
      es.onmessage = () => {
        window.clearTimeout(soon);
        soon = window.setTimeout(refresh, 150);
      };
    } catch {
      /* polling still works */
    }
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  };

  const run: Actions["run"] = async (label, fn) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      showToast(`${label}: ${(e as Error).message}`);
    }
  };
  const actions: Actions = {
    refresh,
    openGrocery: () => setGrocery(true),
    run,
    confirm: (question, label, fn) => setAsking({ question, label, fn }),
    openEvent: setEventOpen,
  };

  // Theme: explicit choice (button) wins, else config: auto follows "dygnsfärger" (light dawn/day, dark dusk/night).
  const phase = data?.header.phase ?? "night";
  const theme = themeOverride ?? (data?.theme === "auto" || !data ? (phase === "dawn" || phase === "day" ? "light" : "dark") : data.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.phase = theme === "light" ? (phase === "dawn" ? "dawn" : "day") : phase === "dusk" ? "dusk" : "night";
    root.dataset.sky = data?.header.sky ?? "partly";
  }, [theme, phase, data?.header.sky]);

  // Photo frame after N minutes without touch.
  useEffect(() => {
    const touch = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    const t = window.setInterval(() => {
      const mins = data?.idle.minutes ?? 0;
      if (mins > 0 && Date.now() - lastTouch.current > mins * 60_000) setIdle(true);
    }, 10_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(t);
    };
  }, [data?.idle.minutes]);

  // Switch tab with a sliding view transition where the browser supports it.
  const goTab = (next: Tab, list: Tab[]) => {
    if (next === tab) return;
    const dir = list.indexOf(next) > list.indexOf(tab) ? 1 : -1;
    document.documentElement.style.setProperty("--dir", String(dir));
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doc.startViewTransition(() => flushSync(() => setTab(next)));
    } else setTab(next);
    window.scrollTo({ top: 0 });
  };

  // Gestures: swipe sideways between tabs, pull down at the top to refresh.
  const gesture = useRef<{ x: number; y: number; t: number; pulling: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    const target = e.target as HTMLElement;
    if (target.closest("input, select, textarea, .bars, .chart")) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), pulling: window.scrollY <= 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    const dx = e.clientX - g.x;
    if (g.pulling && dy > 0 && Math.abs(dy) > Math.abs(dx)) setPull(Math.min(110, dy * 0.6));
  };
  const onPointerUp = async (e: React.PointerEvent, list: Tab[]) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (pull >= 80) {
      setRefreshing(true);
      await refresh();
      setRefreshing(false);
    }
    setPull(0);
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - g.t < 600) {
      const i = list.indexOf(tab) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < list.length) goTab(list[i], list);
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeOverride(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (!data) {
    return (
      <div className="center-screen">
        {error ? (
          <div className="card">
            <h2>Kunde inte hämta tavlan</h2>
            <p className="muted">{error}</p>
            <button className="btn primary" onClick={refresh}>
              Försök igen
            </button>
          </div>
        ) : (
          <span className="muted">Laddar tavlan…</span>
        )}
      </div>
    );
  }

  const tabOn = (id: Tab) => id === "home" || data.tabs.find((t) => t.id === id)?.on !== false;
  const order = (id: Tab) => (id === "home" ? -1 : data.tabs.findIndex((t) => t.id === id));
  const tabs = TABS.filter((t) => t.show(data) && tabOn(t.id)).sort((a, b) => order(a.id) - order(b.id));
  const clock = now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const sleeping = data.night && Date.now() > awakeUntil;

  const tabIds = tabs.map((t) => t.id);

  return (
    <div
      className="app-bg"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e, tabIds)}
      onPointerCancel={() => {
        gesture.current = null;
        setPull(0);
      }}
    >
      <div className="sky" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={`pull ${refreshing ? "spin" : ""}`} style={{ ["--pull" as string]: `${refreshing ? 30 : pull - 80}px` }} aria-hidden="true">
        <Icon name="refresh" size={22} />
      </div>
      <div className="board">
        <header className="board-header">
          <div className="grow">
            <h1>
              <span className={`status-dot ${data.errors.length ? "warn" : ""}`} aria-hidden="true" />
              {data.header.dateLabel}
            </h1>
            <p className="sub">
              {data.header.sky && <Icon name={SKY_ICON[data.header.sky] ?? "partly"} size={20} />}
              <span>Vecka {data.header.week}</span>
              {isDemo && (
                <>
                  <button className="btn small ghost" style={{ minHeight: 30, color: "var(--blue)" }} onClick={() => setIdle(true)}>
                    Visa viloläge
                  </button>
                  <span className="chip warn" style={{ padding: "2px 10px", fontSize: 12 }}>Demo · låtsasdata</span>
                  <button
                    className="btn small ghost"
                    style={{ minHeight: 30, color: "var(--blue)" }}
                    onClick={() => {
                      location.hash = "forsta";
                      location.reload();
                    }}
                  >
                    Prova första starten
                  </button>
                  {window.name !== INNER_NAME && (
                    <button
                      className="btn small ghost"
                      style={{ minHeight: 30, color: "var(--blue)" }}
                      onClick={() => {
                        location.hash = "ipad";
                        location.reload();
                      }}
                    >
                      Visa som iPad
                    </button>
                  )}
                </>
              )}
              {data.header.weather && <span>· {data.header.weather}</span>}
            </p>
          </div>
          {data.people.length > 0 && (
            <div className="people" aria-label="Vem är hemma">
              {data.people.map((p) => (
                <Avatar key={p.name} initial={p.initial} color={p.color} name={p.name} away={!p.home} size="lg" />
              ))}
            </div>
          )}
          <div className="clock" aria-label={`Klockan är ${clock}`}>
            {clock}
          </div>
          <div className="row gap">
            <button className="btn icon" aria-label={theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"} onClick={toggleTheme}>
              <Icon name={theme === "dark" ? "moon" : "sun"} size={24} />
            </button>
            <a className="btn icon" aria-label="Inställningar" href="#/setup">
              <Icon name="gear" size={24} />
            </a>
          </div>
        </header>

        {data.errors.length > 0 && (
          <details className="card" style={{ padding: "12px 18px" }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              {data.errors.length} källa{data.errors.length === 1 ? "" : "or"} svarar inte just nu
            </summary>
            <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {data.errors.map((e, i) => (
                <li key={i}>
                  <b>{e.source}:</b> {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="tab-page">
          {tab === "home" && <Home data={data} actions={actions} />}
          {tab === "cars" && <CarsPage data={data} actions={actions} />}
          {tab === "lights" && <LightsPage data={data} actions={actions} />}
          {tab === "house" && <HousePage data={data} actions={actions} />}
          {tab === "energy" && <EnergyPage data={data} />}
          {tab === "graphs" && <GraphsPage data={data} />}
        </div>
      </div>

      {tabs.length > 1 && (
        <nav className="tabbar" aria-label="Flikar">
          {tabs.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTab(t.id, tabIds)}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {grocery && (
        <GroceryModal
          onClose={() => setGrocery(false)}
          onDone={(msg) => {
            setGrocery(false);
            showToast(msg);
            refresh();
          }}
        />
      )}

      {asking && (
        <div className="overlay" onClick={() => setAsking(null)}>
          <div className="sheet" role="alertdialog" aria-modal="true" aria-label={asking.question} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2 style={{ fontSize: 22 }}>{asking.question}</h2>
            <div className="row gap" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setAsking(null)}>
                Avbryt
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => {
                  const a = asking;
                  setAsking(null);
                  run(a.label, a.fn);
                }}
              >
                Ja
              </button>
            </div>
          </div>
        </div>
      )}

      {eventOpen && <EventSheet e={eventOpen} data={data} onClose={() => setEventOpen(null)} onChanged={refresh} />}

      {idle && !sleeping && (
        <IdleFrame
          data={data}
          clock={clock}
          onWake={() => {
            lastTouch.current = Date.now();
            setIdle(false);
          }}
        />
      )}

      {sleeping && (
        <button className="night-veil" onClick={() => setAwakeUntil(Date.now() + 2 * 60_000)} aria-label="Väck skärmen">
          {/* Pixel shift: the clock wanders slowly so an OLED panel does not burn in. */}
          <span className="clock" style={{ transform: `translate(${((now.getMinutes() * 37) % 41) - 20}vw, ${((now.getMinutes() * 23) % 31) - 15}vh)` }}>
            {clock}
          </span>
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
