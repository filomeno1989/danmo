import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Danmo Service System, Lda",
  description:
    "Portal interno da Danmo Service System, Lda: oficina, faturacao, stock, RH e mais.",
  manifest: "/manifest.json",
  icons: { icon: "/logos/danmo-logo.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // A cor da moldura do navegador acompanha o tema (Android/iOS)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1320" }
  ]
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body className="antialiased">
        {/* Sem disableTransitionOnChange: a mudança de tema faz-se com a
            transição suave definida no CSS (0.25s), sem salto seco. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
