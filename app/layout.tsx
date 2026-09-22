import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "Above Earth — Live 3D Orbital Satellite Tracker",
  description:
    "Explore active satellites on a 3D Earth globe using current CelesTrak orbital elements and SGP4 propagation estimates.",
  keywords: [
    "satellite tracker",
    "ISS tracker",
    "Starlink",
    "space orbit",
    "Cesium 3D",
    "orbital mechanics",
    "SGP4",
    "live satellite data",
  ],
  authors: [{ name: "Umar Wahid" }],
  openGraph: {
    title: "Above Earth — Live 3D Orbital Satellite Tracker",
    description:
      "Explore active satellites using current CelesTrak orbital elements and SGP4 estimates on an interactive 3D globe.",
    url: "https://above-earth.vercel.app",
    siteName: "Above Earth",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Above Earth — Live 3D Orbital Satellite Tracker",
    description:
      "Explore active satellites in 3D using current CelesTrak orbital elements and SGP4 propagation.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="h-full bg-[#050505] text-[#fafafa] font-sans antialiased selection:bg-white selection:text-black">
        {children}
        <Script
          id="cesium-base-url"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.CESIUM_BASE_URL = "/cesium";`,
          }}
        />
        <Script src="/cesium/Cesium.js" strategy="beforeInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
