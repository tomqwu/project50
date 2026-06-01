/**
 * Vitest setupFile: loads DATABASE_URL (and other vars) from .env if not
 * already present in the environment.  In CI the env is pre-populated so this
 * is a no-op.  Locally it reads the repo-root .env so integration tests can
 * connect to Postgres without a manual `export`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) {
  const envPath = resolve(import.meta.dirname, "../../../.env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env absent — rely on env already being set (CI / manual export)
  }
}
