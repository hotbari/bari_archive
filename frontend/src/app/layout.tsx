import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyArchive",
  description: "Save and organize your web links with AI-powered categorization",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
