import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so bundle them; leave npm packages external.
  skipNodeModulesBundle: true,
  noExternal: [/^@studio\//],
});
