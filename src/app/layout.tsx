import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif" });

export const metadata: Metadata = { title: "Interval Read", description: "AI draft first read of interval chest imaging. Demo on public de-identified images with a synthetic chart." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-role="radiology" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <body style={{ ["--font-sans" as string]: "var(--font-plex-sans), system-ui, sans-serif", ["--font-mono" as string]: "var(--font-plex-mono), ui-monospace, monospace", ["--font-serif" as string]: "var(--font-source-serif), Georgia, serif" }}>
        <Header />
        {children}
      </body>
    </html>
  );
}
