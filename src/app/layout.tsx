import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraderTraining — Paper Trading Platform",
  description: "Practice trading with $10,000 virtual capital on real market prices.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0f14] text-gray-50 antialiased">
        {children}
      </body>
    </html>
  );
}
