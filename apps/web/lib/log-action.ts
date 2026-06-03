/**
 * Structured logging for server actions (M0 #26).
 *
 * Mirrors the API-route pattern in `lib/api/http.ts#handleRoute`: an unexpected
 * throw inside a Server Action is otherwise invisible (Next.js swallows it into a
 * generic client error), so we capture it — the action name plus the serialized
 * error — at `error` level before rethrowing. Expected/validation outcomes that
 * the action returns (rather than throws) are never logged here.
 */

import { logger, serializeError } from "@/lib/logger";

const log = logger.child({ scope: "action" });

/**
 * Wrap a server action so any unexpected throw is logged with structured context
 * before propagating. The returned function has the same signature as `fn`, so
 * the action's success and validation return shapes are unchanged.
 */
export function withActionLogging<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    try {
      return await fn(...args);
    } catch (err) {
      log.error("server action failed", {
        action: name,
        error: serializeError(err),
      });
      throw err;
    }
  };
}
