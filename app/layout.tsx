import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBootstrap } from "@/components/PwaBootstrap";

export const metadata: Metadata = {
  title: "OS",
  description: "Hospital Operating System",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1B4F8A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
