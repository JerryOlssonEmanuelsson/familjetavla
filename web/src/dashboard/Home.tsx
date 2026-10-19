import { useState } from "react";
import type { Dashboard, Reminder } from "../../../server/src/types";
import { api } from "../api";
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

function Reminders({ items, food }: { items: Reminder[]; food: Dashboard["schoolFood"] }) {
  if (!items.length && !food?.length) return null;
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

function Custody({ c }: { c: NonNullable<Dashboard["custody"]> }) {
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

function Shopping({ data, actions }: { data: Dashboard; actions: Actions }) {
  const [text, setText] = useState("");
  const items = data.shopping.items;
  const open = items.filter((i) => !i.done).length;
  const done = items.length - open;
  return (
    <section className="card" style={{ flexGrow: 1 }}>
      <div className="card-head">
        <h2>Inköpslista</h2>
        <span className="muted">
          {open} {open === 1 ? "vara" : "varor"}
        </span>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        {items.length === 0 && <p className="faint">Listan är tom.</p>}
        {items.map((i) => (
          <label key={i.id} className={`shop-item ${i.done ? "done" : ""}`}>
            <input type="checkbox" checked={i.done} onChange={(e) => actions.run("Inköpslistan", () => api.toggleItem(i.id, e.target.checked))} />
            <span>{i.name}</span>
          </label>
        ))}
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

function Week({ data, actions }: { data: Dashboard; actions: Actions }) {
  return (
    <section className="card area-week week-swipe">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <h2>Kommande 7 dagar</h2>
        {(data.plan.items.length > 0 || data.meals.some((m) => m.lunch.length || m.dinner)) && (
          <button className={`btn small plan-btn ${data.plan.missing ? "warn" : ""}`} onClick={actions.openPlan}>
            <Icon name="kids" size={18} />
            {data.plan.missing ? `Planera veckan · ${data.plan.missing} utan ansvarig` : "Planera veckan"}
          </button>
        )}
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
      <div className="stack" style={{ gap: 8 }}>
        {data.days.map((d, di) => (
          <div key={d.key} className={`day ${d.isToday ? "today" : ""} ${di < 2 ? "big" : ""}`}>
            <div className="day-name">
              <b>{d.name}</b>
              <small>{d.date}</small>
            </div>
            <div className="events">
              {d.events.length === 0 && <span className="empty-day">Inget inplanerat</span>}
              {d.events.map((e, i) => (
                <button className="event" key={i} onClick={() => actions.openEvent({ ...e, dayLabel: d.name.toLowerCase() })} aria-label={eventLabel(e)}>
                  <EventIcon icon={e.icon} color={e.color} size={di < 2 ? 17 : 15} />
                  {e.time && <span className="t">{e.time}</span>}
                  <span className="title">{e.title}</span>
                  <TravelBadge t={e.travel} />
                  {e.who && e.initial && <Avatar initial={e.initial} color={e.color} name={e.who} />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
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
export function Home({ data, actions }: { data: Dashboard; actions: Actions }) {
  const render = (id: Dashboard["home"][number]["id"]): React.ReactNode => {
    switch (id) {
      case "reminders":
        return <Reminders key={id} items={data.reminders} food={data.schoolFood} />;
      case "custody":
        return data.custody ? <Custody key={id} c={data.custody} /> : null;
      case "shopping":
        return <Shopping key={id} data={data} actions={actions} />;
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
  };
  const chosen = data.home.filter((w) => w.on);
  const nowOn = chosen.some((w) => w.id === "now");
  const weekOn = chosen.some((w) => w.id === "week");
  const rest = chosen.filter((w) => w.id !== "week" && w.id !== "now").map((w) => render(w.id)).filter(Boolean);
  // Left column under the Nu zone, side column to the right: first half left, the rest right.
  const half = Math.ceil(rest.length / 2);
  return (
    <main className="home-grid">
      {nowOn && <NowZone data={data} actions={actions} />}
      <div className="col area-left">{rest.slice(0, half)}</div>
      {weekOn ? <Week data={data} actions={actions} /> : <div className="area-week" />}
      <div className="col area-side">{rest.slice(half)}</div>
    </main>
  );
}
