import { Fragment } from "react";
import type { Dashboard } from "../../../server/src/types";
import { Fit } from "./Fit";
import { Icon, type IconName } from "../Icon";
import { AnimatedNumber, Avatar, EventIcon, eventLabel, TravelBadge, travelText } from "./bits";
import type { Actions } from "./Dashboard";
import { widget } from "../widgets";

const SKY_LABEL: Record<string, string> = { clear: "Klart", partly: "Halvklart", cloudy: "Mulet", rain: "Regn", snow: "Snö", fog: "Dimma" };
const SKY_ICON: Record<string, IconName> = { clear: "sun", partly: "partly", cloudy: "cloud", rain: "rain", snow: "snow", fog: "cloud" };

/** One home card. `full` (on the "Alla kort" page) shows lists in full instead of the home-screen summary. */
export function renderWidget(id: Dashboard["home"][number]["id"], data: Dashboard, actions: Actions, full = false): React.ReactNode {
  const w = widget(id);
  return w ? <Fragment key={id}>{w.render({ data, actions, full })}</Fragment> : null;
}

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
          {header.sun && <SunArc sun={header.sun} />}
        </div>
      )}
    </section>
  );
}

/** Today's sun as a bow from sunrise to sunset, with the sun where it is now. */
function SunArc({ sun }: { sun: NonNullable<Dashboard["header"]["sun"]> }) {
  const p = sun.pos;
  const x = p === undefined ? 0 : 60 - 50 * Math.cos(p * Math.PI);
  const y = p === undefined ? 0 : 48 - 38 * Math.sin(p * Math.PI);
  const arc = "M10 48 A50 38 0 0 1 110 48";
  return (
    <div className={`sun-arc ${p === undefined ? "night" : ""}`} aria-label={`Solen går upp ${sun.rise} och ner ${sun.set}`}>
      <svg viewBox="0 0 120 54" aria-hidden="true">
        <line x1="4" y1="48" x2="116" y2="48" className="sa-horizon" />
        <path d={arc} className="sa-track" />
        {p !== undefined && <path d={arc} className="sa-done" pathLength={1} strokeDasharray={`${p} 1`} />}
        {p !== undefined && <circle cx={x} cy={y} r="6" className="sa-sun" />}
      </svg>
      <span className="sa-times">
        <span>↑ {sun.rise}</span>
        <span>↓ {sun.set}</span>
      </span>
    </div>
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

/**
 * The home screen is a bento grid built from the user's chosen widgets, in their order:
 * the "Nu" zone across the top, the week in the wide middle, the rest split between the
 * side columns. Each card is a module in web/src/widgets/; one without data is left out.
 */
export function Home({ data, actions }: { data: Dashboard; actions: Actions }) {
  const chosen = data.home.filter((w) => w.on);
  const nowOn = chosen.some((w) => w.id === "now");
  const weekOn = chosen.some((w) => w.id === "week");
  // Which cards have something to show, and roughly how tall they are, before splitting into columns.
  const size = (id: Dashboard["home"][number]["id"]) => widget(id)?.size(data) ?? 0;
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
  const open = (id: Dashboard["home"][number]["id"]) => {
    const to = widget(id)?.opens;
    if (to && "page" in to) actions.openPage(to.page);
    else if (to) actions.openTab(to.tab);
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
      {renderWidget(w.id, data, actions)}
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
