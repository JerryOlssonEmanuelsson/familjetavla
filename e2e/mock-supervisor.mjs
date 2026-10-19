// Stand-in for the Home Assistant Supervisor in end-to-end tests. No dependencies.
//
// Plays three parts, like the real Supervisor at 172.30.32.2 does for an add-on:
//   /core/api/*         Home Assistant REST API (Bearer token)
//   /core/websocket     Home Assistant WebSocket API
//   /api/hassio_ingress/<token>/*   ingress proxy to the add-on, prefix stripped
// The same REST API is also served at /api/* for the "address + token" (Docker) setup.
import { createHash } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT ?? 80);
const TOKEN = process.env.HA_TOKEN ?? "test-token";
const ADDON = process.env.ADDON_URL ?? "http://familjetavla:8099";
const INGRESS = "/api/hassio_ingress/e2e-token";

const day = (offset, h, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const states = [
  { entity_id: "calendar.familj", state: "off", attributes: { friendly_name: "Familjen" } },
  { entity_id: "todo.shopping_list", state: "2", attributes: { friendly_name: "Inköpslista" } },
  { entity_id: "light.kok", state: "on", attributes: { friendly_name: "Kök" } },
  { entity_id: "sensor.ute", state: "9.5", attributes: { friendly_name: "Ute", unit_of_measurement: "°C", device_class: "temperature" } },
  { entity_id: "person.anna", state: "home", attributes: { friendly_name: "Anna" } },
].map((s) => ({ ...s, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), context: { id: "x" } }));

const calendar = [
  { summary: "Middag hos mormor", start: { dateTime: day(0, 18) }, end: { dateTime: day(0, 20) }, uid: "e2e-1" },
  { summary: "Föräldramöte", start: { dateTime: day(1, 18, 30) }, end: { dateTime: day(1, 19, 30) }, uid: "e2e-2" },
  { summary: "Studiedag", start: { date: day(3, 0).slice(0, 10) }, end: { date: day(4, 0).slice(0, 10) }, uid: "e2e-3" },
];
const todo = [
  { uid: "t1", summary: "Mjölk", status: "needs_action" },
  { uid: "t2", summary: "Bröd", status: "needs_action" },
];

export const calls = [];

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

async function haApi(req, res, path) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { message: "Unauthorized" });
  calls.push(`${req.method} ${path.split("?")[0]}`);
  const [p, q = ""] = path.split("?");
  if (p === "/" || p === "") return json(res, 200, { message: "API running." });
  if (p === "/config") return json(res, 200, { location_name: "Hemma", time_zone: "Europe/Stockholm", version: "2026.10.0" });
  if (p === "/states") return json(res, 200, states);
  if (p.startsWith("/states/")) {
    const s = states.find((x) => x.entity_id === decodeURIComponent(p.slice(8)));
    return s ? json(res, 200, s) : json(res, 404, { message: "Entity not found." });
  }
  if (p === "/services") return json(res, 200, [{ domain: "notify", services: { mobile_app_annas_telefon: {} } }, { domain: "light", services: { toggle: {} } }, { domain: "todo", services: { get_items: {} } }]);
  if (p.startsWith("/calendars/")) return json(res, 200, calendar);
  if (p === "/template") {
    await readBody(req);
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("[]");
  }
  if (p.startsWith("/history/period/")) return json(res, 200, []);
  if (p.startsWith("/services/")) {
    await readBody(req);
    if (p === "/services/todo/get_items" && q.includes("return_response")) {
      return json(res, 200, { changed_states: [], service_response: { "todo.shopping_list": { items: todo } } });
    }
    return json(res, 200, []);
  }
  return json(res, 404, { message: `Not found: ${p}` });
}

function ingress(req, res) {
  const path = req.url.slice(INGRESS.length) || "/";
  const target = new URL(path, ADDON);
  const headers = { ...req.headers, host: target.host, "x-ingress-path": INGRESS };
  const up = http.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => json(res, 502, { message: `Ingress: ${e.message}` }));
  req.pipe(up);
}

// ---- minimal WebSocket server (text frames only, enough for HA's protocol) ----
function wsSend(socket, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  const head = data.length < 126 ? Buffer.from([0x81, data.length]) : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255]) : null;
  if (!head) {
    const h = Buffer.alloc(10);
    h[0] = 0x81;
    h[1] = 127;
    h.writeBigUInt64BE(BigInt(data.length), 2);
    socket.write(Buffer.concat([h, data]));
  } else socket.write(Buffer.concat([head, data]));
}

function wsFrames(buf) {
  const out = [];
  let i = 0;
  while (i + 2 <= buf.length) {
    const op = buf[i] & 0x0f;
    let len = buf[i + 1] & 0x7f;
    let p = i + 2;
    if (len === 126) {
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      len = Number(buf.readBigUInt64BE(p));
      p += 8;
    }
    const mask = buf.subarray(p, p + 4);
    p += 4;
    if (p + len > buf.length) break;
    const payload = Buffer.from(buf.subarray(p, p + len)).map((b, k) => b ^ mask[k % 4]);
    out.push({ op, text: payload.toString() });
    i = p + len;
  }
  return { frames: out, rest: buf.subarray(i) };
}

function websocket(req, socket) {
  const accept = createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  wsSend(socket, { type: "auth_required", ha_version: "2026.10.0" });
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    const parsed = wsFrames(Buffer.concat([buf, chunk]));
    buf = parsed.rest;
    for (const f of parsed.frames) {
      if (f.op === 8) return socket.end();
      if (f.op !== 1) continue;
      const msg = JSON.parse(f.text);
      if (msg.type === "auth") {
        if (msg.access_token === TOKEN) wsSend(socket, { type: "auth_ok", ha_version: "2026.10.0" });
        else wsSend(socket, { type: "auth_invalid", message: "Invalid access token" });
      } else if (msg.type === "get_states") {
        calls.push("WS get_states");
        wsSend(socket, { id: msg.id, type: "result", success: true, result: states });
      } else if (msg.id !== undefined) {
        calls.push(`WS ${msg.type}`);
        wsSend(socket, { id: msg.id, type: "result", success: true, result: null });
      }
    }
  });
  socket.on("error", () => {});
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url === "/__calls") return json(res, 200, calls);
  if (url === INGRESS) {
    res.writeHead(302, { location: `${INGRESS}/` });
    return res.end();
  }
  if (url.startsWith(`${INGRESS}/`)) return ingress(req, res);
  if (url.startsWith("/core/api")) return haApi(req, res, url.slice("/core/api".length));
  if (url.startsWith("/api")) return haApi(req, res, url.slice("/api".length));
  json(res, 404, { message: "Not found" });
});
server.on("upgrade", (req, socket) => {
  if (req.url === "/core/websocket" || req.url === "/api/websocket") websocket(req, socket);
  else socket.destroy();
});
server.listen(PORT, () => console.log(`mock supervisor on :${PORT}, add-on at ${ADDON}`));
