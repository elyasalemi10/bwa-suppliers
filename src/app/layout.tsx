import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "BWA Price Converter",
  description: "Builders Warehouse Australia — Supplier Price Sheet Processor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-[#111]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
