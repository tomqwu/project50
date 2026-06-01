import { Label } from "./Label";

interface StatTileProps {
  value: string | number;
  label: string;
  accent?: boolean;
}

export function StatTile({ value, label, accent = false }: StatTileProps) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "30px",
          lineHeight: 1,
          color: accent ? "var(--accent)" : "var(--text)",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "7px" }}>
        <Label>{label}</Label>
      </div>
    </div>
  );
}
