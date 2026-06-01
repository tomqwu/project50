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
    },
  },
});
