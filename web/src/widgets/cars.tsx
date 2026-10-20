import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

export function Cars({ cars }: { cars: Dashboard["cars"] }) {
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

const widget: WidgetModule = {
  id: "cars",
  label: "Bilar",
  size: (data) => (data.cars.length ? 1 + data.cars.length : 0),
  render: ({ data }) => <Cars cars={data.cars} />,
  opens: { tab: "cars" },
};
export default widget;
