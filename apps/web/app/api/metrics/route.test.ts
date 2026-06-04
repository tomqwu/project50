import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { incRequest, resetMetrics } from "@/lib/metrics";

const ENV = { ...process.env };

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api/metrics", { headers });
}

describe("GET /api/metrics", () => {
  beforeEach(() => {
    resetMetrics();
    delete process.env.METRICS_TOKEN;
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it("returns Prometheus text with the text/plain content type when token unset", async () => {
    incRequest("GET /api/feed", 200);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body).toContain("# TYPE http_requests_total counter");
    expect(body).toContain('http_requests_total{route="GET /api/feed",status="2xx"} 1');
  });

  it("requires the Bearer token when METRICS_TOKEN is set", async () => {
    process.env.METRICS_TOKEN = "sekret";

    const missing = await GET(req());
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({ error: "unauthorized" });

    const wrong = await GET(req({ authorization: "Bearer nope" }));
    expect(wrong.status).toBe(401);

    const ok = await GET(req({ authorization: "Bearer sekret" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toMatch(/^text\/plain/);
  });
});
