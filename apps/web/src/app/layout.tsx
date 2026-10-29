import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const display = Source_Serif_4({
  variable: "--font-display",
  weight: ["600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Capital Elite — Wealth CRM",
  description: "CRM de wealth management com recomendações por IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o next-themes ajusta a classe do <html> antes da hidratação
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background text-foreground"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
