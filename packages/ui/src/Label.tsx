import type {
  ReactNode,
  CSSProperties,
  LabelHTMLAttributes,
  HTMLAttributes,
} from "react";

interface LabelProps extends Omit<LabelHTMLAttributes<HTMLElement>, "style"> {
  children: ReactNode;
  /** When provided, renders a real <label> associated with the control id. */
  htmlFor?: string;
  style?: CSSProperties;
}

const labelStyle: CSSProperties = {
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

export function Label({ children, htmlFor, style, ...rest }: LabelProps) {
  // Render a semantic <label> only when associating with a control, so the
  // default standalone usage stays a plain <span> (non-breaking).
  if (htmlFor !== undefined) {
    return (
      <label htmlFor={htmlFor} style={{ ...labelStyle, ...style }} {...rest}>
        {children}
      </label>
    );
  }

  return (
    <span
      style={{ ...labelStyle, ...style }}
      {...(rest as HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  );
}
