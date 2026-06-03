import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    boxShadow: "0 0 24px rgba(214,255,63,0.4)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--hairline)",
  },
  danger: {
    background: "var(--danger)",
    color: "var(--text)",
    border: "none",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    onClick,
    children,
    disabled = false,
    type = "button",
    className,
    style,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      disabled={disabled}
      aria-disabled={disabled}
      className={["p50-button", className].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "17px 24px",
        borderRadius: "16px",
        fontFamily: "var(--font-body, system-ui, sans-serif)",
        fontSize: "16px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: "100%",
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
