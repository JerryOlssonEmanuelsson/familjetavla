import type { Dashboard } from "../../../server/src/types";
import type { WidgetModule } from "./types";

/** "Batteri", "Laddar 1,2 kW" eller "Laddar ur 0,8 kW". */
export function batteryVerb(kw?: number, label = "Batteri") {
  if (kw === undefined || Math.abs(kw) < 0.02) return label;
  const v = Math.abs(kw).toFixed(1).replace(".", ",");
  return kw > 0 ? `Laddar ${v} kW` : `Laddar ur ${v} kW`;
}

export function EnergyMini({ e, price }: { e: Dashboard["energy"]; price?: number }) {
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
        {e.gridKw !== undefined && e.gridKw > 0.005 && price !== undefined && (
          <div>
            <small>Kostar nu</small>
            <b>{(e.gridKw * price).toFixed(2).replace(".", ",")} kr/tim</b>
          </div>
        )}
        {e.batteryPct !== undefined && (
          <div>
            <small>{batteryVerb(e.batteryKw)}</small>
            <b>{Math.round(e.batteryPct)} %</b>
          </div>
        )}
      </div>
    </section>
  );
}

const widget: WidgetModule = {
  id: "energy",
  label: "Energi",
  size: (data) => (data.energy ? 2 : 0),
  render: ({ data }) => <EnergyMini e={data.energy} price={data.prices?.now} />,
  opens: { tab: "energy" },
};
export default widget;
