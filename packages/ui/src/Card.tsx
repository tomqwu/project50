import type { ReactNode, ElementType } from "react";

interface CardProps {
  children: ReactNode;
  as?: ElementType;
}

export function Card({ children, as: Tag = "article" }: CardProps) {
  return (
    <Tag
      style={{
        background: "var(--card)",
        border: "1px solid var(--hairline)",
        borderRadius: "18px",
        padding: "16px",
      }}
    >
      {children}
    </Tag>
  );
}
