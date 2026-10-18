import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { haConnection } from "./connectors/ha.js";
import { initHaSocket } from "./connectors/haws.js";
import { startNotifier } from "./notify.js";
import { startPublisher } from "./publisher.js";
import { registerRoutes } from "./routes.js";
import { startScheduler } from "./scheduler.js";

process.env.TZ ??= "Europe/Stockholm";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = process.env.WEB_DIST ?? join(here, "../../web/dist");
const port = Number(process.env.PORT ?? 8099);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 256 * 1024, trustProxy: false });

const socket = initHaSocket(app.log);
socket.start(haConnection());

await registerRoutes(app);

if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Hittades inte" });
    return reply.sendFile("index.html");
  });
} else {
  app.log.warn(`Webben är inte byggd (${webDist}). Kör "npm run build".`);
}

await app.listen({ host: "0.0.0.0", port });
startScheduler(app.log);
startPublisher(app.log);
startNotifier(app.log);
