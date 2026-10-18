import { useEffect, useRef, useState } from "react";
import type { ActivityIcon, DashEvent } from "../../../server/src/types";
import { Icon, type IconName } from "../Icon";

const ICONS: Record<ActivityIcon, IconName> = {
  ball: "ball",
  swim: "swim",
  gym: "gym",
  music: "music",
  school: "school",
  trash: "trash",
  food: "food",
  cake: "cake",
  health: "health",
  car: "car",
  kids: "kids",
  work: "work",
  travel: "travel",
  event: "event",
};

/** Activity icon on a tile tinted with the person's colour. */
export function EventIcon({ icon, color, size = 18 }: { icon: ActivityIcon; color: string; size?: number }) {
  return (
    <span className="evt-ico" style={{ background: `color-mix(in srgb, ${color} 26%, transparent)`, color }} aria-hidden="true">
      <Icon name={ICONS[icon] ?? "event"} size={size} />
    </span>
  );
}

export function Avatar({ initial, color, name, away, size }: { initial: string; color: string; name: string; away?: boolean; size?: "lg" }) {
  return (
    <span className={`avatar ${size ?? ""} ${away ? "away" : ""}`} style={{ background: color }} title={away ? `${name} – i andra hemmet` : name} aria-label={away ? `${name}, borta` : name}>
      {initial}
    </span>
  );
}

/** A number that rolls smoothly to its new value (prices, battery, temperatures). */
export function AnimatedNumber({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || a === value) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      {shown.toFixed(decimals).replace(".", ",")}
      {suffix}
    </>
  );
}

/** Tap opens details; a long press does the same on touch screens without triggering scroll. */
export function eventLabel(e: DashEvent) {
  return [e.time, e.title, e.who].filter(Boolean).join(" · ");
}
