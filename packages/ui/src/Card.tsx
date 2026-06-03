import type { ReactNode, ElementType, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  // Allow arbitrary attributes (data-*, aria-*, id, etc.) to pass through to
  // the rendered element without weakening the typed props above.
  [key: string]: unknown;
}

export function Card({
  children,
  as: Tag = "article",
  className,
  style,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={className}
      style={{
        background: "var(--card)",
        border: "1px solid var(--hairline)",
        borderRadius: "18px",
        padding: "16px",
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
