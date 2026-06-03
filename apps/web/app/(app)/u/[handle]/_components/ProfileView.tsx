import { Card, Label } from "@project50/ui";
import { FollowButton } from "./FollowButton";

export interface ProfileChallenge {
  id: string;
  title: string;
  goalType: "TARGET" | "BINARY";
}

export interface ProfileViewProps {
  handle: string;
  displayName: string;
  challenges: ProfileChallenge[];
  /** The profile user's id, used to follow/unfollow them. */
  userId: string;
  /** Whether the viewer currently follows this profile user. */
  isFollowing: boolean;
  /**
   * True when the signed-in viewer is looking at their own profile, in which
   * case no follow button is shown.
   */
  isOwnProfile: boolean;
  /** Whether there is a signed-in viewer at all. */
  hasViewer: boolean;
}

export function ProfileView({
  handle,
  displayName,
  challenges,
  userId,
  isFollowing,
  isOwnProfile,
  hasViewer,
}: ProfileViewProps) {
  const showFollowButton = hasViewer && !isOwnProfile;
  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      {/* Profile header */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: "28px",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: "var(--text)",
            margin: "0 0 4px",
          }}
          data-testid="profile-name"
        >
          {displayName}
        </h1>
        <span
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "15px",
            color: "var(--muted)",
          }}
          data-testid="profile-handle"
        >
          @{handle}
        </span>
        {showFollowButton && (
          <div style={{ marginTop: "16px" }} data-testid="follow-button-slot">
            <FollowButton targetId={userId} initialFollowing={isFollowing} />
          </div>
        )}
      </div>

      {/* Public challenges */}
      <Label>Public challenges</Label>
      {challenges.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-body, system-ui)",
            fontSize: "14px",
            color: "var(--muted)",
            marginTop: "12px",
          }}
          data-testid="profile-empty"
        >
          No public challenges yet.
        </p>
      ) : (
        <div
          style={{
            marginTop: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {challenges.map((c) => (
            <Card key={c.id}>
              <div
                style={{
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                data-testid="profile-challenge"
              >
                <span
                  style={{
                    fontFamily: "var(--font-body, system-ui)",
                    fontSize: "15px",
                    color: "var(--text)",
                  }}
                >
                  {c.title}
                </span>
                <Label>{c.goalType}</Label>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
