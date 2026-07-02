import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lore Visual Diff",
  description: "Lore repository image visual diff viewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
