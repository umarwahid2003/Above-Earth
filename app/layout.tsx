import type { Metadata } from "next";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `window.CESIUM_BASE_URL = "/cesium";`,
          }}
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}