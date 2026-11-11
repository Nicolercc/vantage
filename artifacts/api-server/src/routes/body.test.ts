import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Request bodies are parsed before any route, rate limit or authentication,
 * so a malformed body must never be able to take the process down. These run
 * the app in a child process so a crash is observed, not swallowed.
 */

let child: ChildProcess | null = null;
afterEach(() => {
  child?.kill();
  child = null;
});

function startServer(): Promise<{ port: number; exited: () => boolean }> {
  const script = fileURLToPath(new URL("../test/serve.ts", import.meta.url));
  let exited = false;
  child = spawn(process.execPath, ["--import", "tsx", script], {
    env: { ...process.env, NODE_ENV: "production", LOG_LEVEL: "silent" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("exit", () => (exited = true));
  return new Promise((resolve, reject) => {
    child!.stdout!.once("data", (b: Buffer) => resolve({ port: Number(b.toString().trim()), exited: () => exited }));
    child!.once("exit", (code) => reject(new Error(`server exited before listening (code ${code})`)));
  });
}

function send(port: number, method: string, body: Buffer | null, headers: Record<string, string | number> = {}) {
  return new Promise<number | null>((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/healthz", method, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? null));
    });
    req.on("error", () => resolve(null));
    req.end(body ?? undefined);
  });
}

describe("request bodies", () => {
  it("survives a gzip body followed by trailing garbage", async () => {
    const { port, exited } = await startServer();
    const body = Buffer.concat([zlib.gzipSync("{}"), Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]);
    await send(port, "POST", body, { "content-type": "application/json", "content-encoding": "gzip", "content-length": body.length });
    await new Promise((r) => setTimeout(r, 300));
    expect(exited()).toBe(false);
    expect(await send(port, "GET", null)).toBe(200);
  }, 20_000);
});
