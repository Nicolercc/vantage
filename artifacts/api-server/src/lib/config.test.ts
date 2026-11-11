import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const base = { NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-test" };

describe("configuration", () => {
  it("accepts a minimal production environment and applies defaults", () => {
    const { config, problems } = loadConfig(base);
    expect(problems).toEqual([]);
    expect(config.limits).toMatchObject({ rateLimitMax: 20, rateLimitWindowMs: 600_000, maxConcurrent: 4, dailyBudget: 300 });
    expect(config.databaseUrl).toBeNull();
    expect(config.modelPrices["claude-haiku-4-5-20251001"]).toEqual({ input: 1, output: 5 });
  });

  it("warns, loudly but without stopping, when production has no database", () => {
    const { problems, warnings } = loadConfig(base);
    expect(problems).toEqual([]);
    expect(warnings.join(" ")).toMatch(/lost on every restart/);
  });

  it("stops when a database is required and missing", () => {
    expect(loadConfig({ ...base, REQUIRE_DATABASE: "true" }).problems).toEqual(["REQUIRE_DATABASE is on but DATABASE_URL is not set"]);
    expect(loadConfig({ ...base, REQUIRE_DATABASE: "true", DATABASE_URL: "postgres://u:p@host/db" }).problems).toEqual([]);
  });

  it("names every malformed value and never echoes a secret", () => {
    const { problems } = loadConfig({
      NODE_ENV: "production",
      RATE_LIMIT_MAX: "twenty",
      BRIEF_DAILY_BUDGET: "-5",
      BRIEF_MAX_CONCURRENT: "2.5",
      DATABASE_URL: "mysql://secret-user:secret-pass@host/db",
      OPS_TOKEN: "short-secret",
      REQUIRE_DATABASE: "maybe",
      MODEL_PRICES: "{not json",
    });
    const text = problems.join("\n");
    for (const name of ["RATE_LIMIT_MAX", "BRIEF_DAILY_BUDGET", "BRIEF_MAX_CONCURRENT", "DATABASE_URL", "OPS_TOKEN", "REQUIRE_DATABASE", "MODEL_PRICES", "ANTHROPIC_API_KEY"]) {
      expect(text).toContain(name);
    }
    expect(text).not.toMatch(/secret-pass|short-secret/);
  });

  it("accepts the older key name, and ignores a placeholder database url outside production", () => {
    const { config, problems, warnings } = loadConfig({ NODE_ENV: "development", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "k", DATABASE_URL: "your-db-url-here" });
    expect(problems).toEqual([]);
    expect(config.modelKeyPresent).toBe(true);
    expect(config.databaseUrl).toBeNull();
    expect(warnings.join(" ")).toMatch(/ignoring it/);
  });

  it("stops on malformed generation, verifier and geocoder settings", () => {
    const { problems } = loadConfig({
      ...base,
      BRIEF_MODEL_TIMEOUT_MS: "banana",
      BRIEF_VERIFIER_TIMEOUT_MS: "-5",
      BRIEF_VERIFY: "false",
      GEOCODER_MIN_GAP_MS: "soon",
      GEOCODER_BUDGET_MS: "0",
      GEOCODER_URL: "not a url",
    });
    for (const name of ["BRIEF_MODEL_TIMEOUT_MS", "BRIEF_VERIFIER_TIMEOUT_MS", "BRIEF_VERIFY", "GEOCODER_MIN_GAP_MS", "GEOCODER_BUDGET_MS", "GEOCODER_URL"]) {
      expect(problems.join("\n")).toContain(name);
    }
  });

  it("accepts well-formed generation settings, including a zero geocoder gap", () => {
    const { problems } = loadConfig({
      ...base,
      BRIEF_MODEL_TIMEOUT_MS: "45000",
      BRIEF_VERIFIER_TIMEOUT_MS: "20000",
      BRIEF_VERIFY: "off",
      GEOCODER_MIN_GAP_MS: "0",
      GEOCODER_BUDGET_MS: "9000",
      GEOCODER_URL: "https://nominatim.example.org/search",
    });
    expect(problems).toEqual([]);
  });

  it("merges configured model prices over the defaults", () => {
    const { config } = loadConfig({ ...base, MODEL_PRICES: '{"claude-sonnet-5-5":{"input":3,"output":15}}' });
    expect(Object.keys(config.modelPrices).sort()).toEqual(["claude-haiku-4-5-20251001", "claude-sonnet-5-5"]);
  });
});
