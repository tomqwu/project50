export const momentum = {
  bg: "#121013",
  card: "#1C1A1E",
  surface2: "#232026",
  text: "#F2F0EC",
  muted: "#8C8A86",
  accent: "#D6FF3F",
  hairline: "rgba(242,240,236,0.08)",
} as const;

export type MomentumToken = keyof typeof momentum;
