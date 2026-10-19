import { useState } from "react";
import type { Dashboard } from "../../../server/src/types";
import { Icon } from "../Icon";
import { goBack, goHome } from "../route";
import type { Actions } from "./Dashboard";
import { Custody, Reminders, Shopping } from "./Home";

export type PageId = "maten" | "skolan" | "komihag" | "inkop" | "hososs";

export const PAGE_TITLES: Record<PageId, string> = {
  maten: "Veckans mat",
  skolan: "Skolan",
  komihag: "Kom ihåg",
  inkop: "Inköpslista",
  hososs: "Hos oss",
};

/** Every page and tab: back, the title, and home – always in the same place. */
export function PageBar({ title }: { title: string }) {
  return (
    <div className="page-bar">
      <button className="btn" onClick={goBack} aria-label="Tillbaka">
        <Icon name="chevronLeft" size={22} /> Tillbaka
      </button>
      <h1 className="grow">{title}</h1>
      <button className="btn" onClick={goHome} aria-label="Till startsidan">
        <Icon name="home" size={22} /> Hem
      </button>
    </div>
  );
}

export function DetailPage({ page, data, actions }: { page: PageId; data: Dashboard; actions: Actions }) {
  return (
    <main className="detail-page">
      <PageBar title={PAGE_TITLES[page]} />
      {page === "maten" && <MealsPage data={data} actions={actions} />}
      {page === "skolan" && <SchoolPage data={data} />}
      {page === "komihag" && <Reminders items={data.reminders} food={data.schoolFood} />}
      {page === "inkop" && <Shopping data={data} actions={actions} />}
      {page === "hososs" && <CustodyPage data={data} />}
    </main>
  );
}

function MealsPage({ data, actions }: { data: Dashboard; actions: Actions }) {
  return (
    <div className="stack">
      {data.meals.map((m) => (
        <section className="card meal-day-card" key={m.dayKey}>
          <h2>{m.dayLabel.charAt(0).toUpperCase() + m.dayLabel.slice(1)}</h2>
          {m.lunch.length ? (
            m.lunch.map((l) => (
              <div className="meal-line" key={l.child + l.dishes.join()}>
                <Icon name="school" size={20} />
                <span>
                  <b>{l.child ? `${l.child}: ` : "Lunch: "}</b>
                  {l.dishes.join(" · ")}
                </span>
              </div>
            ))
          ) : (
            <small className="muted">Ingen skollunch</small>
          )}
          <div className="meal-line">
            <Icon name="food" size={20} />
            <span>
              <b>Middag: </b>
              {m.dinner ?? <span className="muted">inte bestämt</span>}
            </span>
          </div>
        </section>
      ))}
      <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => actions.openPlan("food")}>
        <Icon name="food" size={20} /> Planera veckans middagar
      </button>
    </div>
  );
}

const KIND_LABEL = { läxa: "Läxa", prov: "Prov", inlämning: "Inlämning", uppgift: "Uppgift" } as const;

function SchoolPage({ data }: { data: Dashboard }) {
  const kids = data.school ?? [];
  const [who, setWho] = useState(kids[0]?.personId ?? "");
  if (!kids.length) {
    return (
      <section className="card">
        <p className="muted">
          Inget skolschema hittades. Lägg till skolan under Inställningar → Skola (Vklass, SchoolSoft eller kalenderlänk), så visas dagens schema,
          veckan och läxorna här.
        </p>
      </section>
    );
  }
  const kid = kids.find((k) => k.personId === who) ?? kids[0];
  const today = kid.days.find((d) => d.today);
  return (
    <div className="stack">
      {kids.length > 1 && (
        <div className="seg" role="tablist" aria-label="Barn">
          {kids.map((k) => (
            <button key={k.personId} role="tab" aria-selected={k.personId === kid.personId} className={`seg-btn ${k.personId === kid.personId ? "on" : ""}`} onClick={() => setWho(k.personId)}>
              <span className="dot" style={{ background: k.color }} /> {k.name}
            </button>
          ))}
        </div>
      )}
      <div className="school-grid">
        <section className="card">
          <h2>{today ? "Idag" : "Nästa skoldag"}</h2>
          <Lessons lessons={(today ?? kid.days.find((d) => d.lessons.length))?.lessons ?? []} />
        </section>
        <section className="card">
          <h2>Läxor och uppgifter</h2>
          {kid.tasks.length ? (
            kid.tasks.map((t, i) => (
              <div className="task-row" key={i}>
                <span className={`task-kind kind-${t.kind}`}>{KIND_LABEL[t.kind]}</span>
                <span className="grow">{t.title}</span>
                <small className="muted">{t.label}</small>
              </div>
            ))
          ) : (
            <small className="muted">Inget de närmaste två veckorna – eller så lägger skolan inte ut läxor i kalendern.</small>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Veckan</h2>
        <div className="school-week">
          {kid.days.map((d) => (
            <div className={`school-day ${d.today ? "today" : ""}`} key={d.dayKey}>
              <b>{d.label}</b>
              {d.lessons.length ? (
                <>
                  <small className="muted">
                    {d.lessons[0].start}–{d.lessons[d.lessons.length - 1].end}
                    {d.lessons.some((l) => l.gym) ? " · Idrott" : ""}
                  </small>
                  <Lessons lessons={d.lessons} compact />
                </>
              ) : (
                <small className="muted">Ingen skola</small>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Lessons({ lessons, compact = false }: { lessons: NonNullable<Dashboard["school"]>[number]["days"][number]["lessons"]; compact?: boolean }) {
  if (!lessons.length) return <small className="muted">Inga lektioner</small>;
  return (
    <div className={`lessons ${compact ? "compact" : ""}`}>
      {lessons.map((l, i) => (
        <div className="lesson" key={i}>
          <span className="lesson-time">
            {l.start}
            {!compact && `–${l.end}`}
          </span>
          <span className="grow">
            {l.title}
            {l.gym && <span className="gym"> Idrott</span>}
          </span>
          {!compact && l.location && <small className="muted">{l.location}</small>}
        </div>
      ))}
    </div>
  );
}

function CustodyPage({ data }: { data: Dashboard }) {
  const c = data.custody;
  if (!c) return <p className="muted">Inga barn bor växelvis.</p>;
  const start = new Date();
  const label = (i: number) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { wd: ["S", "M", "T", "O", "T", "F", "L"][d.getDay()], date: d.getDate(), monday: d.getDay() === 1 };
  };
  return (
    <div className="stack">
      <Custody c={c} />
      {c.calendar?.map((k) => (
        <section className="card" key={k.name}>
          <h2>
            <span className="dot" style={{ background: k.color }} /> {k.name} – kommande fyra veckor
          </h2>
          <div className="custody-strip" role="list">
            <span className="cday-head">M</span>
            <span className="cday-head">T</span>
            <span className="cday-head">O</span>
            <span className="cday-head">T</span>
            <span className="cday-head">F</span>
            <span className="cday-head">L</span>
            <span className="cday-head">S</span>
            {/* Start the grid on Monday so each row is a week. */}
            {Array.from({ length: (start.getDay() + 6) % 7 }, (_, i) => (
              <span key={`pad${i}`} aria-hidden="true" />
            ))}
            {k.days.map((home, i) => {
              const l = label(i);
              return (
                <div key={i} role="listitem" className={`cday ${home ? "home" : "away"} ${l.monday ? "monday" : ""}`} title={home ? "Hos oss" : "I andra hemmet"}>
                  <b>{l.date}</b>
                </div>
              );
            })}
          </div>
          <small className="muted">Färgad = hos oss · ljus = i andra hemmet</small>
        </section>
      ))}
    </div>
  );
}
