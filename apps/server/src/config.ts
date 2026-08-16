export interface ServerConfig {
  port: number;
  /** Exact allowed browser origin, or "*" to allow any. */
  webOrigin: string;
  /** True when `webOrigin` is "*" — convenient, and never right in production. */
  allowAnyOrigin: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const rawOrigin = env.WEB_ORIGIN?.trim() ?? "*";
  // Trailing slashes never match a browser's Origin header, which has none.
  const webOrigin = rawOrigin === "*" ? "*" : rawOrigin.replace(/\/+$/, "");

  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 3001;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid port number, got ${JSON.stringify(rawPort)}`);
  }

  return { port, webOrigin, allowAnyOrigin: webOrigin === "*" };
}
