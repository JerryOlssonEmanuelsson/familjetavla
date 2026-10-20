import type { Dashboard } from "../../../server/src/types";
import { api } from "../api";
import { Icon } from "../Icon";
import type { Actions } from "../dashboard/Dashboard";
import type { WidgetModule } from "./types";

export function Lights({ data, actions }: { data: Dashboard; actions: Actions }) {
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

const widget: WidgetModule = {
  id: "lights",
  label: "Ljus",
  size: (data) => (data.lights.length || data.temps.length ? 2 + Math.ceil(data.lights.length / 2) : 0),
  render: ({ data, actions }) => <Lights data={{ ...data, temps: [] }} actions={actions} />,
  opens: { tab: "lights" },
};
export default widget;
