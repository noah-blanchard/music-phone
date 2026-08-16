import { buildApp, type App } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const { app, parts } = buildApp(config);

if (config.allowAnyOrigin) {
  console.warn(
    "WEB_ORIGIN is unset, so any origin may call this server. Set it to your web app's URL in production.",
  );
}
if (!config.redisUrl) {
  console.warn(
    "REDIS_URL is unset: rooms are held in memory and every game is lost on restart. Set it in production.",
  );
}

/**
 * Rooms may have outlived the previous process. Nobody's socket survived it, so
 * clear the stale presence flags first, then re-arm the round clocks — deadlines
 * are absolute, so an interrupted round ends when it was always going to.
 */
if (config.redisUrl) {
  try {
    await parts.service.clearStalePresence();
    const restored = await parts.service.restoreTimers();
    if (restored > 0) console.log(`Resumed ${restored} game(s) in progress`);
  } catch (error) {
    console.error("Could not restore rooms from Redis:", error);
  }
}

app.listen(config.port);

console.log(
  `MusicPhone server listening on http://localhost:${config.port} ` +
    `(origin: ${config.webOrigin}, storage: ${config.redisUrl ? "redis" : "memory"})`,
);

/**
 * Render restarts the process on deploy and after idle spin-down. Shut down
 * cleanly so the process exits promptly rather than being killed.
 */
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    parts.scheduler.cancelAll();
    void parts.redis?.quit();
    void app.stop();
  });
}

export type { App };
export { app };
