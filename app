import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CapCam — Capture Your Vision",
  description:
    "A browser-based camera with professional controls and DSLR-inspired photo enhancement.",
  applicationName: "CapCam"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
