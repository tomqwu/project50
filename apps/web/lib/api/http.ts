import { UnauthorizedError } from "@/lib/session";
import { logger, serializeError } from "@/lib/logger";

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
 * Wraps a route handler function, converting known errors to JSON responses.
 * - UnauthorizedError → 401 {error:"unauthorized"}
 * - HttpError → {error:code, detail?} with its status
 * - Other errors → rethrow (Next.js will 500)
 */
export async function handleRoute(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof HttpError) {
      const body: { error: string; detail?: unknown } = { error: err.code };
      if (err.detail !== undefined) body.detail = err.detail;
      return Response.json(body, { status: err.status });
    }
    // Unexpected error → log it (Next will 500). This is the high-value signal:
    // an unhandled failure in a route, with the error captured for triage.
    log.error("unhandled route error", { error: serializeError(err) });
    throw err;
  }
}
