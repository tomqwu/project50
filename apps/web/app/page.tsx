import { coreVersion } from "@project50/core";

export default function HomePage() {
  return <main data-testid="home">project50 v{coreVersion()}</main>;
}
