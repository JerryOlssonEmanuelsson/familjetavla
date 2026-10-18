import { useEffect, useRef, useState } from "react";
import type { Config, ConfigResponse } from "../../../server/src/types";
import { api, type PostcodeInfo } from "../api";
import { Icon } from "../Icon";
import { clearEntityCache, type SecretDraft } from "./parts";
import {
  CalendarsStep,
  DiscoverStep,
  DisplayStep,
  ElectricityStep,
  FamilyStep,
  HaStep,
  HomeStep,
  HouseStep,
  SchoolStep,
  ShoppingStep,
  WasteStep,
} from "./steps";

export interface StepProps {
  cfg: Config;
  set: (c: Config) => void;
  secrets: SecretDraft;
  setSecrets: (s: SecretDraft) => void;
  resp: ConfigResponse;
  haOk: boolean;
  setHaOk: (v: boolean) => void;
  postcode: PostcodeInfo | null;
  setPostcode: (p: PostcodeInfo | null) => void;
  /** Save now (used before tests that read stored config, e.g. after connecting HA). */
  saveNow: () => Promise<void>;
}

const STEPS: { id: string; label: string; title: string; lead: string; C: (p: StepProps) => React.ReactNode; needsHa?: boolean; optional?: boolean }[] = [
  { id: "hem", label: "Hem", title: "Välkommen till Familjetavlan", lead: "Vi börjar med var ni bor – det ger väder, elområde och sophämtning.", C: HomeStep },
  { id: "familj", label: "Familjen", title: "Vilka bor här?", lead: "Lägg till vuxna och barn. Bor ett barn växelvis i två hem väljer du det på barnet – annars behöver du inte tänka på det.", C: FamilyStep },
  { id: "ha", label: "Home Assistant", title: "Home Assistant", lead: "Med Home Assistant kan tavlan visa bilar, ljus, värme och energi. Hoppa över om du inte har det.", C: HaStep },
  { id: "hamta", label: "Hämta", title: "Hämta från Home Assistant", lead: "Vi letar upp det du redan har integrerat – bilar, växelriktare, värmepump, spabad, lampor och mer. Bocka ur det du inte vill ha.", C: DiscoverStep, needsHa: true, optional: true },
  { id: "kalendrar", label: "Kalendrar", title: "Kalendrar", lead: "Lägg till familjens kalendrar och barnens aktiviteter – en kalender per lag eller aktivitet.", C: CalendarsStep },
  { id: "skola", label: "Skola", title: "Skola och förskola", lead: "Skola och förskola: schema, idrott, omsorgstid och matsedel. Tavlan påminner om gympapåsen.", C: SchoolStep, optional: true },
  { id: "sopor", label: "Sopor", title: "Sophämtning", lead: "Få en påminnelse kvällen innan kärlen töms.", C: WasteStep, optional: true },
  { id: "inkop", label: "Inköp", title: "Mat & inköp", lead: "Inköpslistan på tavlan – och skicka den till butikens varukorg.", C: ShoppingStep, optional: true },
  { id: "el", label: "El", title: "Elpris", lead: "Se timpriset och de billigaste timmarna. Lägg till ditt elbolags påslag för verkligt pris.", C: ElectricityStep, optional: true },
  { id: "huset", label: "Huset", title: "Huset", lead: "Finjustera bilar, energi, ljus, värme och grafer.", C: HouseStep, needsHa: true, optional: true },
  { id: "visning", label: "Startskärm", title: "Startskärm och utseende", lead: "Välj vad som ska synas och i vilken ordning.", C: DisplayStep },
];

export function Wizard({ initial, startStep, onDone }: { initial: ConfigResponse; startStep?: string; onDone: (r: ConfigResponse) => void }) {
  const [resp, setResp] = useState(initial);
  const [cfg, setCfg] = useState<Config>(initial.config);
  const [secrets, setSecrets] = useState<SecretDraft>({});
  const [haOk, setHaOk] = useState(initial.config.ha.mode !== "none");
  const [postcode, setPostcode] = useState<PostcodeInfo | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = STEPS.filter((s) => !s.needsHa || haOk);
  const startIdx = Math.max(0, visible.findIndex((s) => s.id === startStep));
  const [idx, setIdx] = useState(initial.config.setupComplete && !startStep ? visible.length - 1 : startIdx);
  const step = visible[Math.min(idx, visible.length - 1)];

  const save = async (next: Config = cfg) => {
    setSaving(true);
    setError("");
    try {
      const r = await api.saveConfig(next, secrets);
      setResp(r);
      setCfg(r.config);
      setSecrets({});
      clearEntityCache();
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const go = async (to: number) => {
    try {
      await save();
      setIdx(to);
      window.scrollTo({ top: 0 });
    } catch {
      /* error shown */
    }
  };

  const finish = async () => {
    try {
      const r = await save({ ...cfg, setupComplete: true });
      onDone(r);
    } catch {
      /* error shown */
    }
  };

  const props: StepProps = {
    cfg,
    set: setCfg,
    secrets,
    setSecrets,
    resp,
    haOk,
    setHaOk,
    postcode,
    setPostcode,
    saveNow: async () => {
      await save();
    },
  };
  const last = idx >= visible.length - 1;
  const at = Math.min(idx, visible.length - 1);

  // Keep the current step's pill in view – with eleven steps the row scrolls sideways.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [at]);

  return (
    <div className="app-bg">
      <div className="sky" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="wizard">
        <div className="row gap">
          <nav className="steps grow" aria-label="Steg" ref={navRef}>
            {visible.map((s, i) => (
              <button key={s.id} aria-current={i === idx ? "step" : undefined} className={i < idx ? "done" : ""} onClick={() => go(i)}>
                {i < idx && <Icon name="check" size={16} />}
                {s.label}
              </button>
            ))}
          </nav>
          {cfg.setupComplete && (
            <a className="btn small" href="#/">
              Till tavlan
            </a>
          )}
        </div>
        <div className="wizard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={visible.length} aria-valuenow={at + 1} aria-label="Hur långt du kommit">
          <span>
            Steg {at + 1} av {visible.length}
            {step.optional && <em> · valfritt, hoppa över om du vill</em>}
          </span>
          <i style={{ width: `${((at + 1) / visible.length) * 100}%` }} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h1>{step.title}</h1>
          <p className="lead">{step.lead}</p>
        </div>
        <step.C {...props} />
        {error && (
          <div className="result bad" role="alert">
            {error}
          </div>
        )}
        <div className="wizard-nav">
          <button className="btn" disabled={idx === 0 || saving} onClick={() => go(idx - 1)}>
            <Icon name="chevronLeft" size={20} /> Tillbaka
          </button>
          {last ? (
            <button className="btn primary" disabled={saving} onClick={finish}>
              {saving ? "Sparar…" : "Spara och visa tavlan"}
            </button>
          ) : (
            <button className="btn primary" disabled={saving} onClick={() => go(idx + 1)}>
              {saving ? "Sparar…" : step.optional && !stepHasData(cfg, step.id) ? "Hoppa över" : "Nästa"} <Icon name="chevronRight" size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Has the user set anything up in this optional step? Decides "Nästa" vs "Hoppa över". */
function stepHasData(cfg: Config, id: string): boolean {
  const e = cfg.entities;
  const has = (cat: string) => cfg.integrations.some((i) => i.category === cat);
  switch (id) {
    case "hamta":
    case "huset":
      return e.cars.length + e.lights.length + e.climates.length + e.deviceCards.length + e.lightGroups.length + e.temps.length > 0 || Object.values(e.energy).some(Boolean);
    case "skola":
      return has("school");
    case "sopor":
      return has("waste");
    case "inkop":
      return has("grocery") || cfg.shopping.source === "ha";
    case "el":
      return has("price");
    default:
      return true;
  }
}
