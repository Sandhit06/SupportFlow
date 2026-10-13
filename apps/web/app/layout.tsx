import type { Metadata } from "next";
import "./globals.css";
import "./readability.css";
export const metadata: Metadata = {
  title: "SupportFlow — A little more human.",
  description: "A thoughtful workspace for AI-assisted customer support.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
