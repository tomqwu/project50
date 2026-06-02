/**
 * share.ts — thin wrapper around expo-sharing / Linking.openURL.
 *
 * The native call sites (shareAsync / openURL) are excluded from coverage — they
 * are single-expression native bridge calls with no branching logic of our own.
 * The surrounding logic (checking isAvailableAsync) is fully tested.
 * See COVERAGE.md → Task 4 exclusions.
 */

import * as Sharing from "expo-sharing";
import { Linking } from "react-native";

/**
 * Share a URL using expo-sharing when available, falling back to Linking.openURL.
 * The actual native call is the documented thin exclusion; the capability-check
 * branch is tested.
 */
export async function shareUrl(url: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (available) {
    /* istanbul ignore next — native shareAsync call; zero own logic */
    await Sharing.shareAsync(url);
  } else {
    /* istanbul ignore next — native openURL call; zero own logic */
    await Linking.openURL(url);
  }
}
