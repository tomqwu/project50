/**
 * AppNavigator — React Navigation Stack wiring.
 *
 * COVERAGE EXCLUSION: Whole file (excluded via coveragePathIgnorePatterns in jest.config.js).
 * This is pure declarative native bridge wiring with zero branching logic of our own.
 * NavigationContainer + createStackNavigator exercise the React Navigation native bridge.
 * Screens are tested individually via RNTL (rendered directly, no navigator needed).
 * See COVERAGE.md → Task 5 exclusions.
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { SignInScreen } from "../screens/SignInScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { LogActivityScreen } from "../screens/LogActivityScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { CelebrateScreen } from "../screens/CelebrateScreen";
import { Project50Screen } from "../screens/Project50Screen";
import { colors } from "../theme";

export type RootStackParamList = {
  SignIn: undefined;
  Dashboard: undefined;
  LogActivity: {
    challengeId: string;
    goalType: "TARGET" | "BINARY";
    dailyTarget?: number;
    unit?: string;
    dayKey: string;
  };
  Feed: undefined;
  Celebrate: { challengeId: string };
  Project50: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.charcoal },
  headerTintColor: colors.volt,
  headerTitleStyle: { color: colors.text, fontWeight: "bold" as const },
  cardStyle: { backgroundColor: colors.charcoal },
};

export function AppNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SignIn" screenOptions={screenOptions}>
        <Stack.Screen name="SignIn" options={{ headerShown: false }}>
          {(props) => (
            <SignInScreen
              onSignedIn={() => props.navigation.replace("Dashboard")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: "Dashboard" }}
        />
        <Stack.Screen
          name="LogActivity"
          options={{ title: "Log Activity" }}
        >
          {(props) => (
            <LogActivityScreen
              challengeId={props.route.params.challengeId}
              goalType={props.route.params.goalType}
              dailyTarget={props.route.params.dailyTarget}
              unit={props.route.params.unit}
              dayKey={props.route.params.dayKey}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Feed"
          component={FeedScreen}
          options={{ title: "Feed" }}
        />
        <Stack.Screen
          name="Project50"
          component={Project50Screen}
          options={{ title: "Project 50" }}
        />
        <Stack.Screen
          name="Celebrate"
          options={{ title: "Celebrate" }}
        >
          {(props) => (
            <CelebrateScreen challengeId={props.route.params.challengeId} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
