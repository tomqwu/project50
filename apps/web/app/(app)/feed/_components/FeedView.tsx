import { Card, Label } from "@project50/ui";
import { CheerButton } from "./CheerButton";

export interface FeedMediaItem {
  objectKey: string;
  width: number;
  height: number;
  url: string;
}

export interface FeedActivity {
  id: string;
  userHandle: string;
  challengeTitle: string;
  dayKey: string;
  note?: string | null;
  hasPhoto: boolean;
  cheerCount: number;
  media?: FeedMediaItem[];
  /** True when the source challenge is a Project 50 run. */
  isProject50?: boolean;
  /** 1-based day number within the Project 50 run (only for Project 50 items). */
  project50Day?: number;
}

export interface FeedViewProps {
  items: FeedActivity[];
}

export function FeedView({ items }: FeedViewProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "64px 32px",
          textAlign: "center",
          fontFamily: "var(--font-body, system-ui)",
          color: "var(--muted)",
        }}
        data-testid="feed-empty"
      >
        <p>No activity from people you follow yet.</p>
        <p style={{ marginTop: "8px", fontSize: "14px" }}>Follow others to see their progress here.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "28px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          marginBottom: "8px",
        }}
      >
        Feed
      </h1>
      {items.map((item) => {
        const firstPhoto = item.media && item.media.length > 0 ? item.media[0] : null;
        return (
          <Card key={item.id}>
            <div style={{ padding: "20px" }}>
              {/* Header: handle + challenge + day */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-body, system-ui)",
                      fontWeight: 700,
                      fontSize: "15px",
                      color: "var(--text)",
                    }}
                    data-testid="feed-item-handle"
                  >
                    {item.userHandle}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body, system-ui)",
                      fontSize: "13px",
                      color: "var(--muted)",
                      marginTop: "2px",
                    }}
                  >
                    {item.challengeTitle}
                  </div>
                  {item.isProject50 && (
                    <div
                      data-testid="project50-badge"
                      style={{
                        display: "inline-block",
                        marginTop: "6px",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "var(--accent, #ff5a3c)",
                        color: "var(--on-accent, #fff)",
                        fontFamily: "var(--font-body, system-ui)",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      Project 50 · Day {item.project50Day}
                    </div>
                  )}
                </div>
                <Label>{item.dayKey}</Label>
              </div>

              {/* Photo: render real image when media URL is available, placeholder when hasPhoto but no URL */}
              {firstPhoto ? (
                <img
                  src={firstPhoto.url}
                  alt={`Activity photo by ${item.userHandle}`}
                  data-testid="feed-photo"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "240px",
                    objectFit: "cover",
                    borderRadius: "10px",
                    marginBottom: "12px",
                  }}
                />
              ) : item.hasPhoto ? (
                <div
                  style={{
                    width: "100%",
                    height: "160px",
                    background: "var(--surface2)",
                    borderRadius: "10px",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  data-testid="photo-placeholder"
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body, system-ui)",
                      fontSize: "13px",
                      color: "var(--muted)",
                    }}
                  >
                    Photo
                  </span>
                </div>
              ) : null}

              {/* Note */}
              {item.note && (
                <p
                  style={{
                    fontFamily: "var(--font-body, system-ui)",
                    fontSize: "14px",
                    color: "var(--text)",
                    margin: "0 0 12px",
                    lineHeight: 1.5,
                  }}
                  data-testid="feed-item-note"
                >
                  {item.note}
                </p>
              )}

              {/* Cheer button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <CheerButton activityId={item.id} count={item.cheerCount} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
