import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

/** When each child's school day starts and ends – "Ella slutar 14:30". */
export function SchoolDay({ rows }: { rows: NonNullable<Dashboard["schoolDay"]> }) {
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

const widget: WidgetModule = {
  id: "schoolday",
  label: "Skolan idag – när barnen börjar och slutar",
  size: (data) => (data.schoolDay?.length ? 1 + data.schoolDay.length : 0),
  render: ({ data }) => (data.schoolDay?.length ? <SchoolDay rows={data.schoolDay} /> : null),
  opens: { page: "skolan" },
};
export default widget;
