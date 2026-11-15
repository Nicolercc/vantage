/**
 * Snapshot what retrieval returns today for every evaluation topic, so later
 * runs replay the same evidence. Run: pnpm --filter @workspace/api-server eval:record
 * Existing snapshots are kept unless --force is passed: re-recording changes
 * the evidence, which makes scores before and after incomparable. Use
 * --only id1,id2 (with --force to replace) to touch only those cases.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { searchCoverage } from "../src/brief/retrieval";
import { TOPICS } from "./topics";

const dir = path.resolve(import.meta.dirname, "cases");
const force = process.argv.includes("--force");
// --only id1,id2 records just those cases, so adding a case never re-records the others.
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined);
const only = onlyArg ? new Set(onlyArg.split(",")) : null;
mkdirSync(dir, { recursive: true });

for (const t of TOPICS.filter((x) => !only || only.has(x.id))) {
  const file = path.join(dir, `${t.id}.json`);
  if (existsSync(file) && !force) {
    console.log(`kept      ${t.id}`);
    continue;
  }
  const coverage = await searchCoverage(t.topic);
  writeFileSync(file, `${JSON.stringify({ id: t.id, topic: t.topic, recordedAt: new Date().toISOString(), ...coverage }, null, 2)}\n`);
  console.log(`recorded  ${t.id}: ${coverage.sources.length} sources`);
}
