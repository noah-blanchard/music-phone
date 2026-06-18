import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MusicPhone",
  description: "A collaborative real-time music game — Gartic Phone, but with melodies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
