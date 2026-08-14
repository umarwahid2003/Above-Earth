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
  title: "Above Earth — Real-Time 3D Orbital Satellite Tracker",
  description:
    "Explore 15,000+ active satellites, space stations, and orbital debris in real time on a photorealistic 3D Earth globe with SGP4 propagation and Cockpit POV.",
  keywords: [
    "satellite tracker",
    "ISS tracker",
    "Starlink",
    "space orbit",
    "Cesium 3D",
    "orbital mechanics",
    "SGP4",
    "real-time space",
  ],
  authors: [{ name: "Umar Wahid" }],
  openGraph: {
    title: "Above Earth — Real-Time 3D Orbital Satellite Tracker",
    description:
      "Explore 15,000+ satellites, space stations, and rocket bodies in real time on an interactive 3D globe with Cockpit POV.",
    url: "https://above-earth.vercel.app",
    siteName: "Above Earth",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Above Earth — Real-Time 3D Orbital Satellite Tracker",
    description:
      "Explore 15,000+ satellites and orbital debris in real-time 3D with first-person Cockpit POV.",
  },
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
        <Analytics />
      </body>
    </html>
  );
}