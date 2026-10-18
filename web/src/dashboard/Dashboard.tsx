import { useCallback, useEffect, useRef, useState } from "react";
import type { Dashboard as Dash } from "../../../server/src/types";
import { api } from "../api";
import { Icon, type IconName } from "../Icon";
import { GroceryModal } from "./GroceryModal";
import { Home } from "./Home";
import { CarsPage, EnergyPage, GraphsPage, HousePage, LightsPage } from "./Pages";

type Tab = "home" | "cars" | "lights" | "house" | "energy" | "graphs";

const TABS: { id: Tab; label: string; icon: IconName; show: (d: Dash) => boolean }[] = [
  { id: "home", label: "Hem", icon: "calendar", show: () => true },
  { id: "cars", label: "Bil", icon: "car", show: (d) => d.cars.length > 0 },
  { id: "lights", label: "Ljus", icon: "bulb", show: (d) => d.lightGroups.length + d.buttons.length + d.lights.length > 0 },
  { id: "house", label: "Hus", icon: "home", show: (d) => d.climates.length + d.temps.length > 0 },
  { id: "energy", label: "Energi", icon: "bolt", show: (d) => Boolean(d.energy || d.prices) },
  { id: "graphs", label: "Grafer", icon: "gym", show: (d) => d.graphs.length > 0 || Boolean(d.prices) },
];

const THEME_KEY = "familjetavla.theme";

function readThemeOverride(): "dark" | "light" | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export interface Actions {
  refresh: () => Promise<void>;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  openGrocery: () => void;
}

export function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState("");
  const [grocery, setGrocery] = useState(false);
  const [awakeUntil, setAwakeUntil] = useState(0);
  const [themeOverride, setThemeOverride] = useState(readThemeOverride);
  const toastTimer = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 60_000);
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  };

  const actions: Actions = {
    refresh,
    openGrocery: () => setGrocery(true),
    run: async (label, fn) => {
      try {
        await fn();
        await refresh();
      } catch (e) {
        showToast(`${label}: ${(e as Error).message}`);
      }
    },
  };

  // Theme: explicit choice (button) wins, else config: auto follows "dygnsfärger".
  const theme = themeOverride ?? (data?.theme === "auto" || !data ? (data?.daypart === "day" ? "light" : "dark") : data.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--accent-custom", data?.accent ?? "");
  }, [theme, data?.accent]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeOverride(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (!data) {
    return (
      <div className="center-screen">
        {error ? (
          <div className="card">
            <h2>Kunde inte hämta tavlan</h2>
            <p className="muted">{error}</p>
            <button className="btn primary" onClick={refresh}>
              Försök igen
            </button>
          </div>
        ) : (
          <span className="muted">Laddar tavlan…</span>
        )}
      </div>
    );
  }

  const tabs = TABS.filter((t) => t.show(data));
  const clock = now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const sleeping = data.night && Date.now() > awakeUntil;

  return (
    <div className="app-bg">
      <div className="board">
        <header className="board-header">
          <div className="grow">
            <h1>
              <span className={`status-dot ${data.errors.length ? "warn" : ""}`} aria-hidden="true" />
              {data.header.dateLabel}
            </h1>
            <p className="sub">
              <span>Vecka {data.header.week}</span>
              {data.header.weather && <span>· {data.header.weather}</span>}
            </p>
          </div>
          <div className="clock" aria-label={`Klockan är ${clock}`}>
            {clock}
          </div>
          <div className="row gap">
            <button className="btn icon" aria-label={theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"} onClick={toggleTheme}>
              <Icon name={theme === "dark" ? "moon" : "sun"} size={24} />
            </button>
            <a className="btn icon" aria-label="Inställningar" href="#/setup">
              <Icon name="gear" size={24} />
            </a>
          </div>
        </header>

        {data.errors.length > 0 && (
          <details className="card" style={{ padding: "12px 18px" }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              {data.errors.length} källa{data.errors.length === 1 ? "" : "or"} svarar inte just nu
            </summary>
            <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {data.errors.map((e, i) => (
                <li key={i}>
                  <b>{e.source}:</b> {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        {tab === "home" && <Home data={data} actions={actions} />}
        {tab === "cars" && <CarsPage data={data} />}
        {tab === "lights" && <LightsPage data={data} actions={actions} />}
        {tab === "house" && <HousePage data={data} actions={actions} />}
        {tab === "energy" && <EnergyPage data={data} />}
        {tab === "graphs" && <GraphsPage data={data} />}
      </div>

      {tabs.length > 1 && (
        <nav className="tabbar" aria-label="Flikar">
          {tabs.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {grocery && (
        <GroceryModal
          onClose={() => setGrocery(false)}
          onDone={(msg) => {
            setGrocery(false);
            showToast(msg);
            refresh();
          }}
        />
      )}

      {sleeping && (
        <button className="night-veil" onClick={() => setAwakeUntil(Date.now() + 2 * 60_000)} aria-label="Väck skärmen">
          <span className="clock">{clock}</span>
          <span>Tryck för att visa tavlan</span>
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
