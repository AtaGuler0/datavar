import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://datavar.ai"),
  title: {
    default: "Datavar: The consented data layer for AI",
    template: "%s · Datavar",
  },
  description:
    "Your data is already training AI. Datavar is where people get paid for it, and where AI teams license consented, auditable datasets from real people.",
  openGraph: {
    title: "Datavar: The consented data layer for AI",
    description:
      "Get paid for the data you already produce. License consented, auditable datasets from real people.",
    url: "https://datavar.ai",
    siteName: "Datavar",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Datavar: The consented data layer for AI",
    description:
      "Get paid for the data you already produce. License consented, auditable datasets from real people.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-scroll-behavior: Next 16 no longer overrides the global
    // `scroll-behavior: smooth` during navigation unless asked to.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper font-sans">
        {children}
      </body>
    </html>
  );
}
