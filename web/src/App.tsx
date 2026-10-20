import { useEffect, useState } from "react";
import type { ConfigResponse } from "../../server/src/types";
import { ApiError, api, setPin } from "./api";
import { Dashboard } from "./dashboard/Dashboard";
import { QuickAdd } from "./QuickAdd";
import { Wizard } from "./setup/Wizard";
import { navigate, useHash } from "./route";

export { navigate } from "./route";

function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="center-screen">
      <form
        className="card pin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setPin(pin);
          try {
            await api.checkPin();
            onOk();
          } catch {
            setError("Fel PIN-kod");
          }
        }}
      >
        <h1>Inställningar</h1>
        <label className="field">
          <span>PIN-kod</span>
          <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={() => navigate("/")}>
            Till tavlan
          </button>
          <button className="btn primary">Lås upp</button>
        </div>
      </form>
    </div>
  );
}

/** First visit from a new screen when a PIN is set: unlock it once, then it stays unlocked. */
function PairGate({ onOk }: { onOk: () => void }) {
  const [pin, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <form
        className="card pin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const ua = navigator.userAgent;
            const name = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Dator";
            await api.pair(pin, name);
            onOk();
          } catch {
            setError("Fel PIN-kod");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Lås upp skärmen</h1>
        <p className="muted">Ange familjetavlans PIN-kod en gång. Sedan kommer den här skärmen ihåg det – andra enheter på nätverket kommer inte åt tavlan.</p>
        <label className="field">
          <span>PIN-kod</span>
          <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" disabled={busy || !pin}>
          {busy ? "Låser upp…" : "Lås upp"}
        </button>
      </form>
    </div>
  );
}

export function App() {
  const hash = useHash();
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [needsPair, setNeedsPair] = useState(false);

  const load = () =>
    api
      .config()
      .then((c) => {
        setNeedsPair(false);
        setCfg(c);
      })
      .catch((e: ApiError) => (e.status === 401 ? setNeedsPair(true) : setLoadError(e.message)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (needsPair) return <PairGate onOk={() => void load()} />;

  if (loadError) {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>Kan inte nå servern</h1>
          <p className="muted">{loadError}</p>
          <button className="btn primary" onClick={() => location.reload()}>
            Försök igen
          </button>
        </div>
      </div>
    );
  }
  if (!cfg) return <div className="center-screen muted">Laddar…</div>;

  const wantsSetup = hash.startsWith("/setup") || !cfg.config.setupComplete;
  if (wantsSetup) {
    if (cfg.runtime.pinRequired && !unlocked) {
      return (
        <PinGate
          onOk={() => {
            setUnlocked(true);
            api.config().then(setCfg).catch((e: ApiError) => setLoadError(e.message));
          }}
        />
      );
    }
    return (
      <Wizard
        initial={cfg}
        startStep={hash.split("/")[2]}
        onDone={(next) => {
          setCfg(next);
          navigate("/");
        }}
      />
    );
  }
  if (hash.startsWith("/lagg-till")) return <QuickAdd people={cfg.config.people} />;
  return <Dashboard />;
}
