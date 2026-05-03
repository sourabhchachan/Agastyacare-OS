import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBootstrap } from "@/components/PwaBootstrap";
import { ToastProvider } from "@/components/feedback/ToastProvider";

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
        <ToastProvider>
          <PwaBootstrap />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
