import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

export function Temps({ temps }: { temps: Dashboard["temps"] }) {
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

const widget: WidgetModule = {
  id: "temps",
  label: "Temperaturer",
  size: (data) => (data.temps.length ? 1 + Math.ceil(data.temps.length / 2) : 0),
  render: ({ data }) => <Temps temps={data.temps} />,
  opens: { tab: "house" },
};
export default widget;
