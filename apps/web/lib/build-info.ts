/**
 * Release/build metadata surfaced in the UI (see ReleaseBadge) so anyone can
 * see exactly what is deployed: the CalVer tag, the commit, when it was built,
 * and a one-line feature intro that links to the GitHub release notes.
 *
 * Values come from `NEXT_PUBLIC_RELEASE_*` env vars that are inlined at build
 * time (next.config.mjs derives them from the git tag / commit, and the deploy
 * pipeline overrides them from the GitHub release — see .github/workflows/release.yml).
 * Locally (`next dev` with nothing set) they fall back to honest "dev" values.
 */
export interface BuildInfo {
  /** CalVer release tag, e.g. "v2026.06.04.1", or "dev" when unbuilt. */
  tag: string;
  /** 7-char commit SHA, or "local". */
  sha: string;
  /** ISO build/deploy timestamp, or "" when unknown. */
  builtAt: string;
  /** One-line feature intro / release name. */
  title: string;
  /** Link to the GitHub release notes, or "" when none. */
  releaseUrl: string;
}

export function getBuildInfo(): BuildInfo {
  return {
    tag: process.env.NEXT_PUBLIC_RELEASE_TAG || "dev",
    sha: process.env.NEXT_PUBLIC_RELEASE_SHA || "local",
    builtAt: process.env.NEXT_PUBLIC_RELEASE_TIME || "",
    title: process.env.NEXT_PUBLIC_RELEASE_TITLE || "Local development build",
    releaseUrl: process.env.NEXT_PUBLIC_RELEASE_URL || "",
  };
}

/**
 * Render an ISO timestamp as a compact UTC string ("2026-06-04 09:40 UTC").
 * Returns "" for empty or unparseable input so the badge can omit it cleanly.
 */
export function formatBuiltAt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
