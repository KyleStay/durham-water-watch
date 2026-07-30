import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Durham Water Watch",
    template: "%s · Durham Water Watch",
  },
  description:
    "Independent, source-linked water supply and drought context for Durham, North Carolina.",
  metadataBase: new URL("https://kylestay.github.io/durham-water-watch/"),
  openGraph: {
    title: "Durham Water Watch",
    description:
      "Current shortage stage, days of supply, reservoir levels, and what Durham residents need to do.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Durham Water Watch — clear, independent water supply context" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Durham Water Watch",
    description: "Independent water supply and drought context for Durham, NC.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
