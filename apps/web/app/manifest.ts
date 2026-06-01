import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "project50",
    short_name: "project50",
    description: "50-day challenges to build lasting habits",
    start_url: "/",
    display: "standalone",
    background_color: "#121013",
    theme_color: "#121013",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
