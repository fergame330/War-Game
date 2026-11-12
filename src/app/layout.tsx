import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/Toasts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guerra Mundial — Jogo de Estratégia",
  description: "Conquiste territórios, domine continentes e conquiste o mundo — local ou online.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#172636",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
