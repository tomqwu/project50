/**
 * RNTL tests for SignInScreen.
 * The session + deeplink modules are mocked: buildFacebookAuthRequest /
 * buildGoogleAuthRequest return fake [request, response, promptAsync] tuples;
 * the sign-in + deep-link handlers are stubbed.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPromptFacebook = jest.fn();
const mockPromptGoogle = jest.fn();
jest.mock("../lib/session", () => ({
  buildFacebookAuthRequest: () => [{}, null, mockPromptFacebook],
  buildGoogleAuthRequest: () => [{}, null, mockPromptGoogle],
  signInWithFacebook: jest.fn().mockResolvedValue("tok"),
  signInWithGoogle: jest.fn().mockResolvedValue("tok"),
  handleDeepLinkRedirect: jest.fn().mockResolvedValue(null),
  REDIRECT_URI: "project50://redirect",
}));

// subscribeToDeepLinks: capture the handler so a test can fire an inbound url.
let capturedDeepLinkHandler: ((url: string) => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock("../lib/deeplink", () => ({
  subscribeToDeepLinks: (handler: (url: string) => void) => {
    capturedDeepLinkHandler = handler;
    return mockUnsubscribe;
  },
}));

// Push registration is best-effort native glue; mock it so the screen test
// stays unit-level. We assert it fires on a successful sign-in.
const mockRegisterAndSavePushToken = jest.fn().mockResolvedValue(null);
jest.mock("../lib/push", () => ({
  registerAndSavePushToken: () => mockRegisterAndSavePushToken(),
}));

import { SignInScreen } from "./SignInScreen";
// Pulls the mocked implementations (the jest.mock above is hoisted).
import {
  signInWithFacebook,
  signInWithGoogle,
  handleDeepLinkRedirect,
} from "../lib/session";

describe("SignInScreen", () => {
  beforeEach(() => {
    mockRegisterAndSavePushToken.mockClear();
    mockPromptFacebook.mockClear();
    mockPromptGoogle.mockClear();
    mockUnsubscribe.mockClear();
    capturedDeepLinkHandler = null;
    (signInWithFacebook as jest.Mock).mockResolvedValue("tok");
    (signInWithGoogle as jest.Mock).mockResolvedValue("tok");
    (handleDeepLinkRedirect as jest.Mock).mockResolvedValue(null);
  });

  // ─── Facebook ───────────────────────────────────────────────────────────────

  it("renders the Facebook button and triggers promptAsync on press", async () => {
    const { getByTestId } = render(<SignInScreen onSignedIn={jest.fn()} />);
    fireEvent.press(getByTestId("signin-facebook"));
    await waitFor(() => expect(mockPromptFacebook).toHaveBeenCalled());
  });

  it("calls onSignedIn when the FB auth response succeeds", async () => {
    const onSignedIn = jest.fn();
    render(
      <SignInScreen
        onSignedIn={onSignedIn}
        _response={{ type: "success", params: { code: "c" } }}
      />,
    );
    await waitFor(() => expect(signInWithFacebook).toHaveBeenCalled());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it("registers for push notifications after a successful sign-in", async () => {
    render(
      <SignInScreen
        onSignedIn={jest.fn()}
        _response={{ type: "success", params: { code: "c" } }}
      />,
    );
    await waitFor(() => expect(mockRegisterAndSavePushToken).toHaveBeenCalled());
  });

  it("does not call onSignedIn when no token is returned (FB)", async () => {
    const onSignedIn = jest.fn();
    (signInWithFacebook as jest.Mock).mockResolvedValueOnce(null);
    render(
      <SignInScreen
        onSignedIn={onSignedIn}
        _response={{ type: "success", params: { code: "c" } }}
      />,
    );
    await waitFor(() => expect(signInWithFacebook).toHaveBeenCalled());
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(mockRegisterAndSavePushToken).not.toHaveBeenCalled();
  });

  // ─── Google ───────────────────────────────────────────────────────────────

  it("renders the Google button and triggers promptAsync on press", async () => {
    const { getByTestId } = render(<SignInScreen onSignedIn={jest.fn()} />);
    fireEvent.press(getByTestId("signin-google"));
    await waitFor(() => expect(mockPromptGoogle).toHaveBeenCalled());
  });

  it("calls onSignedIn when the Google auth response succeeds", async () => {
    const onSignedIn = jest.fn();
    render(
      <SignInScreen
        onSignedIn={onSignedIn}
        _googleResponse={{ type: "success", params: { code: "g" } }}
      />,
    );
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalled());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it("does not call onSignedIn when no token is returned (Google)", async () => {
    const onSignedIn = jest.fn();
    (signInWithGoogle as jest.Mock).mockResolvedValueOnce(null);
    render(
      <SignInScreen
        onSignedIn={onSignedIn}
        _googleResponse={{ type: "success", params: { code: "g" } }}
      />,
    );
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalled());
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  // ─── Deep-link redirect ─────────────────────────────────────────────────────

  it("subscribes to deep links and unsubscribes on unmount", () => {
    const { unmount } = render(<SignInScreen onSignedIn={jest.fn()} />);
    expect(capturedDeepLinkHandler).toBeInstanceOf(Function);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("signs in when a deep-link redirect yields a token", async () => {
    const onSignedIn = jest.fn();
    (handleDeepLinkRedirect as jest.Mock).mockResolvedValueOnce("dl-tok");
    render(<SignInScreen onSignedIn={onSignedIn} />);

    capturedDeepLinkHandler!("project50://oauth/callback?code=c");

    await waitFor(() => expect(handleDeepLinkRedirect).toHaveBeenCalledWith(
      "project50://oauth/callback?code=c",
    ));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(mockRegisterAndSavePushToken).toHaveBeenCalled();
  });

  it("does not sign in when a deep-link redirect yields no token", async () => {
    const onSignedIn = jest.fn();
    (handleDeepLinkRedirect as jest.Mock).mockResolvedValueOnce(null);
    render(<SignInScreen onSignedIn={onSignedIn} />);

    capturedDeepLinkHandler!("project50://dashboard");

    await waitFor(() => expect(handleDeepLinkRedirect).toHaveBeenCalled());
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  // ─── Accessibility ──────────────────────────────────────────────────────────

  it("exposes both auth buttons as accessible buttons with labels", () => {
    const { getByRole } = render(<SignInScreen onSignedIn={jest.fn()} />);
    expect(getByRole("button", { name: "Continue with Facebook" })).toBeTruthy();
    expect(getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("marks the app name as a header for screen readers", () => {
    const { getByRole } = render(<SignInScreen onSignedIn={jest.fn()} />);
    expect(getByRole("header", { name: "project50" })).toBeTruthy();
  });
});
