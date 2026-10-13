import { createServer } from "node:http";
import { Server } from "socket.io";
import { Redis } from "ioredis";
import { getEnv } from "../../../packages/config/src";
import { verifyToken } from "../../../packages/core/src/tokens";
import { conversationFor } from "../../../packages/core/src/service";
import { rateLimit } from "../../../packages/core/src/rate-limit";
const env = getEnv();
const http = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "realtime", status: "alive" }));
});
const io = new Server(http, {
  cors: { origin: env.APP_URL, credentials: true },
});
const subscriber = new Redis(env.REDIS_URL);
io.use(async (socket, next) => {
  try {
    socket.data.actor = await verifyToken(String(socket.handshake.auth.token));
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});
io.on("connection", (socket) => {
  const token = String(socket.handshake.auth.token);
  const actor = socket.data.actor;
  if (actor.kind === "staff")
    void socket.join(`org:${actor.organizationId}:agents`);
  const expiration = setTimeout(() => socket.disconnect(true), 15 * 60 * 1000);
  socket.on("disconnect", () => clearTimeout(expiration));
  socket.on(
    "conversation:join",
    async (id: unknown, ack?: (v: { ok: boolean }) => void) => {
      try {
        if (typeof id !== "string") throw Error();
        const current = await verifyToken(token);
        await conversationFor(current, id);
        await socket.join(`conversation:${id}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    },
  );
  for (const event of ["typing:start", "typing:stop"])
    socket.on(event, async (id: unknown) => {
      try {
        if (typeof id !== "string") return;
        const current = await verifyToken(token);
        await conversationFor(current, id);
        await rateLimit(`typing:${socket.id}`, 60, 60);
        socket
          .to(`conversation:${id}`)
          .to(`org:${current.organizationId}:agents`)
          .emit("typing:changed", {
            conversationId: id,
            active: event === "typing:start",
          });
      } catch {
        /* Unauthorized ephemeral events are dropped. */
      }
    });
});
await subscriber.subscribe("supportflow:events");
subscriber.on("message", (_channel, raw: string) => {
  const event = JSON.parse(raw) as {
    organizationId: string;
    aggregateId: string;
    id: string;
  };
  io.to(`org:${event.organizationId}:agents`)
    .to(`conversation:${event.aggregateId}`)
    .emit("change", { eventId: event.id, conversationId: event.aggregateId });
});
http.listen(3001, "0.0.0.0", () =>
  console.log(
    JSON.stringify({ service: "realtime", port: 3001, status: "listening" }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void io.close();
    void subscriber.quit();
    http.close();
  });
