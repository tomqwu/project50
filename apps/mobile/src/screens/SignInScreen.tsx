import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  buildFacebookAuthRequest,
  buildGoogleAuthRequest,
  signInWithFacebook,
  signInWithGoogle,
  handleDeepLinkRedirect,
  signInDev,
  REDIRECT_URI,
} from "../lib/session";
import { subscribeToDeepLinks } from "../lib/deeplink";
import { registerAndSavePushToken } from "../lib/push";
import { colors } from "../theme";
import { elevation, ripple, uiFontFamily } from "../components/platform";

/**
 * Handle used by the dev-only "Skip login" button. The backend's gated e2e
 * sign-in path (`/api/auth/callback/e2e`, armed by `AUTH_E2E=1` on a local
 * non-prod server) upserts a user for this handle.
 */
const DEV_LOGIN_HANDLE = "dev";

interface SignInScreenProps {
  /** Called once a session token has been obtained and stored. */
  onSignedIn: () => void;
  /** Test seam to inject a Facebook auth response without the native dialog. */
  _response?: { type: string; params?: Record<string, string> };
  /** Test seam to inject a Google auth response without the native dialog. */
  _googleResponse?: { type: string; params?: Record<string, string> };
}

/**
 * Sign-in screen with "Continue with Facebook" and "Continue with Google".
 *
 * The native auth request hooks yield a response object once promptAsync
 * resolves; when that response is a success we exchange the code for a session
 * token and notify the caller. In addition we subscribe to inbound deep-link
 * redirects (custom scheme / Universal Link / App Link) so an OAuth redirect
 * that returns to the app out-of-band is also handled.
 */
export function SignInScreen({
  onSignedIn,
  _response,
  _googleResponse,
}: SignInScreenProps): React.JSX.Element {
  const [, fbResponse, promptFacebook] = buildFacebookAuthRequest();
  const [, googleResponse, promptGoogle] = buildGoogleAuthRequest();
  const effectiveFb = _response ?? fbResponse;
  const effectiveGoogle = _googleResponse ?? googleResponse;

  // After a successful token exchange: register push (best-effort) and notify.
  const onToken = (token: string | null): void => {
    if (token) {
      void registerAndSavePushToken();
      onSignedIn();
    }
  };

  useEffect(() => {
    if (effectiveFb?.type === "success") {
      void signInWithFacebook(effectiveFb as never, REDIRECT_URI).then(onToken);
    }
  }, [effectiveFb, onSignedIn]);

  useEffect(() => {
    if (effectiveGoogle?.type === "success") {
      void signInWithGoogle(effectiveGoogle as never, REDIRECT_URI).then(onToken);
    }
  }, [effectiveGoogle, onSignedIn]);

  // Dev-only: skip OAuth by signing in through the backend's gated e2e path.
  // Never rendered in a production build (the `__DEV__` guard below).
  const onDevSignIn = (): void => {
    void signInDev(DEV_LOGIN_HANDLE)
      .then(onToken)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          "[dev sign-in] failed — is a local backend running with AUTH_E2E=1 at the API base URL?",
          err,
        );
      });
  };

  // Handle out-of-band OAuth redirects that return to the app via a deep link
  // (custom scheme or Universal/App Link), incl. cold-start launch URLs.
  useEffect(() => {
    const unsubscribe = subscribeToDeepLinks((url) => {
      void handleDeepLinkRedirect(url).then(onToken);
    });
    return unsubscribe;
  }, [onSignedIn]);

  return (
    <View
      style={styles.container}
      accessibilityRole="none"
      accessibilityLabel="Sign in to project50"
    >
      <Text style={styles.title} accessibilityRole="header">
        project50
      </Text>
      <Pressable
        testID="signin-facebook"
        style={styles.button}
        android_ripple={ripple("rgba(255, 255, 255, 0.24)")}
        accessibilityRole="button"
        accessibilityLabel="Continue with Facebook"
        accessibilityHint="Signs you in using your Facebook account"
        onPress={() => void promptFacebook()}
      >
        <Text style={styles.buttonText}>Continue with Facebook</Text>
      </Pressable>
      <Pressable
        testID="signin-google"
        style={[styles.button, styles.googleButton]}
        android_ripple={ripple("rgba(255, 255, 255, 0.24)")}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityHint="Signs you in using your Google account"
        onPress={() => void promptGoogle()}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>
      {__DEV__ ? (
        <Pressable
          testID="signin-dev"
          style={[styles.button, styles.devButton]}
          android_ripple={ripple("rgba(255, 255, 255, 0.24)")}
          accessibilityRole="button"
          accessibilityLabel="Skip login (dev)"
          accessibilityHint="Signs in via the local dev backend, bypassing OAuth"
          onPress={onDevSignIn}
        >
          <Text style={styles.buttonText}>Skip login (dev)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.charcoal,
    gap: 24,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    fontFamily: uiFontFamily(),
  },
  button: {
    backgroundColor: "#1877F2",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    minHeight: 44,
    justifyContent: "center",
    overflow: "hidden",
    ...elevation(2),
  },
  googleButton: { backgroundColor: "#DB4437" },
  devButton: { backgroundColor: "#3A3A3A" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
