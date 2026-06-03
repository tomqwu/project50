import { WelcomeExplainer } from "./_components/WelcomeExplainer";

/**
 * First-run explainer route for Project 50. A self-contained server component
 * that introduces the program (7 daily rules, 50 days, all-or-nothing) before
 * the user heads to the dashboard to start.
 */
export default function WelcomePage() {
  return <WelcomeExplainer />;
}
