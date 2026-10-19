import { useState } from "react";
import type { Dashboard, Reminder } from "../../../server/src/types";
import { api } from "../api";
import { Fit } from "./Fit";
import { Icon, type IconName } from "../Icon";
import { AnimatedNumber, Avatar, EventIcon, eventLabel, TravelBadge, travelText } from "./bits";
import type { Actions } from "./Dashboard";

const REMINDER_ICON: Record<Reminder["icon"], IconName> = {
  rain: "umbrella",
  bag: "bag",
  gym: "gym",
  trash: "trash",
  kids: "kids",
  info: "info",
  school: "school",
  food: "food",
};

export function Ring({ progress, size = 92, stroke = 9, children }: { progress: number; size?: number; stroke?: number; children: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chip)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, Math.min(1, progress)) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="label">{children}</div>
    </div>
  );
}

/** Today's school lunch per child (tomorrow's after 14) and tonight's dinner – big enough for the kids. */
function Meals({ data }: { data: Dashboard }) {
  const h = new Date().getHours();
  const start = h >= 14 ? 1 : 0;
  // The next school day with a menu: after Friday lunch that is Monday.
  const lunch = data.meals.slice(start, start + 4).find((d) => d.lunch.length);
  const dinnerDay = h < 20 ? data.meals[0] : data.meals[1];
  const dinner = dinnerDay?.dinner;
  if (!lunch && !dinner) return null;
  const when = (label: string) => (label === "idag" || label === "imorgon" ? label : `på ${label.split(" ")[0]}`);
  return (
    <section className="card meals-card">
      <h2>Maten</h2>
      {lunch && (
        <div className="meal-block">
          <span className="eyebrow">Lunch {when(lunch.dayLabel)}</span>
          {lunch.lunch.map((l) => (
            <div className="meal-line" key={l.child + l.dishes.join()}>
              <Icon name="school" size={20} />
              <span>
                {l.child && <b>{l.child}: </b>}
                {l.dishes.join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
      {dinner && (
        <div className="meal-block">
          <span className="eyebrow">Middag {dinnerDay === data.meals[0] ? "ikväll" : "imorgon"}</span>
          <div className="meal-line">
            <Icon name="food" size={20} />
            <span>{dinner}</span>
          </div>
        </div>
      )}
    </section>
  );
}

/** When each child's school day starts and ends – "Ella slutar 14:30". */
function SchoolDay({ rows }: { rows: NonNullable<Dashboard["schoolDay"]> }) {
  if (!rows.length) return null;
  const day = rows[0].dayLabel;
  const sameDay = rows.every((r) => r.dayLabel === day);
  return (
    <section className="card schoolday-card">
      <h2>Skolan {sameDay ? (day === "idag" || day === "imorgon" ? day : `på ${day}`) : ""}</h2>
      {rows.map((r) => (
        <div className="school-row" key={r.personId}>
          <span className="dot" style={{ background: r.color }} aria-hidden="true" />
          <b className="grow">
            {r.name}
            {!sameDay && <small className="muted"> {r.dayLabel}</small>}
          </b>
          {r.gym && (
            <span className="gym" title="Idrott – ta med gympapåsen">
              Idrott
            </span>
          )}
          <span className="school-times">
            <small className="muted">{r.start}–</small>
            <b>{r.end}</b>
          </span>
        </div>
      ))}
    </section>
  );
}

export function Reminders({ items: all, food, limit }: { items: Reminder[]; food: Dashboard["schoolFood"]; limit?: number }) {
  if (!all.length && !food?.length) return null;
  // On the home screen: the most important few; the Kom ihåg page shows them all.
  const items = limit ? all.slice(0, limit) : all;
  const more = all.length - items.length;
  return (
    <section className="card strong">
      <h2>Kom ihåg</h2>
      {items.map((r, i) => (
        <div className="reminder" key={i}>
          <div className={`ico tone-${r.tone}`}>
            <Icon name={REMINDER_ICON[r.icon]} />
          </div>
          <div>
            <b>{r.title}</b>
            <small>{r.sub}</small>
          </div>
        </div>
      ))}
      {more > 0 && <div className="more-hint">+{more} till – tryck för alla</div>}
      {food?.map((f, i) => (
        <div className="reminder" key={`f${i}`}>
          <div className="ico tone-green">
            <Icon name="food" />
          </div>
          <div>
            <b>Skolmat {f.day.toLowerCase()}</b>
            <small>{f.dishes.join(" · ")}</small>
          </div>
        </div>
      ))}
    </section>
  );
}

export function Custody({ c }: { c: NonNullable<Dashboard["custody"]> }) {
  if (c.rows) {
    // Children with different rhythms: one row each, nearest change first.
    return (
      <section className="card custody custody-rows">
        <span className="eyebrow">Hos oss</span>
        {c.rows.map((r) => (
          <div key={r.names} className={`custody-row ${r.home ? "home" : "away"}`}>
            <span className="dot" style={{ background: r.color }} aria-hidden="true" />
            <b className="grow">{r.names}</b>
            <span className="muted">{r.text}</span>
          </div>
        ))}
      </section>
    );
  }
  return (
    <section className="card custody">
      <div className="grow stack" style={{ gap: 6 }}>
        <span className="eyebrow">Hos oss</span>
        <b style={{ fontSize: 22, lineHeight: 1.2 }}>{c.headline}</b>
        <span className="muted" style={{ fontSize: 14 }}>
          {c.sub}
        </span>
      </div>
      <Ring progress={c.progress}>
        <b style={{ fontSize: 26, lineHeight: 1 }}>{c.daysLeft}</b>
        <small className="muted">{c.daysLeft === 1 ? "dag" : "dagar"}</small>
      </Ring>
    </section>
  );
}

export function Shopping({ data, actions, limit }: { data: Dashboard; actions: Actions; limit?: number }) {
  const [text, setText] = useState("");
  const all = data.shopping.items;
  // Home screen: the first few to buy; the Inköpslista page shows everything.
  const items = limit ? all.filter((i) => !i.done).slice(0, limit) : all;
  const hidden = all.filter((i) => !i.done).length - items.filter((i) => !i.done).length;
  const open = all.filter((i) => !i.done).length;
  const done = all.length - open;
  return (
    <section className="card" style={{ flexGrow: 1 }}>
      <div className="card-head">
        <h2>Inköpslista</h2>
        <span className="muted">
          {open} {open === 1 ? "vara" : "varor"}
        </span>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        {all.length === 0 && <p className="faint">Listan är tom.</p>}
        {items.map((i) => (
          <label key={i.id} className={`shop-item ${i.done ? "done" : ""}`}>
            <input type="checkbox" checked={i.done} onChange={(e) => actions.run("Inköpslistan", () => api.toggleItem(i.id, e.target.checked))} />
            <span>{i.name}</span>
          </label>
        ))}
        {hidden > 0 && <div className="more-hint">+{hidden} till – tryck för hela listan</div>}
      </div>
      <form
        className="row gap"
        onSubmit={(e) => {
          e.preventDefault();
          const name = text.trim();
          if (!name) return;
          setText("");
          actions.run("Lägg till", () => api.addItem(name));
        }}
      >
        <label className="sr-only" htmlFor="add-item">
          Lägg till vara
        </label>
        <input id="add-item" className="input grow" placeholder="Lägg till vara…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn icon" style={{ width: 52, height: 52 }} aria-label="Lägg till">
          <Icon name="plus" />
        </button>
      </form>
      <div className="row gap wrap">
        {done > 0 && (
          <button className="btn small" onClick={() => actions.run("Rensa", () => api.clearDone())}>
            Rensa avbockade
          </button>
        )}
        {data.grocery && open > 0 && (
          <button className="btn primary grow" onClick={actions.openGrocery}>
            <Icon name="cart" size={20} />
            Skicka till {data.grocery.name}
          </button>
        )}
      </div>
    </section>
  );
}

const SKY_LABEL: Record<string, string> = { clear: "Klart", partly: "Halvklart", cloudy: "Mulet", rain: "Regn", snow: "Snö", fog: "Dimma" };
const SKY_ICON: Record<string, IconName> = { clear: "sun", partly: "partly", cloudy: "cloud", rain: "rain", snow: "snow", fog: "cloud" };

/** The big "Nu" zone: what happens in the next few hours, readable from across the room. */
function NowZone({ data, actions }: { data: Dashboard; actions: Actions }) {
  const { now, header } = data;
  return (
    <section className="card strong now area-now" aria-label="Nu">
      <div style={{ minWidth: 0 }}>
        <span className="eyebrow">Nu</span>
        <div className="now-headline">{now.headline}</div>
        {now.items.length > 0 && (
          <div className="now-list">
            {now.items.map((e, i) => (
              <button key={i} className={`now-item ${i === 0 ? "first" : ""}`} onClick={() => actions.openEvent(e)}>
                <EventIcon icon={e.icon} color={e.color} size={24} />
                <span className="time">{e.time}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="what" style={{ display: "block" }}>
                    {e.title}
                  </span>
                  <span className="when">
                    {e.dayLabel === "idag" ? (e.inMinutes > 0 && e.inMinutes < 120 ? `om ${e.inMinutes} min` : "idag") : e.dayLabel}
                    {e.location ? ` · ${e.location}` : ""}
                    {e.travel && ` · ${travelText(e.travel) || (e.travel.kind === "care" ? "vem lämnar och hämtar?" : "välj skjuts")}`}
                  </span>
                </span>
                {e.who && e.initial && <Avatar initial={e.initial} color={e.color} name={e.who} size="lg" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {(header.tempNow !== undefined || header.sky) && (
        <div className="weather-now">
          {header.sky && (
            <span className="sky-ico">
              <Icon name={SKY_ICON[header.sky] ?? "partly"} size={44} strokeWidth={1.6} />
            </span>
          )}
          {header.tempNow !== undefined && (
            <span className="temp">
              <AnimatedNumber value={header.tempNow} />°
            </span>
          )}
          {header.sky && <span className="muted">{SKY_LABEL[header.sky]}</span>}
        </div>
      )}
    </section>
  );
}

function MoreButton({ n, what, label, onClick }: { n: number; what: string; label?: string; onClick: () => void }) {
  return (
    <button className="btn small more-btn" onClick={onClick}>
      +{n} {what} {label ? `– ${label}` : "till"} <Icon name="chevronRight" size={16} />
    </button>
  );
}

export function Week({ data, actions, full = false }: { data: Dashboard; actions: Actions; full?: boolean }) {
  return (
    <section className="card area-week week-swipe">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        {/* On its own page the page title already says it – the room goes to the days. */}
        {full ? <h2 className="sr-only">Kommande 7 dagar</h2> : <h2>Kommande 7 dagar</h2>}
        {full && <span className="grow" />}
        {/* Always there: it is also where the week's dinners are planned, even with nothing to drive to. */}
        <button
          className={`btn small plan-btn ${data.plan.missing ? "warn" : ""}`}
          aria-label={data.plan.missing ? `Planera veckan, ${data.plan.missing} att lösa` : "Planera veckan"}
          onClick={() => actions.openPlan()}
        >
          <Icon name="kids" size={18} />
          <span className="plan-long">
            {data.plan.missing ? `Planera veckan · ${data.plan.missing} att lösa` : data.plan.items.length ? "Planera veckan" : "Planera veckans mat"}
          </span>
          <span className="plan-short">
            <span className="plan-word">Planera</span>
            {data.plan.missing ? <span className="plan-count">{data.plan.missing}</span> : null}
          </span>
        </button>
        <div className="legend">
          {data.legend
            .filter((l) => !data.people.some((p) => p.name === l.name))
            .map((l) => (
              <span key={l.name}>
                <span className="dot" style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
        </div>
      </div>
      <Fit className={full ? "week-full" : "week-body"} deps={[data]} min={0.8} more={full ? undefined : (n) => <MoreButton n={n} what={n === 1 ? "dag" : "dagar"} label="visa hela veckan" onClick={() => actions.openPage("veckan")} />}>
        {data.days.map((d, di) => (
          <div key={d.key} className={`day ${d.isToday ? "today" : ""} ${di < 2 ? "big" : ""}`}>
            <div className="day-name">
              <b>{d.name}</b>
              <small>{d.date}</small>
            </div>
            <div className="events">
              {d.events.length === 0 && <span className="empty-day">Inget inplanerat</span>}
              {d.events.slice(0, full ? undefined : 3).map((e, i) => (
                <button className="event" key={i} onClick={() => actions.openEvent({ ...e, dayLabel: d.name.toLowerCase() })} aria-label={eventLabel(e)}>
                  <EventIcon icon={e.icon} color={e.color} size={di < 2 ? 17 : 15} />
                  {e.time && <span className="t">{e.time}</span>}
                  <span className="title">{e.title}</span>
                  <TravelBadge t={e.travel} />
                  {e.who && e.initial && <Avatar initial={e.initial} color={e.color} name={e.who} />}
                </button>
              ))}
              {!full && d.events.length > 3 && (
                <button className="more-chip" aria-label={`${d.events.length - 3} till – visa hela veckan`} onClick={() => actions.openPage("veckan")}>
                  +{d.events.length - 3}
                </button>
              )}
            </div>
          </div>
        ))}
      </Fit>
    </section>
  );
}

export function PriceCard({ prices }: { prices: NonNullable<Dashboard["prices"]> }) {
  const max = Math.max(...prices.bars.map((b) => b.price), 0.01);
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const ticks = prices.bars.filter((_, i) => i % 6 === 0 || i === prices.bars.length - 1);
  return (
    <section className="card strong">
      <div className="card-head">
        <h2>Elpris</h2>
        <span className={`chip ${prices.level === "dyrt" ? "danger" : prices.level === "billigt" ? "good" : ""}`}>{prices.level}</span>
      </div>
      <div className="row gap" style={{ alignItems: "baseline" }}>
        <span className="muted">Nu</span>
        <span className="big-num">
          <AnimatedNumber value={prices.now} decimals={2} />
          <small>kr/kWh{prices.kind === "spot" ? " spot" : ""}</small>
        </span>
      </div>
      <div className="bars" role="img" aria-label={`Elpris kommande ${prices.bars.length} timmar`}>
        {prices.bars.map((b, i) => (
          <div
            key={i}
            className={b.current ? "current" : b.cheap ? "cheap" : ""}
            style={{ height: `${Math.round((b.price / max) * 96) + 6}px` }}
            title={`${b.hour}:00 ${fmt(b.price)} kr`}
          />
        ))}
      </div>
      <div className="axis">
        {ticks.map((t, i) => (
          <span key={i}>{t.hour}</span>
        ))}
      </div>
      {prices.cheapest && (
        <b style={{ color: "var(--accent)", fontSize: 15 }}>
          Billigast {prices.cheapest.from}–{prices.cheapest.to} · {fmt(prices.cheapest.avg)} kr
        </b>
      )}
    </section>
  );
}

function Cars({ cars }: { cars: Dashboard["cars"] }) {
  if (!cars.length) return null;
  return (
    <section className="card">
      {cars.map((c) => (
        <div className="stack" style={{ gap: 8 }} key={c.name}>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <b style={{ fontSize: 17 }}>{c.name}</b>
            <span className="big-num" style={{ fontSize: 22 }}>
              {c.battery ?? "–"}
              <small>%</small>
            </span>
          </div>
          <div className="meter">
            <div style={{ width: `${c.battery ?? 0}%` }} />
          </div>
          <span className="muted" style={{ fontSize: 14 }}>
            {c.status || " "}
          </span>
        </div>
      ))}
    </section>
  );
}

function Lights({ data, actions }: { data: Dashboard; actions: Actions }) {
  if (!data.lights.length && !data.temps.length) return null;
  return (
    <section className="card" style={{ flexGrow: 1 }}>
      {data.lights.length > 0 && (
        <>
          <div className="card-head">
            <h2>Ljus</h2>
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
        </>
      )}
      {data.temps.length > 0 && (
        <div className="stats" style={{ marginTop: "auto", paddingTop: 12, borderTop: data.lights.length ? "1px solid var(--card-border)" : undefined }}>
          {data.temps.slice(0, 3).map((t) => (
            <div key={t.name}>
              <small>{t.name}</small>
              <b>{t.value}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Temps({ temps }: { temps: Dashboard["temps"] }) {
  if (!temps.length) return null;
  return (
    <section className="card">
      <h2>Temperaturer</h2>
      <div className="stats">
        {temps.map((t) => (
          <div key={t.name}>
            <small>{t.name}</small>
            <b>{t.value}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnergyMini({ e }: { e: Dashboard["energy"] }) {
  if (!e) return null;
  const f = (n?: number) => (n === undefined ? "–" : `${n.toFixed(1).replace(".", ",")} kW`);
  return (
    <section className="card">
      <h2>Energi</h2>
      <div className="stats">
        {e.solarKw !== undefined && (
          <div>
            <small>Solel</small>
            <b>{f(e.solarKw)}</b>
          </div>
        )}
        {e.gridKw !== undefined && (
          <div>
            <small>{e.gridKw >= 0 ? "Köper" : "Säljer"}</small>
            <b>{f(Math.abs(e.gridKw))}</b>
          </div>
        )}
        {e.houseKw !== undefined && (
          <div>
            <small>Huset</small>
            <b>{f(e.houseKw)}</b>
          </div>
        )}
        {e.batteryPct !== undefined && (
          <div>
            <small>Batteri</small>
            <b>{Math.round(e.batteryPct)} %</b>
          </div>
        )}
      </div>
    </section>
  );
}

function ClimatesMini({ climates }: { climates: Dashboard["climates"] }) {
  if (!climates.length) return null;
  const f = (n: number | null) => (n === null ? "–" : `${String(Math.round(n * 10) / 10).replace(".", ",")}°`);
  return (
    <section className="card">
      <h2>Värme</h2>
      <div className="stats">
        {climates.slice(0, 6).map((c) => (
          <div key={c.entityId}>
            <small>{c.name}</small>
            <b>{f(c.current ?? c.target)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The home screen is a bento grid built from the user's chosen widgets, in their order:
 * the "Nu" zone across the top, the week in the wide middle, the rest split between the
 * side columns. Widgets without data render nothing, so a choice never shows an empty box.
 */
/** One home card. `full` (on the "Alla kort" page) shows lists in full instead of the home-screen summary. */
export function renderWidget(id: Dashboard["home"][number]["id"], data: Dashboard, actions: Actions, full = false): React.ReactNode {
  const mealsOn = data.home.some((w) => w.id === "meals" && w.on);
  switch (id) {
    case "reminders":
      // With the Maten card on, the lunch lives there instead.
      return <Reminders key={id} items={data.reminders} food={mealsOn ? undefined : data.schoolFood} limit={full ? undefined : 4} />;
    case "meals":
      return <Meals key={id} data={data} />;
    case "schoolday":
      return data.schoolDay?.length ? <SchoolDay key={id} rows={data.schoolDay} /> : null;
    case "custody":
      return data.custody ? <Custody key={id} c={data.custody} /> : null;
    case "shopping":
      return <Shopping key={id} data={data} actions={actions} limit={full ? undefined : 5} />;
    case "prices":
      return data.prices ? <PriceCard key={id} prices={data.prices} /> : null;
    case "cars":
      return <Cars key={id} cars={data.cars} />;
    case "lights":
      return <Lights key={id} data={{ ...data, temps: [] }} actions={actions} />;
    case "temps":
      return <Temps key={id} temps={data.temps} />;
    case "energy":
      return <EnergyMini key={id} e={data.energy} />;
    case "climates":
      return <ClimatesMini key={id} climates={data.climates} />;
    default:
      return null;
  }
}

export function Home({ data, actions }: { data: Dashboard; actions: Actions }) {
  const mealsOn = data.home.some((w) => w.id === "meals" && w.on);
  const render = (id: Dashboard["home"][number]["id"]) => renderWidget(id, data, actions);
  const chosen = data.home.filter((w) => w.on);
  const nowOn = chosen.some((w) => w.id === "now");
  const weekOn = chosen.some((w) => w.id === "week");
  // Decide from the data which widgets have something to show, and roughly how tall they are,
  // before splitting them into columns. (A React element that renders nothing is still truthy.)
  const size = (id: Dashboard["home"][number]["id"]): number => {
    switch (id) {
      case "reminders": {
        const food = mealsOn ? 0 : (data.schoolFood?.length ?? 0);
        return data.reminders.length || food ? 1 + Math.min(4, data.reminders.length) + food : 0;
      }
      case "schoolday":
        return data.schoolDay?.length ? 1 + data.schoolDay.length : 0;
      case "meals": {
        const lunchRows = data.meals.slice(0, 5).find((d) => d.lunch.length)?.lunch.length ?? 0;
        const dinner = data.meals[0]?.dinner || data.meals[1]?.dinner ? 1 : 0;
        return lunchRows || dinner ? 1 + lunchRows + dinner : 0;
      }
      case "custody":
        return data.custody ? 1 + (data.custody.rows?.length ?? 1) : 0;
      case "shopping":
        return 2 + Math.min(5, data.shopping?.items?.filter((i) => !i.done).length ?? 0);
      case "prices":
        return data.prices ? 3 : 0;
      case "cars":
        return data.cars.length ? 1 + data.cars.length : 0;
      case "lights":
        return data.lights.length || data.temps.length ? 2 + Math.ceil(data.lights.length / 2) : 0;
      case "temps":
        return data.temps.length ? 1 + Math.ceil(data.temps.length / 2) : 0;
      case "energy":
        return data.energy ? 2 : 0;
      case "climates":
        return data.climates.length ? 1 + data.climates.length : 0;
      default:
        return 0;
    }
  };
  // Size per card: chosen in Startskärm, or "auto" – few cards get bigger, many get more compact.
  const withData = chosen.filter((w) => w.id !== "week" && w.id !== "now" && size(w.id) > 0);
  const autoSize = withData.length <= 2 ? "l" : withData.length <= 5 ? "m" : "s";
  const scale = { s: 0.88, m: 1, l: 1.18 } as const;
  const shown = withData.map((w) => {
    const sz = !w.size || w.size === "auto" ? autoSize : w.size;
    return { id: w.id, sz, h: size(w.id) * scale[sz] };
  });
  // The first cards in the user's order go to the tall side column (top right on the iPad, right
  // under Nu on a phone), so what matters most is always in view. The rest goes under the Nu zone.
  const total = shown.reduce((a, w) => a + w.h, 0);
  let acc = 0;
  let cut = shown.length;
  for (let i = 0; i < shown.length - 1; i++) {
    acc += shown[i].h;
    cut = i + 1;
    if (acc >= total * 0.65) break;
  }
  // A tap anywhere on a card (but not on its buttons, boxes and fields) opens its own page or tab.
  const open = (id: string) => {
    const page = ({ meals: "maten", schoolday: "skolan", reminders: "komihag", shopping: "inkop", custody: "hososs" } as const)[id as "meals"];
    if (page) return actions.openPage(page);
    const tab = ({ prices: "energy", energy: "energy", cars: "cars", lights: "lights", temps: "house", climates: "house" } as const)[id as "prices"];
    if (tab) actions.openTab(tab);
  };
  const rest = shown.map((w) => (
    <div
      className={`wsize wsize-${w.sz} opens`}
      key={w.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, select, textarea, a, label, .no-open")) return;
        open(w.id);
      }}
    >
      {render(w.id)}
    </div>
  ));
  const half = cut;
  return (
    <main className="home-grid">
      {nowOn && <NowZone data={data} actions={actions} />}
      <Fit className="col area-left" deps={[data]} min={0.8} more={(n) => <MoreButton n={n} what="kort" onClick={() => actions.openPage("kort")} />}>
        {rest.slice(half)}
      </Fit>
      {weekOn ? <Week data={data} actions={actions} /> : <div className="area-week" />}
      <Fit className="col area-side" deps={[data]} min={0.8} more={(n) => <MoreButton n={n} what="kort" onClick={() => actions.openPage("kort")} />}>
        {rest.slice(0, half)}
      </Fit>
    </main>
  );
}
