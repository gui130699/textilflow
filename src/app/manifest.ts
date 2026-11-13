import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TêxtilFlow — Gestão de produção",
    short_name: "TêxtilFlow",
    description: "Sua produção, do início à entrega.",
    start_url: "/painel",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#12365d",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
