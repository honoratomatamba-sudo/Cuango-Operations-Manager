import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cuango Fleet BI — Relatórios Automatizados de Frota',
  description:
    'Plataforma automatizada de análise de entradas e saídas de áreas, tempo de operação por equipamento, desempenho de condutores e eficiência operacional por turno integrada ao Power BI.',
  openGraph: {
    title: 'Cuango Fleet BI — Relatórios Automatizados de Frota',
    description:
      'Análise automatizada de telemetria GPS por área, equipamento, condutor e turno de trabalho com exportação Power BI.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cuango Fleet BI — Relatórios Automatizados de Frota',
    description:
      'Análise automatizada de telemetria GPS por área, equipamento, condutor e turno de trabalho com exportação Power BI.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-white text-slate-900 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
