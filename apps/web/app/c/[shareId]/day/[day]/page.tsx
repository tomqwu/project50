import { notFound } from "next/navigation";
import Link from "next/link";
import { PROJECT50_RULES } from "@project50/core";
import { getPublicDay } from "@/lib/api/day-share";

/**
 * Public, unauthenticated view of a single completed Project 50 day. Renders
 * "Day N / 50", the 7 rule rows (✓ for done), the day's photo(s), and the
 * journal (wins / lessons) when present. Visibility + range gating lives in
 * getPublicDay, which returns null for a private/missing share or an
 * out-of-range day — we 404 in that case.
 */
export default async function DaySharePage({
  params,
}: {
  params: Promise<{ shareId: string; day: string }>;
}) {
  const { shareId, day } = await params;

  // Parse the day segment up front: a non-numeric / non-integer param is a 404,
  // not a loader call. (getPublicDay also guards range, but this keeps junk
  // params from touching the DB.)
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber)) {
    notFound();
  }

  const publicDay = await getPublicDay(shareId, dayNumber);
  if (!publicDay) {
    notFound();
  }

  const { challenge, ruleChecks, rulesCompleted, media, journal } = publicDay;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #121013)",
        color: "var(--text, #ffffff)",
      }}
    >
      {/* Public shell header (mirrors /c/[shareId]) */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          borderBottom: "1px solid var(--hairline, rgba(255,255,255,0.1))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "22px",
            letterSpacing: "0.05em",
            color: "var(--accent, #D6FF3F)",
            textTransform: "uppercase",
          }}
          data-testid="wordmark"
        >
          project50
        </span>
        <Link
          href="/signin"
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            color: "var(--text, #ffffff)",
            textDecoration: "none",
          }}
          data-testid="start-own-link"
        >
          Start your own
        </Link>
      </nav>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "32px 24px 64px" }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1
            style={{
              fontFamily: "var(--font-display, 'Anton', sans-serif)",
              textTransform: "uppercase",
              fontSize: 40,
              letterSpacing: "0.02em",
              margin: 0,
            }}
            data-testid="day-heading"
          >
            Day {publicDay.dayNumber} / {challenge.lengthDays}
          </h1>
          <span
            data-testid="rules-completed"
            style={{
              fontFamily: "var(--font-display, 'Anton', sans-serif)",
              fontSize: 22,
              color: "var(--accent, #D6FF3F)",
            }}
          >
            {rulesCompleted} / 7
          </span>
        </header>
        <p style={{ margin: "4px 0 24px", color: "var(--muted)" }}>{challenge.title}</p>

        {/* The 7 rule rows */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {PROJECT50_RULES.map((rule, i) => {
            const done = ruleChecks[i] ?? false;
            return (
              <li
                key={rule.id}
                data-testid={`rule-row-${rule.id}`}
                data-done={done ? "true" : "false"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--hairline)",
                  opacity: done ? 1 : 0.5,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    color: done ? "var(--accent, #D6FF3F)" : "var(--muted)",
                    fontWeight: 700,
                  }}
                >
                  {done ? "✓" : "·"}
                </span>
                <span>{rule.title}</span>
              </li>
            );
          })}
        </ul>

        {/* Photos */}
        {media.length > 0 && (
          <div
            data-testid="day-photos"
            style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}
          >
            {media.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.url}
                src={m.url}
                alt={`Day ${publicDay.dayNumber} photo ${i + 1}`}
                data-testid={`day-photo-${i}`}
                style={{
                  maxWidth: "100%",
                  borderRadius: 12,
                  border: "1px solid var(--hairline)",
                }}
              />
            ))}
          </div>
        )}

        {/* Journal */}
        {journal && (
          <section data-testid="day-journal" style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  color: "var(--muted)",
                  margin: "0 0 6px",
                }}
              >
                Wins
              </h2>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{journal.wins}</p>
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  color: "var(--muted)",
                  margin: "0 0 6px",
                }}
              >
                Lessons
              </h2>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{journal.lessons}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
