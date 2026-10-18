import type { FastifyBaseLogger } from "fastify";
import type { HaConn, HaState } from "./ha.js";

/**
 * Persistent WebSocket to Home Assistant (/api/websocket).
 *  - keeps a live copy of all states (get_states + state_changed), so the board reads states
 *    from memory and taps on the tablet are reflected within a second
 *  - gives structured access to the device/entity/area registries
 * Uses Node's built-in WebSocket (Node 22+). Reconnects with backoff.
 */
type Listener = (entityId: string) => void;

export class HaSocket {
  states = new Map<string, HaState>();
  connected = false;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();
  private retry = 0;
  private timer: NodeJS.Timeout | null = null;
  private conn: HaConn | null = null;
  private stopped = false;

  constructor(private log: FastifyBaseLogger) {}

  static wsUrl(conn: HaConn): string {
    // http://supervisor/core/api → ws://supervisor/core/websocket ; https://x:8123/api → wss://x:8123/api/websocket
    const base = conn.base.replace(/^http/, "ws");
    return base.endsWith("/core/api") ? base.replace(/\/core\/api$/, "/core/websocket") : `${base}/websocket`;
  }

  start(conn: HaConn | null) {
    this.stop();
    this.stopped = false;
    this.conn = conn;
    if (conn) this.open();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    for (const p of this.pending.values()) p.reject(new Error("WebSocket stängd"));
    this.pending.clear();
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Send a command and wait for its result. */
  call<T>(msg: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    if (!this.ws || !this.connected) return Promise.reject(new Error("Inte ansluten till Home Assistant via WebSocket"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Home Assistant svarade inte"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
      this.ws!.send(JSON.stringify({ id, ...msg }));
    });
  }

  private open() {
    const conn = this.conn!;
    let ws: WebSocket;
    try {
      ws = new WebSocket(HaSocket.wsUrl(conn));
    } catch (e) {
      this.log.warn(`HA WebSocket: ${(e as Error).message}`);
      return this.schedule();
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.handle(conn, JSON.parse(String(ev.data)));
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      if (was) this.log.warn("HA WebSocket stängdes – försöker igen");
      if (!this.stopped) this.schedule();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private schedule() {
    if (this.stopped) return;
    const delay = Math.min(60_000, 1000 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.open(), delay);
  }

  private async handle(conn: HaConn, msg: { type: string; id?: number; success?: boolean; result?: unknown; error?: { message: string }; event?: { data: { entity_id: string; new_state: HaState | null } } }) {
    if (msg.type === "auth_required") {
      this.ws?.send(JSON.stringify({ type: "auth", access_token: conn.token }));
    } else if (msg.type === "auth_invalid") {
      this.log.error("HA WebSocket: ogiltig token");
      this.stopped = true;
      this.ws?.close();
    } else if (msg.type === "auth_ok") {
      this.connected = true;
      this.retry = 0;
      this.log.info("Ansluten till Home Assistant via WebSocket");
      try {
        const states = await this.call<HaState[]>({ type: "get_states" });
        this.states = new Map(states.map((s) => [s.entity_id, s]));
        await this.call({ type: "subscribe_events", event_type: "state_changed" });
        for (const fn of this.listeners) fn("*");
      } catch (e) {
        this.log.warn(`HA WebSocket: ${(e as Error).message}`);
      }
    } else if (msg.type === "result" && msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.success) p.resolve(msg.result);
      else p.reject(new Error(msg.error?.message ?? "Fel från Home Assistant"));
    } else if (msg.type === "event" && msg.event?.data) {
      const { entity_id, new_state } = msg.event.data;
      if (new_state) this.states.set(entity_id, new_state);
      else this.states.delete(entity_id);
      for (const fn of this.listeners) fn(entity_id);
    }
  }
}

let socket: HaSocket | null = null;

export function initHaSocket(log: FastifyBaseLogger) {
  socket = new HaSocket(log);
  return socket;
}

export function haSocket(): HaSocket | null {
  return socket;
}
