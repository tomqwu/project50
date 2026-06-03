import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm build && pnpm start -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_E2E: "1",
      // Allows the e2e Credentials provider to register in `next start` (which
      // forces NODE_ENV=production at build time and runtime). Without this,
      // the NODE_ENV!==production belt-and-suspenders guard in auth.ts would
      // block the provider in the pnpm build && pnpm start e2e server.
      // This flag is ONLY set in the e2e webServer env — never in production.
      AUTH_E2E_ALLOW_PROD: "1",
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "e2e-test-secret",
      AUTH_TRUST_HOST: "1",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://project50:project50@localhost:5432/project50?schema=public",
      // S3 / MinIO — defaults to local docker-compose MinIO; overridden in CI via job env
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "minioadmin",
      S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "minioadmin",
      S3_BUCKET: process.env.S3_BUCKET ?? "project50-media",
      // Use the fake renderer in e2e/CI — no Chromium Remotion render, deterministic MP4
      RECAP_FAKE: "1",
      // Test-only OAuth client ids so the provider authorize redirect carries a
      // non-empty client_id (the empty-client_id bug guarded by oauth-redirect.spec.ts).
      // Never used against real providers — the e2e never completes the OAuth round-trip.
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "e2e-google-client-id",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "e2e-google-secret",
      FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID ?? "e2e-facebook-client-id",
      FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET ?? "e2e-facebook-secret",
    },
  },
});
