import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Leaderboard } from "./Leaderboard";
import type { LeaderboardEntry } from "@/lib/leaderboard";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

function entry(over: Partial<LeaderboardEntry> & { rank: number; userId: string }): LeaderboardEntry {
  return {
    handle: over.userId,
    displayName: over.userId.toUpperCase(),
    avatarUrl: null,
    currentDay: 10,
    completedDays: 8,
    isMe: false,
    ...over,
  };
}

const friends: LeaderboardEntry[] = [
  entry({ rank: 1, userId: "ua", displayName: "Alice", currentDay: 12, completedDays: 11 }),
  entry({ rank: 2, userId: "me", displayName: "Me", currentDay: 9, completedDays: 7, isMe: true }),
  entry({ rank: 3, userId: "ub", displayName: "Bob", currentDay: 4, completedDays: 3 }),
];

const global: LeaderboardEntry[] = [
  entry({ rank: 1, userId: "gc", displayName: "Cara", currentDay: 50, completedDays: 49 }),
  entry({ rank: 2, userId: "me", displayName: "Me", currentDay: 9, completedDays: 7, isMe: true }),
];

describe("Leaderboard", () => {
  it("renders an accessible table with the friends scope by default", () => {
    render(<Leaderboard friends={friends} global={global} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    // Friends rows present, global-only row (Cara) absent.
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Cara")).not.toBeInTheDocument();
  });

  it("renders rows in rank order with Day N and total", () => {
    render(<Leaderboard friends={friends} global={global} />);
    const rows = screen.getAllByRole("row");
    // first row is the header
    const body = rows.slice(1);
    expect(within(body[0]!).getByText("Alice")).toBeInTheDocument();
    expect(within(body[1]!).getByText("Me")).toBeInTheDocument();
    expect(within(body[2]!).getByText("Bob")).toBeInTheDocument();
    // metric text
    expect(within(body[0]!).getByText(/Day 12/)).toBeInTheDocument();
    expect(within(body[0]!).getByText(/11 days total/)).toBeInTheDocument();
    // rank numbers
    expect(within(body[0]!).getByText("1")).toBeInTheDocument();
    expect(within(body[2]!).getByText("3")).toBeInTheDocument();
  });

  it("highlights the current user's row", () => {
    render(<Leaderboard friends={friends} global={global} />);
    const meRow = screen.getByTestId("leaderboard-row-me");
    expect(meRow).toHaveAttribute("aria-current", "true");
  });

  it("switches to the global scope when the Global tab is clicked", () => {
    render(<Leaderboard friends={friends} global={global} />);
    fireEvent.click(screen.getByRole("tab", { name: /global/i }));
    expect(screen.getByText("Cara")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /global/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selected tab uses dark ink on the volt accent for contrast (not the undefined --accent-contrast)", () => {
    render(<Leaderboard friends={friends} global={global} />);
    const selected = screen.getByRole("tab", { name: /friends/i });
    const unselected = screen.getByRole("tab", { name: /global/i });
    // High-contrast pairing mirrors the primary Button: --bg ink on --accent.
    expect(selected.style.background).toBe("var(--accent)");
    expect(selected.style.color).toBe("var(--bg)");
    // No reliance on the undefined --accent-contrast token.
    expect(selected.getAttribute("style")).not.toContain("accent-contrast");
    // Unselected tab stays transparent with normal text.
    expect(unselected.style.background).toBe("transparent");
    expect(unselected.style.color).toBe("var(--text)");
  });

  it("can switch back to the friends scope", () => {
    render(<Leaderboard friends={friends} global={global} />);
    fireEvent.click(screen.getByRole("tab", { name: /global/i }));
    fireEvent.click(screen.getByRole("tab", { name: /friends/i }));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /friends/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders an avatar image when avatarUrl is set, initials otherwise", () => {
    const withAvatar: LeaderboardEntry[] = [
      entry({ rank: 1, userId: "ua", displayName: "Alice", avatarUrl: "https://a/x.png" }),
      entry({ rank: 2, userId: "ub", displayName: "Bob", avatarUrl: null }),
    ];
    render(<Leaderboard friends={withAvatar} global={global} />);
    const img = screen.getByRole("img", { name: /alice/i });
    expect(img).toHaveAttribute("src", "https://a/x.png");
    // Bob has no avatar → initial fallback, no img for him.
    expect(screen.queryByRole("img", { name: /bob/i })).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("falls back to '?' when a runner has a blank display name", () => {
    const blank: LeaderboardEntry[] = [
      entry({ rank: 1, userId: "ua", displayName: "   ", avatarUrl: null }),
    ];
    render(<Leaderboard friends={blank} global={global} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows the friends empty state with an invite seam when there are no friends", () => {
    render(<Leaderboard friends={[]} global={global} />);
    expect(screen.getByTestId("leaderboard-empty-friends")).toBeInTheDocument();
    expect(screen.getByText(/no friends yet/i)).toBeInTheDocument();
    // F4 invite seam — a placeholder link, not wired to F4 code yet.
    const invite = screen.getByTestId("leaderboard-invite-seam");
    expect(invite).toHaveAttribute("href", "/refer");
  });

  it("renders the InviteFriendsButton in the empty-state seam when a referralCode is given", () => {
    render(<Leaderboard friends={[]} global={global} referralCode="ABCD2345" />);
    expect(screen.getByTestId("leaderboard-empty-friends")).toBeInTheDocument();
    // The real invite control is wired in alongside the /refer seam link.
    expect(screen.getByTestId("invite-friends-button")).toBeInTheDocument();
    // The /refer seam link is still present (kept intact).
    expect(screen.getByTestId("leaderboard-invite-seam")).toHaveAttribute("href", "/refer");
  });

  it("omits the InviteFriendsButton when no referralCode is given", () => {
    render(<Leaderboard friends={[]} global={global} />);
    expect(screen.getByTestId("leaderboard-empty-friends")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-friends-button")).not.toBeInTheDocument();
  });

  it("shows a generic empty state on the global tab when it is empty", () => {
    render(<Leaderboard friends={friends} global={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: /global/i }));
    expect(screen.getByTestId("leaderboard-empty-global")).toBeInTheDocument();
    // The friends-only invite seam must NOT appear on the global tab.
    expect(screen.queryByTestId("leaderboard-invite-seam")).not.toBeInTheDocument();
  });

  it("renders an inactive label (not 'Day 0') for a currentDay:0 row, keeping the total", () => {
    const withInactive: LeaderboardEntry[] = [
      entry({ rank: 1, userId: "ua", displayName: "Alice", currentDay: 7, completedDays: 6 }),
      // Stale/inactive run: currentDay 0 but has historical completed days.
      entry({ rank: 2, userId: "zz", displayName: "Zed", currentDay: 0, completedDays: 4 }),
    ];
    render(<Leaderboard friends={withInactive} global={global} />);
    const zedRow = screen.getByTestId("leaderboard-row-zz");
    // Project 50 days are 1..50 — never "Day 0".
    expect(within(zedRow).queryByText(/Day 0\b/)).not.toBeInTheDocument();
    expect(within(zedRow).getByText(/not active/i)).toBeInTheDocument();
    // The historical total is still shown for an inactive row.
    expect(within(zedRow).getByText(/4 days total/)).toBeInTheDocument();
  });

  it("friends scope with only the viewer's own row shows the invite empty-state", () => {
    // followees ∪ self → with no followees the array still has the self row, so
    // the empty-state must key off non-self rows, not array length.
    const onlyMe: LeaderboardEntry[] = [
      entry({ rank: 1, userId: "me", displayName: "Me", currentDay: 5, completedDays: 4, isMe: true }),
    ];
    render(<Leaderboard friends={onlyMe} global={global} />);
    expect(screen.getByTestId("leaderboard-empty-friends")).toBeInTheDocument();
    expect(screen.getByText(/no friends yet/i)).toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-invite-seam")).toHaveAttribute("href", "/refer");
    // The leaderboard table of just-yourself is not shown for the no-friends case.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("friends scope with at least one non-self row renders the table, not the empty-state", () => {
    const meAndFriend: LeaderboardEntry[] = [
      entry({ rank: 1, userId: "ua", displayName: "Alice", currentDay: 12, completedDays: 11 }),
      entry({ rank: 2, userId: "me", displayName: "Me", currentDay: 9, completedDays: 7, isMe: true }),
    ];
    render(<Leaderboard friends={meAndFriend} global={global} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("leaderboard-empty-friends")).not.toBeInTheDocument();
  });
});
