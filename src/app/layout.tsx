import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Tráfego · Júlia",
  description: "Briefing diário Meta Ads + histórico",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tráfego" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192" }, { url: "/icon-512.png", sizes: "512x512" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2A4D3F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <header className="border-b border-line bg-white sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold text-ink tracking-tight text-sm sm:text-base">
              Tráfego · Júlia
            </Link>
            <nav className="flex items-center gap-3 sm:gap-6">
              <Link href="/" className="nav-link">Hoje</Link>
              <Link href="/campanhas" className="nav-link">Campanhas</Link>
              <Link href="/vendas" className="nav-link">Vendas</Link>
              <Link href="/historico" className="nav-link">Histórico</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted">
          Atualizado pela Mavi a cada 30min · briefing diário às 9h no Telegram
        </footer>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
