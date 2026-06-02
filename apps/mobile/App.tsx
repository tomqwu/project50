/**
 * App entry point.
 *
 * COVERAGE EXCLUSION: Whole file (excluded via coveragePathIgnorePatterns in jest.config.js).
 * registerRootComponent is a single native bridge call with no logic.
 * The navigator is wired in AppNavigator.tsx (also excluded — native glue).
 * See COVERAGE.md → Task 5 exclusions.
 */

import { registerRootComponent } from "expo";
import { AppNavigator } from "./src/navigation/AppNavigator";

registerRootComponent(AppNavigator);
