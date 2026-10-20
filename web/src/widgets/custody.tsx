import type { Dashboard } from "../../../server/src/types";
import { Ring } from "../dashboard/bits";
import type { WidgetModule } from "./types";

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

const widget: WidgetModule = {
  id: "custody",
  label: "Hos oss (växelvis boende)",
  size: (data) => (data.custody ? 1 + (data.custody.rows?.length ?? 1) : 0),
  render: ({ data }) => (data.custody ? <Custody c={data.custody} /> : null),
  opens: { page: "hososs" },
};
export default widget;
