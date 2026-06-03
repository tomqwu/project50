"use client";

import { useState, useTransition } from "react";
import { Button } from "@project50/ui";

export interface FollowButtonProps {
  /** The id of the user being followed/unfollowed. */
  targetId: string;
  /** Whether the viewer already follows the target on first render. */
  initialFollowing: boolean;
}

/**
 * Toggles a follow edge for `targetId` via the existing follow route
 * (POST to follow, DELETE to unfollow). The label flips optimistically inside
 * a transition and reverts if the request fails.
 */
export function FollowButton({ targetId, initialFollowing }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !following;
    // Optimistically reflect the new state.
    setFollowing(next);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${targetId}/follow`, {
          method: next ? "POST" : "DELETE",
        });
        if (!res.ok) {
          setFollowing(!next);
        }
      } catch {
        setFollowing(!next);
      }
    });
  }

  return (
    <Button
      type="button"
      variant={following ? "ghost" : "primary"}
      disabled={isPending}
      onClick={toggle}
    >
      {following ? "Unfollow" : "Follow"}
    </Button>
  );
}
