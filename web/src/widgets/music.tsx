import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Dashboard, Music as MusicData } from "../../../server/src/types";
import { api, type DirStation } from "../api";
import { Icon } from "../Icon";
import type { Actions } from "../dashboard/Dashboard";
import type { WidgetModule } from "./types";

// ---------- Which speaker ----------
// The default speaker (first under Huset → Musik) is always one tap away: "RIX FM" plays in the
// kitchen. Picking another one in the Musik tab holds for a few minutes after the last tap, then the
// board goes back to the default. Shared by the home card and the tab.

const BACK_TO_DEFAULT_MS = 5 * 60_000;
let chosen: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function choose(id: string | null) {
  chosen = id;
  clearTimeout(timer);
  if (id) timer = setTimeout(() => choose(null), BACK_TO_DEFAULT_MS);
  emit();
}
/** Any tap in the tab keeps a picked speaker a little longer. */
const keep = () => {
  if (chosen) choose(chosen);
};
function useSpeaker(m: MusicData) {
  const id = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => chosen,
  );
  const sp = m.speakers.find((s) => s.entityId === id) ?? m.speakers[0]!;
  return { sp, choose: (x: string) => choose(x === m.speakers[0]!.entityId ? null : x) };
}

type Speaker = MusicData["speakers"][number];

const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/$/, "");
const sameStream = (a?: string, b?: string) => Boolean(a && b && norm(a) === norm(b));

function useControls(sp: Speaker, actions: Actions) {
  const now = (d: Dashboard) => d.music?.speakers.find((s) => s.entityId === sp.entityId);
  const started = (name: string, isIt: (s: Speaker | undefined) => boolean) => ({
    done: `${name} spelar i ${sp.name}`,
    check: (d: Dashboard) => isIt(now(d)),
    slow: `${name} är skickad till ${sp.name} – vissa högtalare tar en stund att starta.`,
  });
  return {
    playFav: (index: number, name: string) => {
      keep();
      return actions.run(name, () => api.playStation(index, sp.entityId), started(name, (s) => s?.station === index));
    },
    playDir: (st: DirStation) => {
      keep();
      return actions.run(st.name, () => api.playStationId(st.id, sp.entityId), started(st.name, (s) => sameStream(s?.playingUrl, st.url)));
    },
    stop: () => actions.run(`Stopp i ${sp.name}`, () => api.stopMusic(sp.entityId), { done: `Tyst i ${sp.name}`, check: (d) => !now(d)?.playing }),
    volume: (pct: number) => {
      keep();
      return actions.run(`Volym i ${sp.name}`, () => api.volume(sp.entityId, Math.max(0, Math.min(100, pct))));
    },
  };
}

/** "P4 Jönköping · Kök" with volume and Stopp. */
function NowPlaying({ sp, actions, showName }: { sp: Speaker; actions: Actions; showName: boolean }) {
  const c = useControls(sp, actions);
  const vol = sp.volume ?? null;
  return (
    <div className="music-now">
      <Icon name="speaker" size={20} />
      <span className="music-title">
        {sp.offline ? `${sp.name} svarar inte` : sp.playing ? `${sp.title ?? "Spelar"}${showName ? ` · ${sp.name}` : ""}` : `${sp.name} · tyst`}
      </span>
      <span className="music-ctl">
        {!sp.offline && vol !== null && (
          <span className="music-vol">
            <button className="btn small ghost" aria-label="Sänk volymen" disabled={vol <= 0} onClick={() => void c.volume(vol - 10)}>
              −
            </button>
            <b>{vol}</b>
            <button className="btn small ghost" aria-label="Höj volymen" disabled={vol >= 100} onClick={() => void c.volume(vol + 10)}>
              +
            </button>
          </span>
        )}
        {sp.playing && (
          <button className="btn small" onClick={() => void c.stop()}>
            <Icon name="stop" size={16} /> Stopp
          </button>
        )}
      </span>
    </div>
  );
}

function StationButton({ name, logo, on, disabled, onPlay }: { name: string; logo?: string; on: boolean; disabled: boolean; onPlay: () => void }) {
  return (
    <button className={`light-btn station-btn ${on ? "on" : ""}`} aria-pressed={on} disabled={disabled} onClick={onPlay}>
      {logo ? <img src={logo} alt="" width={24} height={24} loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} /> : <Icon name="music" size={20} />}
      <span className="station-name">{name}</span>
    </button>
  );
}

// ---------- Home card: just the favourites ----------

/** Musik on the home screen: the favourites, one tap plays them on the default speaker. */
export function Music({ data, actions }: { data: Dashboard; actions: Actions }) {
  const m = data.music;
  if (!m?.speakers.length) return null;
  return <MusicCard m={m} actions={actions} />;
}

function MusicCard({ m, actions }: { m: MusicData; actions: Actions }) {
  const { sp } = useSpeaker(m);
  const c = useControls(sp, actions);
  return (
    <section className="card music-card" style={{ flexGrow: 1 }}>
      <div className="card-head">
        <h2>Musik</h2>
      </div>
      <NowPlaying sp={sp} actions={actions} showName={false} />
      {m.stations.length > 0 ? (
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {m.stations.map((s) => (
            <StationButton key={s.index} name={s.name} logo={s.logo} on={sp.playing && sp.station === s.index} disabled={sp.offline} onPlay={() => void c.playFav(s.index, s.name)} />
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Tryck här och välj kanaler med ☆.
        </p>
      )}
    </section>
  );
}

// ---------- The Musik tab: speakers, favourites and every Swedish station ----------

export function MusicPage({ data, actions }: { data: Dashboard; actions: Actions }) {
  const m = data.music;
  if (!m?.speakers.length) return <p className="muted">Välj högtalare under Inställningar → Huset → Musik.</p>;
  return <MusicTab m={m} actions={actions} />;
}

function MusicTab({ m, actions }: { m: MusicData; actions: Actions }) {
  const { sp, choose: pick } = useSpeaker(m);
  const c = useControls(sp, actions);
  const [all, setAll] = useState<DirStation[] | null>(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<"sr" | "other">("sr");
  const [q, setQ] = useState("");
  useEffect(() => {
    api
      .musicStations()
      .then((r) => setAll(r.stations))
      .catch((e: Error) => setError(e.message));
  }, []);
  const favUrls = useMemo(() => m.stations.map((s) => s.url ?? ""), [m.stations]);
  const isFav = (url: string) => favUrls.some((u) => sameStream(u, url));
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (all ?? []).filter((s) => (words ? s.name.toLowerCase().includes(words) : s.group === group));
  }, [all, group, q]);
  const star = (s: DirStation) => {
    keep();
    const on = !isFav(s.url);
    return actions.run(on ? `${s.name} på startsidan` : `${s.name} borttagen`, () => api.favoriteStation(on ? { id: s.id, on } : { url: m.stations.find((x) => sameStream(x.url, s.url))?.url ?? s.url, on }), {
      done: on ? `${s.name} ligger nu på startsidan` : `${s.name} är borttagen från startsidan`,
      check: (d) => (d.music?.stations ?? []).some((x) => sameStream(x.url, s.url)) === on,
    });
  };

  return (
    <div className="music-tab">
      <section className="card">
        {m.speakers.length > 1 && (
          <div className="seg music-speakers" role="radiogroup" aria-label="Högtalare">
            {m.speakers.map((s) => (
              <button key={s.entityId} className={`seg-btn ${s.entityId === sp.entityId ? "on" : ""}`} role="radio" aria-checked={s.entityId === sp.entityId} onClick={() => pick(s.entityId)}>
                <Icon name="speaker" size={18} /> {s.name}
              </button>
            ))}
          </div>
        )}
        <NowPlaying sp={sp} actions={actions} showName={m.speakers.length < 2} />
        {m.stations.length > 0 && (
          <div className="music-favs">
            {m.stations.map((s) => (
              <StationButton key={s.index} name={s.name} logo={s.logo} on={sp.playing && sp.station === s.index} disabled={sp.offline} onPlay={() => void c.playFav(s.index, s.name)} />
            ))}
          </div>
        )}
      </section>

      <section className="card music-all">
        <div className="card-head">
          <h2>Alla kanaler</h2>
          <div className="seg small" role="radiogroup" aria-label="Kanaler">
            <button className={`seg-btn ${!q && group === "sr" ? "on" : ""}`} role="radio" aria-checked={!q && group === "sr"} onClick={() => (setQ(""), setGroup("sr"))}>
              Sveriges Radio
            </button>
            <button className={`seg-btn ${!q && group === "other" ? "on" : ""}`} role="radio" aria-checked={!q && group === "other"} onClick={() => (setQ(""), setGroup("other"))}>
              Övriga
            </button>
          </div>
        </div>
        <input className="music-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök, t.ex. Östergötland eller Megapol" aria-label="Sök kanal" maxLength={40} enterKeyHint="search" />
        {error && <p className="error-text">{error}</p>}
        {!all && !error && <p className="muted">Hämtar kanaler …</p>}
        {all && shown.length === 0 && <p className="muted">Ingen kanal heter så.</p>}
        <div className="station-list">
          {shown.map((s) => {
            const fav = isFav(s.url);
            return (
              <div key={s.id} className="station-row">
                <StationButton name={s.name} logo={s.logo} on={sp.playing && sameStream(sp.playingUrl, s.url)} disabled={sp.offline} onPlay={() => void c.playDir(s)} />
                <button className={`btn small ghost star ${fav ? "on" : ""}`} aria-pressed={fav} aria-label={fav ? `Ta bort ${s.name} från startsidan` : `Lägg ${s.name} på startsidan`} onClick={() => void star(s)}>
                  {fav ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="muted music-hint">☆ lägger kanalen på startsidan.</p>
      </section>

      <SpotifyBox sp={m.spotify} actions={actions} />
    </div>
  );
}

/** Spotify: controls when Home Assistant has the Spotify integration, otherwise how to add it. */
function SpotifyBox({ sp, actions }: { sp: MusicData["spotify"]; actions: Actions }) {
  if (!sp)
    return (
      <section className="card spotify-box">
        <h2>Spotify</h2>
        <p style={{ margin: "0 0 8px" }}>
          För att se och styra Spotify härifrån behöver Home Assistant integrationen <b>Spotify</b> (den finns inbyggd, inget extra att ladda ner):
        </p>
        <ol className="guide">
          <li>
            Öppna Home Assistant → <b>Inställningar</b> → <b>Enheter och tjänster</b>.
          </li>
          <li>
            Tryck <b>Lägg till integration</b> och sök <b>Spotify</b>.
          </li>
          <li>Följ stegen och logga in med ert Spotify-konto (Premium behövs). Home Assistant visar hur du skapar nyckeln hos Spotify.</li>
        </ol>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Sedan syns det som spelas här, med Spela/Paus och Nästa. Starta låten från Spotify-appen och välj högtalaren där – Google-högtalare dyker upp i Spotify när de är påslagna på samma wifi.
        </p>
      </section>
    );
  const label = sp.offline ? "Spotify svarar inte" : sp.title ? `${sp.title}${sp.device ? ` · ${sp.device}` : ""}` : "Inget spelas i Spotify";
  return (
    <section className="card spotify-box">
      <div className="music-now" style={{ marginBottom: 0 }}>
        <Icon name="music" size={20} />
        <span className="music-title">
          <b>Spotify</b> · {label}
        </span>
        <span className="music-ctl">
          <button className="btn small" disabled={sp.offline} onClick={() => void actions.run("Spotify", () => api.spotify("playpause"))}>
            <Icon name={sp.playing ? "stop" : "play"} size={16} /> {sp.playing ? "Paus" : "Spela"}
          </button>
          <button className="btn small" disabled={sp.offline || !sp.title} onClick={() => void actions.run("Spotify", () => api.spotify("next"))}>
            Nästa
          </button>
        </span>
      </div>
    </section>
  );
}

const widget: WidgetModule = {
  id: "music",
  label: "Musik",
  size: (data) => (data.music?.speakers.length ? 1 + Math.ceil(Math.max(1, data.music.stations.length) / 2) : 0),
  render: ({ data, actions }) => <Music data={data} actions={actions} />,
  opens: { tab: "music" },
};
export default widget;
