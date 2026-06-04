/**
 * RNTL tests for SignInScreen.
 * The session module is mocked: buildFacebookAuthRequest returns a fake
 * [request, response, promptAsync] tuple; signInWithFacebook is stubbed.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockPromptAsync = jest.fn();
jest.mock("../lib/session", () => ({
  buildFacebookAuthRequest: () => [{}, null, mockPromptAsync],
  signInWithFacebook: jest.fn().mockResolvedValue("tok"),
  REDIRECT_URI: "project50://redirect",
}));

// Push registration is best-effort native glue; mock it so the screen test
// stays unit-level. We assert it fires on a successful sign-in.
const mockRegisterAndSavePushToken = jest.fn().mockResolvedValue(null);
jest.mock("../lib/push", () => ({
  registerAndSavePushToken: () => mockRegisterAndSavePushToken(),
}));

import { SignInScreen } from "./SignInScreen";
// Pulls the mocked implementation (the jest.mock above is hoisted), so tests
// can assert against the same jest.fn reference without a require() call.
import { signInWithFacebook } from "../lib/session";

describe("SignInScreen", () => {
  beforeEach(() => {
    mockRegisterAndSavePushToken.mockClear();
  });

  it("renders the Facebook button and triggers promptAsync on press", async () => {
    const { getByTestId } = render(<SignInScreen onSignedIn={jest.fn()} />);
    fireEvent.press(getByTestId("signin-facebook"));
    await waitFor(() => expect(mockPromptAsync).toHaveBeenCalled());
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

  it("does not call onSignedIn when no token is returned", async () => {
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
});
