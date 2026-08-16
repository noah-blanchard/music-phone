import { buildApp, type App } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const { app, parts } = buildApp(config);

if (config.allowAnyOrigin) {
  console.warn(
    "WEB_ORIGIN is unset, so any origin may call this server. Set it to your web app's URL in production.",
  );
}

app.listen(config.port);

console.log(
  `MusicPhone server listening on http://localhost:${config.port} (origin: ${config.webOrigin})`,
);

/**
 * Render restarts the process on deploy and after idle spin-down. Cancelling
 * the timers lets the process exit promptly rather than being killed.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    parts.scheduler.cancelAll();
    void app.stop();
  });
}

export type { App };
export { app };
