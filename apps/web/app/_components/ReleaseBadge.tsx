import { getBuildInfo, formatBuiltAt } from "@/lib/build-info";

/**
 * A low-profile footer badge showing exactly what's deployed: the CalVer tag,
 * the commit SHA, the build timestamp, and a one-line feature intro that links
 * to the GitHub release notes. Renders on every page (mounted in the root
 * layout) so the running app always advertises its release.
 */
export function ReleaseBadge() {
  const { tag, sha, builtAt, title, releaseUrl } = getBuildInfo();
  const when = formatBuiltAt(builtAt);
  const hasSha = Boolean(sha) && sha !== "local";

  const idLine = (
    <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
      {tag}
      {hasSha ? ` · ${sha}` : ""}
    </span>
  );

  return (
    <footer
      data-testid="release-badge"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        justifyContent: "center",
        gap: "4px 10px",
        padding: "16px 24px 28px",
        textAlign: "center",
        fontFamily: "var(--font-body, system-ui, sans-serif)",
        fontSize: "11px",
        lineHeight: 1.5,
        color: "var(--muted)",
        opacity: 0.75,
      }}
    >
      {releaseUrl ? (
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="release-badge-link"
          style={{ color: "var(--muted)", textDecoration: "none" }}
        >
          {idLine}
        </a>
      ) : (
        idLine
      )}
      {when ? <span data-testid="release-badge-time">· {when}</span> : null}
      <span data-testid="release-badge-title" style={{ fontStyle: "italic" }}>
        · {title}
      </span>
    </footer>
  );
}
