import { Card } from "@project50/ui";

/** Health level for a single component or the overall page. */
export type StatusLevel = "operational" | "degraded" | "down";

/** Health snapshot for one tracked component. */
export interface ComponentStatus {
  /** Human-readable component name, e.g. "Database". */
  name: string;
  /** Current health level. */
  status: StatusLevel;
  /** ISO-8601 timestamp of when this component was last checked. */
  checkedAt: string;
}

interface StatusViewProps {
  /** Aggregate health across all components. */
  overall: StatusLevel;
  /** Per-component health rows, rendered in order. */
  components: ComponentStatus[];
}

const OVERALL_COPY: Record<
  StatusLevel,
  { headline: string; dot: string }
> = {
  operational: { headline: "All systems operational", dot: "var(--accent)" },
  degraded: { headline: "Degraded performance", dot: "#f5a623" },
  down: { headline: "Major outage", dot: "var(--danger)" },
};

const STATUS_LABEL: Record<StatusLevel, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
};

const STATUS_COLOR: Record<StatusLevel, string> = {
  operational: "var(--accent)",
  degraded: "#f5a623",
  down: "var(--danger)",
};

function StatusDot({ status }: { status: StatusLevel }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: STATUS_COLOR[status],
        flex: "0 0 auto",
      }}
    />
  );
}

/**
 * Presentational status page — renders an overall health banner plus a row per
 * component. Pure/deterministic (no clocks or fetches) so it is trivial to test
 * each of the operational / degraded / down states.
 */
export function StatusView({ overall, components }: StatusViewProps) {
  const copy = OVERALL_COPY[overall];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "72px 24px 88px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "640px" }}>
        <header style={{ marginBottom: "28px" }}>
          <p
            style={{
              fontFamily: "var(--font-body, system-ui, sans-serif)",
              fontSize: "12px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            project50 status
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display, 'Anton', sans-serif)",
              fontSize: "clamp(36px, 8vw, 56px)",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "var(--text)",
              margin: 0,
              lineHeight: 1,
            }}
          >
            System status
          </h1>
        </header>

        <Card
          data-testid="overall-status"
          data-status={overall}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "20px",
            marginBottom: "24px",
            borderColor: STATUS_COLOR[overall],
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: copy.dot,
              flex: "0 0 auto",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display, 'Anton', sans-serif)",
              fontSize: "clamp(20px, 4vw, 26px)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {copy.headline}
          </span>
        </Card>

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {components.map((c) => (
            <Card
              key={c.name}
              as="li"
              data-testid="component-row"
              data-status={c.status}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px 18px",
                marginBottom: "12px",
              }}
            >
              <StatusDot status={c.status} />
              <span style={{ fontWeight: 600, flex: "1 1 auto" }}>
                {c.name}
              </span>
              <span style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: STATUS_COLOR[c.status],
                  }}
                >
                  {STATUS_LABEL[c.status]}
                </span>
                <time
                  dateTime={c.checkedAt}
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "var(--muted)",
                  }}
                >
                  checked {new Date(c.checkedAt).toUTCString()}
                </time>
              </span>
            </Card>
          ))}
        </ul>

        <p
          style={{
            marginTop: "28px",
            fontSize: "12px",
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          Health is sampled live each time this page loads, backed by the same
          readiness checks used by our infrastructure probes.
        </p>
      </div>
    </main>
  );
}
