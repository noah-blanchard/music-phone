export interface ServerConfig {
  port: number;
  /** Exact allowed browser origin, or "*" to allow any. */
  webOrigin: string;
  /** True when `webOrigin` is "*" — convenient, and never right in production. */
  allowAnyOrigin: boolean;
  /**
   * Redis connection string. When absent, rooms are held in memory only and do
   * not survive a restart — fine for local development, not for production.
   */
  redisUrl?: string;
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

  const redisUrl = env.REDIS_URL?.trim() || undefined;
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl)) {
    throw new Error("REDIS_URL must start with redis:// or rediss://");
  }

  return { port, webOrigin, allowAnyOrigin: webOrigin === "*", redisUrl };
}
