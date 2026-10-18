import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * "#ipad": shows the board exactly as on a 12.9" iPad Pro in landscape (1366×1024),
 * scaled down to fit any screen – handy for previewing on a phone or laptop.
 * The board runs in an iframe so its layout sees a real 1366 px wide window.
 */
export const IPAD = { w: 1366, h: 1024 };
export const INNER_NAME = "familjetavla-ipad";

// The page as it was before React rendered: the iframe boots its own copy of the app.
const pageHtml = typeof document !== "undefined" ? document.documentElement.outerHTML : "";

export function wantsIpadFrame() {
  return typeof window !== "undefined" && window.name !== INNER_NAME && location.hash === "#ipad";
}

function fit() {
  const pad = 12;
  const s = Math.min((window.innerWidth - pad * 2) / IPAD.w, (window.innerHeight - pad * 2 - 44) / IPAD.h);
  return { scale: Math.max(0.15, s), portrait: window.innerHeight > window.innerWidth };
}

export function IpadFrame() {
  const [{ scale, portrait }, setFit] = useState(fit);
  useEffect(() => {
    const on = () => setFit(fit());
    window.addEventListener("resize", on);
    screen.orientation?.addEventListener?.("change", on);
    return () => {
      window.removeEventListener("resize", on);
      screen.orientation?.removeEventListener?.("change", on);
    };
  }, []);

  const full = async () => {
    try {
      await document.documentElement.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {
      /* not allowed here – the board still works */
    }
  };
  const leave = () => {
    history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  };

  return (
    <div className="ipad-stage">
      <div className="ipad-bar">
        <span>iPad Pro 12,9″ · liggande · {Math.round(scale * 100)} %</span>
        {portrait && <span className="ipad-hint">Vrid telefonen till liggande läge</span>}
        <button className="btn small ghost" onClick={full}>
          Helskärm
        </button>
        <button className="btn small ghost" onClick={leave} aria-label="Stäng iPad-vyn">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="ipad-device" style={{ width: IPAD.w * scale + 20 * scale, height: IPAD.h * scale + 20 * scale, padding: 10 * scale, borderRadius: 40 * scale }}>
        <iframe
          name={INNER_NAME}
          title="Familjetavla som på iPad"
          srcDoc={pageHtml}
          style={{ width: IPAD.w, height: IPAD.h, transform: `scale(${scale})`, borderRadius: 30 }}
        />
      </div>
    </div>
  );
}
