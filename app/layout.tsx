import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sondaggi disponibilità",
  description: "Raccolta disponibilità mensili",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
