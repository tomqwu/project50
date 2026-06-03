import { HelpView } from "./_components/HelpView";

/**
 * Help / FAQ route for Project 50. Access is gated by the (app) layout's
 * requireAuth, so this server page just renders the self-contained Help Center.
 */
export default function HelpPage() {
  return <HelpView />;
}
