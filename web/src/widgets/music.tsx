import { useState } from "react";
import type { Dashboard } from "../../../server/src/types";
import { api } from "../api";
import { Icon } from "../Icon";
import type { Actions } from "../dashboard/Dashboard";
import type { WidgetModule } from "./types";

const KEY = "familjetavla.speaker";
function savedSpeaker(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Musik: tap a station and it plays on the chosen speaker (Google/Nest, Sonos, Chromecast …). */
export function Music({ data, actions }: { data: Dashboard; actions: Actions }) {
  const m = data.music;
  // Each screen remembers its own speaker: the kitchen board plays in the kitchen.
  const [chosen, setChosen] = useState(savedSpeaker);
  if (!m || !m.speakers.length) return null;
  const sp = m.speakers.find((s) => s.entityId === chosen) ?? m.speakers[0]!;
  const choose = (id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
  };
  const speakerNow = (d: Dashboard) => d.music?.speakers.find((s) => s.entityId === sp.entityId);
  const play = (index: number, name: string) =>
    actions.run(name, () => api.playStation(index, sp.entityId), {
      done: `${name} spelar i ${sp.name}`,
      check: (d) => speakerNow(d)?.station === index,
      slow: `${name} är skickad till ${sp.name} – vissa högtalare tar en stund att starta.`,
    });
  const stop = () =>
    actions.run(`Stopp i ${sp.name}`, () => api.stopMusic(sp.entityId), { done: `Tyst i ${sp.name}`, check: (d) => !speakerNow(d)?.playing });
  const vol = sp.volume ?? null;
  const setVol = (pct: number) => actions.run(`Volym i ${sp.name}`, () => api.volume(sp.entityId, Math.max(0, Math.min(100, pct))));
  return (
    <section className="card music-card" style={{ flexGrow: 1 }}>
      <div className="card-head">
        <h2>Musik</h2>
      </div>
      {m.speakers.length > 1 && (
        <div className="seg small music-speakers" role="radiogroup" aria-label="Högtalare">
          {m.speakers.map((s) => (
            <button key={s.entityId} className={`seg-btn ${s.entityId === sp.entityId ? "on" : ""}`} role="radio" aria-checked={s.entityId === sp.entityId} onClick={() => choose(s.entityId)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="music-now">
        <Icon name="speaker" size={20} />
        <span className="music-title">
          {sp.offline ? `${sp.name} svarar inte` : sp.playing ? sp.title ?? "Spelar" : m.speakers.length > 1 ? "Tyst" : `${sp.name} · tyst`}
        </span>
        <span className="music-ctl">
          {!sp.offline && vol !== null && (
            <span className="music-vol">
              <button className="btn small ghost" aria-label="Sänk volymen" disabled={vol <= 0} onClick={() => void setVol(vol - 10)}>
                −
              </button>
              <b>{vol}</b>
              <button className="btn small ghost" aria-label="Höj volymen" disabled={vol >= 100} onClick={() => void setVol(vol + 10)}>
                +
              </button>
            </span>
          )}
          {sp.playing && (
            <button className="btn small" onClick={() => void stop()}>
              <Icon name="stop" size={16} /> Stopp
            </button>
          )}
        </span>
      </div>
      {m.stations.length > 0 ? (
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {m.stations.map((s) => {
            const on = sp.playing && sp.station === s.index;
            return (
              <button key={s.index} className={`light-btn station-btn ${on ? "on" : ""}`} aria-pressed={on} disabled={sp.offline} onClick={() => void play(s.index, s.name)}>
                {s.logo ? (
                  <img src={s.logo} alt="" width={24} height={24} loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                ) : (
                  <Icon name="music" size={20} />
                )}
                <span className="station-name">{s.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">Lägg till kanaler under Inställningar → Huset → Musik.</p>
      )}
    </section>
  );
}

const widget: WidgetModule = {
  id: "music",
  label: "Musik",
  size: (data) => (data.music?.speakers.length ? 2 + Math.ceil(Math.max(1, data.music.stations.length) / 2) : 0),
  render: ({ data, actions }) => <Music data={data} actions={actions} />,
};
export default widget;
