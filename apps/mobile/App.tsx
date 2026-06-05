/**
 * App entry point.
 *
 * COVERAGE EXCLUSION: Whole file (excluded via coveragePathIgnorePatterns in jest.config.js).
 * registerRootComponent is a single native bridge call with no logic.
 * The navigator is wired in AppNavigator.tsx (also excluded — native glue).
 * See COVERAGE.md → Task 5 exclusions.
 */

// Must be the first import: react-native-gesture-handler registers its native
// module on import and is a required peer dependency of @react-navigation/stack.
import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { initCrashReporting } from "./src/lib/crash";

// Env-gated crash/error reporting: initializes Sentry only when
// EXPO_PUBLIC_SENTRY_DSN is set; a complete no-op otherwise so dev/CI/Expo Go
// are unaffected.
initCrashReporting();

registerRootComponent(AppNavigator);
