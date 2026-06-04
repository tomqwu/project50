import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  buildFacebookAuthRequest,
  buildGoogleAuthRequest,
  signInWithFacebook,
  signInWithGoogle,
  handleDeepLinkRedirect,
  REDIRECT_URI,
} from "../lib/session";
import { subscribeToDeepLinks } from "../lib/deeplink";
import { registerAndSavePushToken } from "../lib/push";
import { colors } from "../theme";

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

  // Handle out-of-band OAuth redirects that return to the app via a deep link
  // (custom scheme or Universal/App Link), incl. cold-start launch URLs.
  useEffect(() => {
    const unsubscribe = subscribeToDeepLinks((url) => {
      void handleDeepLinkRedirect(url).then(onToken);
    });
    return unsubscribe;
  }, [onSignedIn]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>project50</Text>
      <Pressable
        testID="signin-facebook"
        style={styles.button}
        onPress={() => void promptFacebook()}
      >
        <Text style={styles.buttonText}>Continue with Facebook</Text>
      </Pressable>
      <Pressable
        testID="signin-google"
        style={[styles.button, styles.googleButton]}
        onPress={() => void promptGoogle()}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>
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
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  button: {
    backgroundColor: "#1877F2",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  googleButton: { backgroundColor: "#DB4437" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
