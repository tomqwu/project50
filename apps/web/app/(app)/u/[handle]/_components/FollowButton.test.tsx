import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

import { FollowButton } from "./FollowButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true } as Response)),
  );
});

describe("FollowButton", () => {
  it("renders 'Follow' when not following", () => {
    render(<FollowButton targetId="u1" initialFollowing={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("Follow");
  });

  it("renders 'Unfollow' when already following", () => {
    render(<FollowButton targetId="u1" initialFollowing={true} />);
    expect(screen.getByRole("button")).toHaveTextContent("Unfollow");
  });

  it("POSTs to the follow route and toggles to 'Unfollow' on click", async () => {
    render(<FollowButton targetId="u1" initialFollowing={false} />);

    fireEvent.click(screen.getByRole("button"));

    expect(fetch).toHaveBeenCalledWith("/api/users/u1/follow", {
      method: "POST",
    });
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Unfollow"),
    );
  });

  it("DELETEs the follow route and toggles back to 'Follow' on click", async () => {
    render(<FollowButton targetId="u1" initialFollowing={true} />);

    fireEvent.click(screen.getByRole("button"));

    expect(fetch).toHaveBeenCalledWith("/api/users/u1/follow", {
      method: "DELETE",
    });
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Follow"),
    );
  });

  it("reverts the optimistic toggle when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false } as Response)),
    );
    render(<FollowButton targetId="u1" initialFollowing={false} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Follow"),
    );
  });

  it("reverts the optimistic toggle when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(<FollowButton targetId="u1" initialFollowing={true} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Unfollow"),
    );
  });
});
