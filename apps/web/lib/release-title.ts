/**
 * Resolve the ReleaseBadge feature-intro title at build time.
 *
 * The deploy pipeline passes the title base64-encoded (NEXT_PUBLIC_RELEASE_TITLE_B64)
 * because `az acr build` runs its remote `docker build --build-arg ...` through
 * /bin/sh WITHOUT quoting the value — a raw title (spaces + `(#NNN)`) tokenizes
 * wrong and throws `syntax error near unexpected token '('`. base64 keeps the
 * build-arg a single shell-safe token; next.config.mjs decodes it here and inlines
 * the result as NEXT_PUBLIC_RELEASE_TITLE (which lib/build-info.ts reads).
 *
 * Precedence: decoded *_TITLE_B64 (when present and VALID) > legacy raw
 * NEXT_PUBLIC_RELEASE_TITLE > the "dev" fallback. An empty, malformed, or
 * un-sentineled base64 value falls through cleanly to the next source.
 */
export function resolveReleaseTitle(env: {
  NEXT_PUBLIC_RELEASE_TITLE_B64?: string;
  NEXT_PUBLIC_RELEASE_TITLE?: string;
}): string {
  const decoded = decodeReleaseTitleB64(env.NEXT_PUBLIC_RELEASE_TITLE_B64);
  if (decoded) return decoded;
  return env.NEXT_PUBLIC_RELEASE_TITLE || "Local development build";
}

/**
 * Sentinel prefix the encoder prepends to the title BEFORE base64-encoding, so the
 * decoder can prove a value was produced by our pipeline (not a raw string that
 * merely happens to be canonical base64 — e.g. "TWFu"->"Man", "YWJj"->"abc",
 * "RC01"->"D-5"). It ends in U+001F (unit separator): a disallowed control char, so
 * a genuine title can never contain it, which makes the sentinel an unambiguous,
 * un-spoofable marker AND a clean delimiter from the title that follows.
 * Format of the decoded payload: `p50` + U+001F + <title>.
 *
 * Keep this byte-for-byte in sync with scripts/release-build-args.sh (which builds
 * the same `printf 'p50\037%s' "$TITLE" | base64` value) and the inline mirror in
 * apps/web/next.config.mjs.
 */
export const RELEASE_TITLE_B64_SENTINEL = "p50";

/** Standard base64: the 64-char alphabet plus 0–2 trailing `=` padding chars. */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Matches any C0/C1 control char EXCEPT tab (\t), newline (\n), and carriage
 * return (\r): U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, and U+007F–U+009F.
 * Presence of one in the TITLE means the decoded bytes aren't a plausible title
 * string. (The U+FFFD replacement char from a lossy UTF-8 decode is checked
 * separately; the sentinel's own U+001F is stripped before this test runs.)
 */
// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;

/**
 * Encode a title for the NEXT_PUBLIC_RELEASE_TITLE_B64 build-arg: prepend the
 * sentinel, then standard-base64 the UTF-8 bytes. The result is `[A-Za-z0-9+/=]`
 * only — a single shell-safe token that survives `az acr build`'s unquoted remote
 * docker build. Inverse of decodeReleaseTitleB64.
 */
export function encodeReleaseTitleB64(title: string): string {
  return Buffer.from(`${RELEASE_TITLE_B64_SENTINEL}${title}`, "utf8").toString("base64");
}

/**
 * Decode a NEXT_PUBLIC_RELEASE_TITLE_B64 build-arg back to the title, returning ""
 * for missing/empty/INVALID input so callers can fall back cleanly.
 *
 * `Buffer.from(x, "base64")` is LENIENT: it silently drops non-alphabet chars and
 * never throws, so a malformed value (e.g. the operator pastes the un-encoded RAW
 * title, or a stray word that is itself valid base64, into the *_B64 arg) would
 * otherwise decode to GARBAGE and get inlined as the title. To reject that we
 * validate the input is a genuine, pipeline-produced value before trusting it:
 *   1. trim; empty → "" (fall back).
 *   2. charset/shape: must match `^[A-Za-z0-9+/]+={0,2}$` and have length % 4 === 0.
 *   3. round-trip: re-encoding the decoded bytes must reproduce the input exactly
 *      (rejects mis-padded / stray-char inputs the lenient decoder would accept).
 *   4. SENTINEL: the decoded payload must start with RELEASE_TITLE_B64_SENTINEL —
 *      this is what distinguishes our encoding from an arbitrary base64-looking
 *      string. Strip it to get the title.
 *   5. printable UTF-8: the title must be non-empty, carry no U+FFFD replacement
 *      char (lossy decode), and no disallowed control char.
 * Only a value passing every check returns its title; otherwise "".
 */
export function decodeReleaseTitleB64(b64: string | undefined): string {
  if (!b64) return "";
  const input = b64.trim();
  // (2) charset + canonical length. Standard base64 is always a multiple of 4.
  if (!input || input.length % 4 !== 0 || !BASE64_RE.test(input)) return "";
  try {
    const decoded = Buffer.from(input, "base64").toString("utf8");
    // (3) round-trip: reject anything that isn't the canonical encoding of its bytes.
    if (Buffer.from(decoded, "utf8").toString("base64") !== input) return "";
    // (4) sentinel: only accept values our encoder produced; everything else falls back.
    if (!decoded.startsWith(RELEASE_TITLE_B64_SENTINEL)) return "";
    const title = decoded.slice(RELEASE_TITLE_B64_SENTINEL.length);
    // (5) the title must be a non-empty, printable UTF-8 string.
    if (!title) return "";
    if (title.includes("�")) return "";
    if (DISALLOWED_CONTROL_RE.test(title)) return "";
    return title;
  } catch {
    return "";
  }
}
