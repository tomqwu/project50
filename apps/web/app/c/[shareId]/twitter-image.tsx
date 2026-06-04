// Twitter share image for a recap reuses the per-recap Open Graph card so X /
// Twitter shows the personalized "Day N / 50" recap instead of inheriting the
// generic layout-level twitter:image.
export { default, size, contentType, alt } from "./opengraph-image";

// Route segment config only takes effect as a literal `export const` in THIS
// file — a re-export is ignored by Next, so declare it directly here (must
// match the opengraph-image route's revalidate = 300).
export const revalidate = 300;
