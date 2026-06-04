import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { StatusView, type ComponentStatus } from "./StatusView";

const checkedAt = "2026-06-04T12:00:00.000Z";

function makeComponents(
  overrides: Partial<Record<string, ComponentStatus["status"]>> = {},
): ComponentStatus[] {
  return [
    { name: "Web", status: overrides.web ?? "operational", checkedAt },
    { name: "Database", status: overrides.database ?? "operational", checkedAt },
    {
      name: "Object storage",
      status: overrides.storage ?? "operational",
      checkedAt,
    },
  ];
}

describe("StatusView", () => {
  afterEach(() => cleanup());

  it("renders an Operational overall banner when every component is up", () => {
    render(<StatusView overall="operational" components={makeComponents()} />);
    const banner = screen.getByTestId("overall-status");
    expect(banner).toHaveAttribute("data-status", "operational");
    expect(banner).toHaveTextContent(/all systems operational/i);
  });

  it("renders a Degraded overall banner when at least one component is impaired", () => {
    render(
      <StatusView
        overall="degraded"
        components={makeComponents({ storage: "down" })}
      />,
    );
    const banner = screen.getByTestId("overall-status");
    expect(banner).toHaveAttribute("data-status", "degraded");
    expect(banner).toHaveTextContent(/degraded/i);
  });

  it("renders a Down overall banner when every component is down", () => {
    render(
      <StatusView
        overall="down"
        components={makeComponents({
          web: "down",
          database: "down",
          storage: "down",
        })}
      />,
    );
    const banner = screen.getByTestId("overall-status");
    expect(banner).toHaveAttribute("data-status", "down");
    expect(banner).toHaveTextContent(/major outage/i);
  });

  it("renders one row per component with its name and status label", () => {
    render(
      <StatusView
        overall="degraded"
        components={makeComponents({ database: "down" })}
      />,
    );
    const rows = screen.getAllByTestId("component-row");
    expect(rows).toHaveLength(3);

    const dbRow = rows.find((r) => within(r).queryByText("Database"));
    expect(dbRow).toBeDefined();
    expect(dbRow).toHaveAttribute("data-status", "down");
    expect(within(dbRow!).getByText(/down/i)).toBeInTheDocument();

    const webRow = rows.find((r) => within(r).queryByText("Web"));
    expect(webRow).toHaveAttribute("data-status", "operational");
    expect(within(webRow!).getByText(/operational/i)).toBeInTheDocument();
  });

  it("renders the checked-at timestamp for each component as a <time> element", () => {
    render(<StatusView overall="operational" components={makeComponents()} />);
    const times = screen.getAllByText((_, el) => el?.tagName === "TIME");
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times[0]).toHaveAttribute("dateTime", checkedAt);
  });

  it("labels a degraded (but not down) component as Degraded", () => {
    render(
      <StatusView
        overall="degraded"
        components={makeComponents({ storage: "degraded" })}
      />,
    );
    const rows = screen.getAllByTestId("component-row");
    const storageRow = rows.find((r) =>
      within(r).queryByText("Object storage"),
    );
    expect(storageRow).toHaveAttribute("data-status", "degraded");
    expect(within(storageRow!).getByText(/degraded/i)).toBeInTheDocument();
  });
});
