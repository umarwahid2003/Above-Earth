import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Above Earth",
  description:
    "An interactive real-time Earth globe tracking satellites in orbit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
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
      <body className="h-full bg-[#050505] text-[#fafafa] font-sans antialiased selection:bg-white selection:text-black">
        {children}
      </body>
    </html>
  );
}