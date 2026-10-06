import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Comper",
    short_name: "Comper",
    description: "Work through UK prize competitions faster. You enter each one yourself.",
    lang: "en-GB",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f5fa",
    theme_color: "#f6f5fa",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: share a link from any app straight into "Add competition".
    share_target: {
      action: "/add",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Entered", short_name: "Entered", url: "/entered", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Log a win", short_name: "Wins", url: "/wins", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
