import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The README's local setup puts `.env` at the repository root, while
 * `pnpm dev:api` runs the server from artifacts/api-server. The entry point
 * must read that root file. The checkout is mimicked in a temporary directory
 * so a developer's real `.env` is never read.
 */
const entry = fileURLToPath(new URL("./index.ts", import.meta.url));
// Resolved here, since the temporary working directory has no node_modules.
const tsx = import.meta.resolve("tsx");
let root: string | null = null;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

function startFrom(cwdInRepo: string, files: Record<string, string>) {
  root = mkdtempSync(path.join(tmpdir(), "vantage-env-"));
  const cwd = path.join(root, cwdInRepo);
  mkdirSync(cwd, { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(path.join(root, file), content);
  // No PORT from the parent: whether one is found shows which files were read.
  const env: NodeJS.ProcessEnv = { ...process.env, LOG_LEVEL: "silent" };
  delete env["PORT"];
  return spawnSync(process.execPath, ["--import", tsx, entry], { cwd, env, encoding: "utf8", timeout: 15_000 });
}

describe("environment file", () => {
  it("reads the repository root .env when started from the API package", () => {
    const run = startFrom("artifacts/api-server", { ".env": "PORT=not-a-port\n" });
    expect(run.stderr).toContain('Invalid PORT value: "not-a-port"');
  }, 20_000);

  it("prefers a .env in the working directory over the root one", () => {
    const run = startFrom("artifacts/api-server", {
      ".env": "PORT=from-root\n",
      "artifacts/api-server/.env": "PORT=from-package\n",
    });
    expect(run.stderr).toContain('Invalid PORT value: "from-package"');
  }, 20_000);
});
