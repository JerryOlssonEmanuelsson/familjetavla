import { useEffect, useState } from "react";
import type { ConfigResponse } from "../../server/src/types";
import { ApiError, api, setPin } from "./api";
import { Dashboard } from "./dashboard/Dashboard";
import { Wizard } from "./setup/Wizard";

// Hash routing keeps every route under the same index.html (works behind HA ingress).
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function navigate(path: string) {
  window.location.hash = path;
}

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

export function App() {
  const hash = useHash();
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    api
      .config()
      .then(setCfg)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

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
  return <Dashboard />;
}
