import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard Tráfego — Júlia",
  description: "Briefing diário Meta Ads + histórico",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <header className="border-b border-line bg-white">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold text-ink tracking-tight">
              Tráfego · Júlia
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="nav-link">Hoje</Link>
              <Link href="/campanhas" className="nav-link">Campanhas</Link>
              <Link href="/historico" className="nav-link">Histórico</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="max-w-6xl mx-auto px-6 py-6 text-xs text-muted">
          Atualizado pela Mavi a cada 1h · briefing diário às 9h no Telegram
        </footer>
      </body>
    </html>
  );
}
