/**
 * Node-only helpers (import from "@studio/shared/node"). Kept out of the main
 * entry so the browser bundle never pulls in `node:fs`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let workspaceRoot: string | undefined;

/**
 * Walks up from the current directory to the package.json that declares
 * `workspaces`. npm runs each app from its own folder, so this is how a
 * relative path in the shared .env resolves the same way for every app.
 */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  if (workspaceRoot) return workspaceRoot;
  let dir = path.resolve(start);
  for (;;) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { workspaces?: unknown };
        if (Array.isArray(parsed.workspaces)) return (workspaceRoot = dir);
      } catch {
        // Unreadable manifest: keep walking up.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return (workspaceRoot = path.resolve(start));
    dir = parent;
  }
}

/** Absolute paths pass through; relative ones resolve from the workspace root. */
export function resolveWorkspacePath(target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(findWorkspaceRoot(), target);
}

export interface ShutdownLogger {
  info(message: string): void;
  error(details: object, message: string): void;
}

/**
 * Runs `close` once on SIGINT/SIGTERM, then exits. If closing takes longer
 * than `timeoutMs` the process exits anyway, so a stuck connection can never
 * block a deploy or a `tsx watch` restart.
 */
export function onShutdown(
  close: () => Promise<void>,
  options: { timeoutMs: number; logger: ShutdownLogger },
): void {
  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    options.logger.info(`Received ${signal}, shutting down`);
    const timer = setTimeout(() => {
      options.logger.error({ timeoutMs: options.timeoutMs }, "Shutdown timed out, forcing exit");
      process.exit(1);
    }, options.timeoutMs);
    timer.unref();
    close().then(
      () => process.exit(0),
      (error: unknown) => {
        options.logger.error({ err: error }, "Shutdown failed");
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
