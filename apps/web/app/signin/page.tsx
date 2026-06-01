import { SignInButtons } from "./SignInButtons";

export const metadata = { title: "Sign in — project50" };

export default function SignInPage() {
  const e2eEnabled = process.env.AUTH_E2E === "1";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "48px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--accent)",
          marginBottom: "8px",
        }}
      >
        project50
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body, system-ui)",
          color: "var(--muted)",
          marginBottom: "48px",
          fontSize: "15px",
        }}
      >
        50-day challenges. Build momentum.
      </p>
      <SignInButtons e2eEnabled={e2eEnabled} />
    </div>
  );
}
