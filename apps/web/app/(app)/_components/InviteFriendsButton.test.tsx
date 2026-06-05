import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { InviteFriendsButton } from "./InviteFriendsButton";

const ORIGIN = "https://www.project50.fit";
const CODE = "ABCD2345";
const REF_URL = `${ORIGIN}/?ref=${CODE}`;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("location", { origin: ORIGIN });
});

describe("InviteFriendsButton", () => {
  it("renders the invite microcopy", () => {
    render(<InviteFriendsButton referralCode={CODE} />);
    expect(screen.getByTestId("invite-friends-button")).toHaveTextContent(
      "Invite friends",
    );
  });

  it("uses navigator.share with the referral URL when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("invite-friends-button"));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: REF_URL }));
  });

  it("opens the Facebook sharer popup when navigator.share is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("invite-friends-button"));

    expect(open).toHaveBeenCalledWith(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(REF_URL)}`,
      "_blank",
      "noopener,width=600,height=600",
    );
  });

  it("falls back to the FB sharer when navigator.share rejects", async () => {
    const share = vi.fn().mockRejectedValue(new Error("user cancelled"));
    vi.stubGlobal("navigator", { share });
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("invite-friends-button"));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("facebook.com/sharer"),
        "_blank",
        expect.any(String),
      ),
    );
  });

  it("copy-link fallback writes the referral URL to the clipboard and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("copy-invite-link-button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(REF_URL));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("shows an error when the clipboard copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("copy-invite-link-button"));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });

  it("does nothing destructive when no clipboard API exists on copy", async () => {
    vi.stubGlobal("navigator", {});

    render(<InviteFriendsButton referralCode={CODE} />);
    fireEvent.click(screen.getByTestId("copy-invite-link-button"));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });
});
