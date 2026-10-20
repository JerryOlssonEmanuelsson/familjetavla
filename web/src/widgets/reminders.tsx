import type { Dashboard, Reminder } from "../../../server/src/types";
import { Icon, type IconName } from "../Icon";
import type { WidgetModule } from "./types";

const REMINDER_ICON: Record<Reminder["icon"], IconName> = {
  rain: "umbrella",
  bag: "bag",
  gym: "gym",
  trash: "trash",
  kids: "kids",
  info: "info",
  school: "school",
  food: "food",
};

export function Reminders({ items: all, food, limit }: { items: Reminder[]; food: Dashboard["schoolFood"]; limit?: number }) {
  if (!all.length && !food?.length) return null;
  // On the home screen: the most important few; the Kom ihåg page shows them all.
  const items = limit ? all.slice(0, limit) : all;
  const more = all.length - items.length;
  return (
    <section className="card strong">
      <h2>Kom ihåg</h2>
      {items.map((r, i) => (
        <div className="reminder" key={i}>
          <div className={`ico tone-${r.tone}`}>
            <Icon name={REMINDER_ICON[r.icon]} />
          </div>
          <div>
            <b>{r.title}</b>
            <small>{r.sub}</small>
          </div>
        </div>
      ))}
      {more > 0 && <div className="more-hint">+{more} till – tryck för alla</div>}
      {food?.map((f, i) => (
        <div className="reminder" key={`f${i}`}>
          <div className="ico tone-green">
            <Icon name="food" />
          </div>
          <div>
            <b>Skolmat {f.day.toLowerCase()}</b>
            <small>{f.dishes.join(" · ")}</small>
          </div>
        </div>
      ))}
    </section>
  );
}

/** With the Maten card on, the school lunch lives there instead of here. */
const mealsOn = (data: Dashboard) => data.home.some((w) => w.id === "meals" && w.on);

const widget: WidgetModule = {
  id: "reminders",
  label: "Kom ihåg",
  size: (data) => {
    const food = mealsOn(data) ? 0 : (data.schoolFood?.length ?? 0);
    return data.reminders.length || food ? 1 + Math.min(4, data.reminders.length) + food : 0;
  },
  render: ({ data, full }) => <Reminders items={data.reminders} food={mealsOn(data) ? undefined : data.schoolFood} limit={full ? undefined : 4} />,
  opens: { page: "komihag" },
};
export default widget;
