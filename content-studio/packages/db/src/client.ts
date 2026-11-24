import { PrismaClient } from "@prisma/client";

export interface DatabaseOptions {
  url: string;
  /** Log every SQL statement (noisy; for debugging only). */
  logQueries?: boolean;
}

/** Apps own the client's lifecycle: create one at boot, `$disconnect()` on shutdown. */
export function createPrismaClient({ url, logQueries = false }: DatabaseOptions): PrismaClient {
  return new PrismaClient({
    datasourceUrl: url,
    log: logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export type { PrismaClient };
