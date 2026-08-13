import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Above Earth",
  description:
    "An interactive real-time Earth globe tracking satellites in orbit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <Script
          id="cesium-base-url"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.CESIUM_BASE_URL = "/cesium";`,
          }}
        />
        <Script src="/cesium/Cesium.js" strategy="beforeInteractive" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}