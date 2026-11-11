import path from "node:path";
import dotenv from "dotenv";

/**
 * Local settings: a `.env` in the working directory, then the repository-root
 * `.env` the README tells developers to create (`pnpm dev:api` runs from
 * artifacts/api-server). A value already set in the environment always wins,
 * and so does the first file to set it. Deployments set real environment
 * variables, and neither file normally exists there.
 */
dotenv.config({ path: [path.resolve(".env"), path.resolve("../../.env")] });
