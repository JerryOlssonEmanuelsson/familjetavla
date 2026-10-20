import type { Dashboard } from "../../../server/src/types";
import { AnimatedNumber } from "../dashboard/bits";
import type { WidgetModule } from "./types";

export function PriceCard({ prices }: { prices: NonNullable<Dashboard["prices"]> }) {
  const max = Math.max(...prices.bars.map((b) => b.price), 0.01);
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const ticks = prices.bars.filter((_, i) => i % 6 === 0 || i === prices.bars.length - 1);
  return (
    <section className="card strong">
      <div className="card-head">
        <h2>Elpris</h2>
        <span className={`chip ${prices.level === "dyrt" ? "danger" : prices.level === "billigt" ? "good" : ""}`}>{prices.level}</span>
      </div>
      <div className="row gap" style={{ alignItems: "baseline" }}>
        <span className="muted">Nu</span>
        <span className="big-num">
          <AnimatedNumber value={prices.now} decimals={2} />
          <small>kr/kWh{prices.kind === "spot" ? " spot" : ""}</small>
        </span>
      </div>
      <div className="bars" role="img" aria-label={`Elpris kommande ${prices.bars.length} timmar`}>
        {prices.bars.map((b, i) => (
          <div
            key={i}
            className={b.current ? "current" : b.cheap ? "cheap" : ""}
            style={{ height: `${Math.round((b.price / max) * 96) + 6}px` }}
            title={`${b.hour}:00 ${fmt(b.price)} kr`}
          />
        ))}
      </div>
      <div className="axis">
        {ticks.map((t, i) => (
          <span key={i}>{t.hour}</span>
        ))}
      </div>
      {prices.cheapest && (
        <b style={{ color: "var(--accent)", fontSize: 15 }}>
          Billigast {prices.cheapest.from}–{prices.cheapest.to} · {fmt(prices.cheapest.avg)} kr
        </b>
      )}
    </section>
  );
}

const widget: WidgetModule = {
  id: "prices",
  label: "Elpris",
  size: (data) => (data.prices ? 3 : 0),
  render: ({ data }) => (data.prices ? <PriceCard prices={data.prices} /> : null),
  opens: { tab: "energy" },
};
export default widget;
