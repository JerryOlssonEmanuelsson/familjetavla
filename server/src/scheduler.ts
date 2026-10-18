import type { FastifyBaseLogger } from "fastify";
import { ha, haConnection } from "./connectors/ha.js";
import { loadConfig } from "./store.js";
import { hhmm, isoWeekday } from "./time.js";
import type { Schedule } from "./types.js";

/** Turn an entity on/off or press it, whatever its domain. */
export async function runEntityAction(entityId: string, action: Schedule["action"]) {
  const conn = haConnection();
  if (!conn) throw new Error("Home Assistant är inte anslutet.");
  const domain = entityId.split(".")[0];
  if (domain === "button" || domain === "input_button") return ha.service(conn, domain, "press", { entity_id: entityId });
  if (domain === "scene" || domain === "script") return ha.service(conn, domain, "turn_on", { entity_id: entityId });
  if (domain === "lock") return ha.service(conn, "lock", action === "off" ? "unlock" : "lock", { entity_id: entityId });
  if (domain === "cover") return ha.service(conn, "cover", action === "off" ? "close_cover" : "open_cover", { entity_id: entityId });
  return ha.service(conn, "homeassistant", action === "off" ? "turn_off" : "turn_on", { entity_id: entityId });
}

/** Schedules due at this minute (pure, for tests). */
export function dueSchedules(schedules: Schedule[], now: Date): Schedule[] {
  const t = hhmm(now);
  const day = isoWeekday(now);
  return schedules.filter((s) => s.enabled && s.time === t && s.days.includes(day));
}

/** Checks every 20 s and fires each schedule at most once per minute. Runs as long as the server does. */
export function startScheduler(log: FastifyBaseLogger) {
  const fired = new Set<string>();
  const tick = async () => {
    const now = new Date();
    const minuteKey = `${now.toDateString()} ${hhmm(now)}`;
    for (const s of dueSchedules(loadConfig().schedules ?? [], now)) {
      const key = `${s.id}@${minuteKey}`;
      if (fired.has(key)) continue;
      fired.add(key);
      try {
        await runEntityAction(s.entityId, s.action);
        log.info(`Schema "${s.name}" körde ${s.action} på ${s.entityId}`);
      } catch (e) {
        log.error(`Schema "${s.name}" misslyckades: ${(e as Error).message}`);
      }
    }
    // Forget earlier minutes only – clearing everything could fire a schedule twice in the same minute.
    for (const k of fired) if (!k.endsWith(`@${minuteKey}`)) fired.delete(k);
  };
  return setInterval(() => void tick(), 20_000);
}
