import React from "react";
import { Text, StyleSheet } from "react-native";
import { coreVersion } from "@project50/core";
import { colors } from "../theme";

/**
 * Brand identity component — proves @project50/core reuse works in RN context.
 * Renders the app name + core package version using the volt accent colour.
 */
export function Brand(): React.JSX.Element {
  return (
    <Text style={styles.brand}>{`project50 v${coreVersion()}`}</Text>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.volt,
    fontSize: 24,
    fontWeight: "bold",
  },
});
