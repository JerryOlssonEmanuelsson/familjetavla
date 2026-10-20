import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

export function ClimatesMini({ climates }: { climates: Dashboard["climates"] }) {
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

const widget: WidgetModule = {
  id: "climates",
  label: "Värme",
  size: (data) => (data.climates.length ? 1 + data.climates.length : 0),
  render: ({ data }) => <ClimatesMini climates={data.climates} />,
  opens: { tab: "house" },
};
export default widget;
