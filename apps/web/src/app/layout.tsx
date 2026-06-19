import type { Metadata } from "next";
import { Orbitron, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SmallScreenNotice } from "@/components/SmallScreenNotice";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-orbitron",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "MusicPhone",
  description: "A collaborative real-time music game — Gartic Phone, but with melodies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <SmallScreenNotice />
      </body>
    </html>
  );
}
