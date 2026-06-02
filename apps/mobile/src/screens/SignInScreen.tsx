import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  buildFacebookAuthRequest,
  signInWithFacebook,
  REDIRECT_URI,
} from "../lib/session";
import { colors } from "../theme";

interface SignInScreenProps {
  /** Called once a session token has been obtained and stored. */
  onSignedIn: () => void;
  /** Test seam to inject an auth response without the native dialog. */
  _response?: { type: string; params?: Record<string, string> };
}

/**
 * Sign-in screen with "Continue with Facebook".
 *
 * The native auth request hook (buildFacebookAuthRequest) yields a response
 * object once promptAsync resolves; when that response is a success we exchange
 * the code for a session token via signInWithFacebook and notify the caller.
 */
export function SignInScreen({ onSignedIn, _response }: SignInScreenProps): React.JSX.Element {
  const [, response, promptAsync] = buildFacebookAuthRequest();
  const effective = _response ?? response;

  useEffect(() => {
    if (effective?.type === "success") {
      void signInWithFacebook(effective as never, REDIRECT_URI).then((token) => {
        if (token) onSignedIn();
      });
    }
  }, [effective, onSignedIn]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>project50</Text>
      <Pressable
        testID="signin-facebook"
        style={styles.button}
        onPress={() => void promptAsync()}
      >
        <Text style={styles.buttonText}>Continue with Facebook</Text>
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
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
