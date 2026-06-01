interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  label: string;
}

const STROKE_WIDTH = 14;

export function ProgressRing({
  value,
  max,
  size = 160,
  label,
}: ProgressRingProps) {
  const r = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * r;

  // Clamp value: 0 ≤ value ≤ max; handle max=0 by treating progress as 0
  const clampedValue = max <= 0 ? 0 : Math.min(Math.max(value, 0), max);
  const pct = max <= 0 ? 0 : clampedValue / max;
  const dashOffset = circumference * (1 - pct);

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        role="img"
        aria-label={label}
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="var(--hairline)"
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="var(--accent)"
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          style={{
            filter:
              "drop-shadow(0 0 10px rgba(214,255,63,0.65)) drop-shadow(0 0 22px rgba(214,255,63,0.35))",
          }}
        />
      </svg>
      {/* Centered text — rotated back to upright */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display, 'Anton', sans-serif)",
            fontSize: `${Math.round(size * 0.22)}px`,
            lineHeight: 1,
            color: "var(--text)",
          }}
        >
          {`${value}/${max}`}
        </span>
      </div>
    </div>
  );
}
