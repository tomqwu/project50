import { Card, Label } from "@project50/ui";
import type { AdminUser, AdminReport } from "@/lib/api/admin";

export interface AdminViewProps {
  users: AdminUser[];
  reports: AdminReport[];
}

const cellStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "14px",
  color: "var(--text)",
};

const headStyle: React.CSSProperties = {
  ...cellStyle,
  fontFamily: "var(--font-display, 'Anton', sans-serif)",
  fontSize: "12px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * Presentational admin dashboard: a roster of users and the most recent
 * moderation reports. Receives already-loaded data; does no fetching.
 */
export function AdminView({ users, reports }: AdminViewProps) {
  return (
    <div style={{ padding: "32px", maxWidth: "720px", margin: "0 auto" }}>
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "28px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: "0 0 24px",
        }}
      >
        Admin
      </h1>

      <section style={{ marginBottom: "40px" }}>
        <Label>Users ({users.length})</Label>
        <div style={{ marginTop: "12px" }}>
          <Card>
            {users.length === 0 ? (
              <p style={{ ...cellStyle, color: "var(--muted)" }}>No users.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={headStyle} scope="col">
                      Handle
                    </th>
                    <th style={headStyle} scope="col">
                      Display name
                    </th>
                    <th style={headStyle} scope="col">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} data-testid={`user-row-${u.id}`}>
                      <td style={cellStyle}>@{u.handle}</td>
                      <td style={cellStyle}>{u.displayName}</td>
                      <td style={cellStyle}>{u.isAdmin ? "Admin" : "Member"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </section>

      <section>
        <Label>Reports ({reports.length})</Label>
        <div style={{ marginTop: "12px" }}>
          <Card>
            {reports.length === 0 ? (
              <p style={{ ...cellStyle, color: "var(--muted)" }}>No reports to review.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={headStyle} scope="col">
                      Target
                    </th>
                    <th style={headStyle} scope="col">
                      Reason
                    </th>
                    <th style={headStyle} scope="col">
                      Reporter
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} data-testid={`report-row-${r.id}`}>
                      <td style={cellStyle}>
                        {r.targetType} · {r.targetId}
                      </td>
                      <td style={cellStyle}>{r.reason}</td>
                      <td style={cellStyle}>@{r.reporterHandle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
