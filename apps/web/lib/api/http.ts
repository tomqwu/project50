import { UnauthorizedError } from "@/lib/session";
import { logger, serializeError } from "@/lib/logger";
import { incRequest, observeLatency } from "@/lib/metrics";
import { checkRateLimit, clientKey, type RateLimitOptions } from "@/lib/rate-limit";

const log = logger.child({ scope: "api" });

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: unknown,
  ) {
    super(code);
  }
}

/** Throw a 404 HttpError with the given code. */
export function notFound(code: string): never {
  throw new HttpError(404, code);
}

/** Throw a 422 HttpError with the given code and optional detail. */
export function unprocessable(code: string, detail?: unknown): never {
  throw new HttpError(422, code, detail);
}

/**
 * Opt-in rate-limit guard for route handlers. Derives a client key from the
 * request (first `x-forwarded-for` IP) and throws a 429 HttpError when the
 * fixed-window limit is exceeded. Call it at the top of a handler, inside
 * `handleRoute`, which serializes the HttpError to JSON.
 *
 * The 429's `retryAfterSeconds` is exposed in the JSON `detail`. FOLLOW-UP: set
 * a real `Retry-After` response header — `handleRoute` would need to read the
 * HttpError detail (or this guard return a Response directly) to do so.
 */
export function enforceRateLimit(req: Request, opts: RateLimitOptions): void {
  const result = checkRateLimit(clientKey(req), opts);
  if (!result.allowed) {
    throw new HttpError(429, "rate_limited", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

/**
 * Wraps a route handler function, converting known errors to JSON responses.
 * - UnauthorizedError → 401 {error:"unauthorized"}
 * - HttpError → {error:code, detail?} with its status
 * - Other errors → rethrow (Next.js will 500)
 *
 * Observability (#27): records request count (by status class) + latency for
 * the route into the in-process metrics registry (`@/lib/metrics`), exposed at
 * `/api/metrics`. Pass `route` (e.g. "GET /api/feed") to label the metric;
 * existing callers that omit it are recorded under "unknown" — recording is
 * best-effort and never alters the response.
 */
export async function handleRoute(
  fn: () => Promise<Response>,
  route = "unknown",
): Promise<Response> {
  const start = performance.now();
  const record = (status: number): void => {
    incRequest(route, status);
    observeLatency(route, performance.now() - start);
  };
  try {
    const res = await fn();
    record(res.status);
    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      record(401);
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof HttpError) {
      record(err.status);
      const body: { error: string; detail?: unknown } = { error: err.code };
      if (err.detail !== undefined) body.detail = err.detail;
      return Response.json(body, { status: err.status });
    }
    // Unexpected error → log it (Next will 500). This is the high-value signal:
    // an unhandled failure in a route, with the error captured for triage.
    record(500);
    log.error("unhandled route error", { error: serializeError(err) });
    throw err;
  }
}
