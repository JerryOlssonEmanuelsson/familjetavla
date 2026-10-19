import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DashEvent, Dashboard as Dash, TravelChoice, TravelLeg } from "../../../server/src/types";
import { sameAsLunch } from "../../../server/src/mealwords";
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
  /** "Planera veckan": set who drops off / picks up / drives for the whole week. */
  openPlan: () => void;
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

const SHELF_ITEMS = ["Blöjor", "Extrakläder", "Regnkläder", "Stövlar", "Mössa och vantar", "Våtservetter", "Solkräm", "Napp"];

/** "Saknas på hyllan": tap what the staff said was missing; it stays in Kom ihåg until tapped off. */
function ShelfPicker({ data, personId, onChanged }: { data: Dash; personId: string; onChanged: () => Promise<void> }) {
  const current = data.shelf.find((s) => s.personId === personId)?.items ?? [];
  const toggle = async (item: string) => {
    const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
    await api.shelf(personId, next);
    await onChanged();
  };
  return (
    <div className="shelf-box">
      <h3>Saknas på hyllan?</h3>
      <div className="fav-chips">
        {SHELF_ITEMS.map((it) => (
          <button key={it} className={`chip-btn ${current.includes(it) ? "on" : ""}`} aria-pressed={current.includes(it)} onClick={() => toggle(it)}>
            {current.includes(it) && <Icon name="check" size={14} />} {it}
          </button>
        ))}
      </div>
      <small className="faint">Det du markerar står i Kom ihåg tills du trycker bort det här.</small>
    </div>
  );
}

/** For förskola: grown-ups by name and "Någon annan"; for activities: every way to get there. */
function legOptions(data: Dash, care: boolean): Dash["travelOptions"] {
  return care
    ? data.travelOptions.filter((o) => o.mode.startsWith("adult:") || o.mode === "ride").map((o) => ({ ...o, label: o.mode === "ride" ? "Någon annan" : o.label.replace(/ skjutsar$/, "") }))
    : data.travelOptions.map((o) => ({ ...o, label: o.label.replace(/ skjutsar$/, "") }));
}

/** Small row of choices inside the week plan. Grown-ups who are busy then get a ⚠ and the reason below. */
function MiniPick({
  label,
  leg,
  options,
  onPick,
  busy = [],
}: {
  label: string;
  leg?: TravelLeg;
  options: Dash["travelOptions"];
  onPick: (l: TravelLeg | undefined) => void;
  busy?: { personId: string; title: string }[];
}) {
  const busyOf = (mode: string) => busy.find((b) => mode === `adult:${b.personId}`);
  const chosenBusy = leg ? busyOf(leg.mode) : undefined;
  return (
    <div className={`mini-pick ${leg ? "" : "unset"} ${chosenBusy ? "conflict" : ""}`}>
      <span className="mini-label">{label}</span>
      <div className="seg small" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = leg?.mode === o.mode;
          const b = busyOf(o.mode);
          return (
            <button
              key={o.mode}
              role="radio"
              aria-checked={on}
              className={`seg-btn ${on ? "on" : ""} ${b ? "busy" : ""}`}
              title={b ? `Upptagen: ${b.title}` : undefined}
              onClick={() => onPick(on ? undefined : { mode: o.mode })}
            >
              {o.label}
              {b && <span aria-label="upptagen"> ⚠</span>}
            </button>
          );
        })}
      </div>
      {busy.length > 0 && (
        <small className="busy-note">
          {busy.map((b) => `${options.find((o) => o.mode === `adult:${b.personId}`)?.label ?? "?"}: ${b.title}`).join(" · ")}
        </small>
      )}
    </div>
  );
}

/** One day in "Veckans mat": the kids' lunch, tonight's dinner and what to buy for it. */
function MealRow({
  day,
  favorites,
  onChanged,
  toast,
}: {
  day: Dash["meals"][number];
  favorites: Dash["mealFavorites"];
  onChanged: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [dinner, setDinner] = useState(day.dinner ?? "");
  const [buy, setBuy] = useState("");
  const [shopping, setShopping] = useState(false);
  useEffect(() => setDinner(day.dinner ?? ""), [day.dinner]);
  const save = async () => {
    if (dinner.trim() === (day.dinner ?? "")) return;
    await api.dinner(day.dayKey, dinner.trim());
    await onChanged();
  };
  const twice = dinner.trim() ? sameAsLunch(dinner, day.lunch) : null;
  const pick = async (name: string) => {
    setDinner(name);
    await api.dinner(day.dayKey, name);
    await onChanged();
  };
  const fav = favorites.find((f) => f.name.toLowerCase() === dinner.trim().toLowerCase());
  const addToList = async (text: string) => {
    const items = text.split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.length) return;
    for (const it of items) await api.addItem(it);
    await api.dinner(day.dayKey, dinner.trim(), text);
    toast(`${items.length} ${items.length === 1 ? "vara" : "varor"} i inköpslistan`);
    await onChanged();
  };
  return (
    <div className="meal-day">
      <span className="eyebrow">{day.dayLabel}</span>
      {day.lunch.length > 0 ? (
        day.lunch.map((l) => (
          <div key={l.child + l.dishes.join()} className="meal-lunch">
            <Icon name="school" size={16} />
            <span>
              <b>{l.child ? `${l.child}: ` : "Lunch: "}</b>
              {l.dishes.join(" · ")}
            </span>
          </div>
        ))
      ) : (
        <div className="meal-lunch faint">Ingen skollunch</div>
      )}
      <div className="row gap">
        <Icon name="food" size={20} />
        <input
          className="input grow"
          placeholder="Middag…"
          value={dinner}
          maxLength={80}
          onChange={(e) => setDinner(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      {!dinner.trim() && favorites.length > 0 && (
        <div className="fav-chips" aria-label="Favoriter">
          {favorites.slice(0, 8).map((f) => (
            <button key={f.name} className="chip-btn" onClick={() => pick(f.name)}>
              {f.name}
            </button>
          ))}
        </div>
      )}
      {twice && <span className="chip warn">Samma som lunchen ({twice.toLowerCase()})</span>}
      {dinner.trim() && !shopping && (
        <div className="row gap wrap">
          {fav?.shopping && (
            <button className="btn small ghost" onClick={() => addToList(fav.shopping!)}>
              <Icon name="plus" size={16} /> Som vanligt: {fav.shopping}
            </button>
          )}
          <button className="btn small ghost" onClick={() => setShopping(true)}>
            <Icon name="plus" size={16} /> {fav?.shopping ? "Annat" : "Att handla"}
          </button>
        </div>
      )}
      {dinner.trim() && shopping && (
        <form
          className="row gap"
          onSubmit={async (e) => {
            e.preventDefault();
            await addToList(buy);
            setBuy("");
            setShopping(false);
          }}
        >
          <input className="input grow" autoFocus placeholder="T.ex. tacoskal, ost, gräddfil" value={buy} onChange={(e) => setBuy(e.target.value)} />
          <button className="btn small" disabled={!buy.trim()}>
            <Icon name="plus" size={16} /> Inköpslistan
          </button>
        </form>
      )}
    </div>
  );
}

/** "Planera veckan": everything in the next 7 days that needs someone, one tap per choice. */
function PlanSheet({ data, onClose, onChanged, toast, startTab = "who" }: { data: Dash; onClose: () => void; onChanged: () => Promise<void>; toast: (m: string) => void; startTab?: "who" | "food" }) {
  const [tab, setTab] = useState<"who" | "food">(startTab);
  const [busy, setBusy] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(data.plan.missing > 0);
  // Rows you just filled in stay put (so "Alltid så" can be tapped) until the sheet is closed.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const conflict = (i: Dash["plan"]["items"][number]) =>
    (i.busy ?? []).some((b) => (b.leg === "to" ? i.travel.to : i.travel.home)?.mode === `adult:${b.personId}`);
  const items = data.plan.items.filter((i) => !onlyMissing || !i.travel.to || !i.travel.home || conflict(i) || touched.has(i.travel.key));
  const days = [...new Set(items.map((i) => i.dayKey))];
  const save = async (key: string, choice: TravelChoice, forCalendar = false) => {
    setBusy(key);
    setTouched((t) => new Set(t).add(key));
    try {
      await api.travel(key, choice.to || choice.home ? choice : null, forCalendar);
      await onChanged();
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet plan-sheet" role="dialog" aria-modal="true" aria-label="Planera veckan" onClick={(x) => x.stopPropagation()}>
        <div className="row gap">
          <h2 className="grow" style={{ fontSize: 26 }}>
            Planera veckan
          </h2>
          <button className="btn icon" aria-label="Stäng" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="seg small" role="tablist" aria-label="Planera">
          <button role="tab" aria-selected={tab === "who"} className={`seg-btn ${tab === "who" ? "on" : ""}`} onClick={() => setTab("who")}>
            Vem gör vad{data.plan.missing ? ` · ${data.plan.missing}` : ""}
          </button>
          <button role="tab" aria-selected={tab === "food"} className={`seg-btn ${tab === "food" ? "on" : ""}`} onClick={() => setTab("food")}>
            Veckans mat
          </button>
        </div>
        {tab === "food" && (
          <div className="stack plan-list">
            <p className="muted">Skriv in middagarna – barnens lunch står bredvid så ni slipper laga samma sak.</p>
            {data.meals.map((m) => (
              <MealRow key={m.dayKey} day={m} favorites={data.mealFavorites} onChanged={onChanged} toast={toast} />
            ))}
          </div>
        )}
        {tab === "who" && <>
        <div className="row gap wrap">
          <span className={`chip ${data.plan.missing ? "warn" : "good"}`}>
            {data.plan.missing ? `${data.plan.missing} att lösa` : "Allt har någon som ansvarar ✓"}
          </span>
          <button className="btn small ghost" onClick={() => setOnlyMissing(!onlyMissing)}>
            {onlyMissing ? "Visa allt" : "Bara det som saknas"}
          </button>
        </div>
        {items.length === 0 && <p className="muted">{onlyMissing ? "Klart! Allt den här veckan har någon som lämnar, hämtar eller skjutsar." : "Inga aktiviteter eller förskoledagar de kommande 7 dagarna."}</p>}
        <div className="stack plan-list">
          {days.map((dk) => (
            <div key={dk} className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">{items.find((i) => i.dayKey === dk)!.dayLabel}</span>
              {items
                .filter((i) => i.dayKey === dk)
                .map((i) => {
                  const t = i.travel;
                  const care = t.kind === "care";
                  const cur: TravelChoice = { to: t.to && { mode: t.to.mode, by: t.to.by }, home: t.home && { mode: t.home.mode, by: t.home.by } };
                  const opts = legOptions(data, care);
                  return (
                    <div key={t.key} className={`plan-item ${!t.to || !t.home || conflict(i) ? "missing" : ""} ${busy === t.key ? "saving" : ""}`}>
                      <div className="row gap">
                        <EventIcon icon={i.icon} color={i.color} size={22} />
                        <b className="time">{i.time}</b>
                        <span className="grow">{i.title.replace(/^Lämning · /, "")}</span>
                        {i.initial && <Avatar initial={i.initial} color={i.color} name={i.who} />}
                      </div>
                      <MiniPick label={care ? "Lämnar" : "Dit"} leg={cur.to} options={opts} busy={i.busy?.filter((b) => b.leg === "to")} onPick={(to) => save(t.key, { ...cur, to })} />
                      <MiniPick label={care ? "Hämtar" : "Hem"} leg={cur.home} options={opts} busy={i.busy?.filter((b) => b.leg === "home")} onPick={(home) => save(t.key, { ...cur, home })} />
                      {t.calendarId && t.to && t.home && !t.fromCalendar && (
                        <button className="btn small ghost" style={{ justifySelf: "start" }} onClick={() => save(t.key, cur, true)}>
                          {care ? `Gör till standard för ${i.who}` : `Alltid så för ${t.calendarName ?? "kalendern"}`}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        <small className="faint">Valen gäller bara den dagen. Tryck "Alltid så" för att göra dem till standard – standard räknas som planerat och syns inte här igen.</small>
        </>}
      </div>
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
  const options = care ? legOptions(data, true) : data.travelOptions;
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
        {care && t?.calendarId && <ShelfPicker data={data} personId={t.calendarId.slice(5)} onChanged={onChanged} />}
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
  const [planOpen, setPlanOpen] = useState(false);
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

  // Anything that fails without its own message (a sheet save, a shelf tick) still tells the user.
  useEffect(() => {
    const onFail = (ev: PromiseRejectionEvent) => {
      ev.preventDefault();
      showToast(`Det gick inte att spara: ${(ev.reason as Error)?.message ?? "okänt fel"}`);
    };
    window.addEventListener("unhandledrejection", onFail);
    return () => window.removeEventListener("unhandledrejection", onFail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    openPlan: () => setPlanOpen(true),
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
      <div className={`board ${tabs.length > 1 ? "" : "no-tabs"}`}>
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

        {error && (
          <div className="card result bad" role="status" style={{ padding: "12px 18px" }}>
            Ingen kontakt med tavlan just nu – visar det som hämtades {new Date(data.generatedAt ?? Date.now()).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}. Försöker igen.
          </div>
        )}
        {data.errors.length > 0 && (
          <details className="card" style={{ padding: "12px 18px" }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              {data.errors.length} {data.errors.length === 1 ? "källa" : "källor"} svarar inte just nu
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
      {planOpen && <PlanSheet data={data} onClose={() => setPlanOpen(false)} onChanged={refresh} toast={showToast} />}

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
