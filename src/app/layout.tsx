import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/hooks/use-session";
import { Pwa } from "@/components/pwa";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "TêxtilFlow | Gestão de produção",
    template: "%s | TêxtilFlow",
  },
  description:
    "Gestão e acompanhamento da produção têxtil, do recebimento ao despacho.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TêxtilFlow" },
};
export const viewport: Viewport = {
  themeColor: "#12365d",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>{children}</SessionProvider>
        <Pwa />
      </body>
    </html>
  );
}
