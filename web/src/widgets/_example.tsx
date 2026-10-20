/**
 * MALL / TEMPLATE – a card for the home screen that is NOT registered.
 * Copy this file, rename it, and add it to WIDGETS in index.ts. See README.md in this folder.
 * Uses CSS classes the board already has (card, stats), so it looks right in light, dark and e-ink.
 */
import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

function ExampleCard({ temps }: { temps: Dashboard["temps"] }) {
  return (
    <section className="card">
      <h2>Exempel</h2>
      <div className="stats">
        {temps.slice(0, 4).map((t) => (
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
  id: "temps", // must be an id in HOME_WIDGETS (server/src/types.ts) – add a new one there
  label: "Exempel",
  size: (data) => (data.temps.length ? 1 + Math.ceil(data.temps.length / 2) : 0),
  render: ({ data }) => <ExampleCard temps={data.temps} />,
  opens: { tab: "house" },
};
export default widget;
