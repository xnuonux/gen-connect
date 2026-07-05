import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import "../design-system/deep/deep.css";
import "./deep-gen.css";
import DeepBackdrop from "./DeepBackdrop";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "gen connect",
  description:
    "the outreach tool where every email sounds like you wrote it and every campaign feels like a real instrument.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="deep" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} deep-grain antialiased bg-lunari-black text-lunari-cream`}
      >
        <DeepBackdrop />
        {children}
      </body>
    </html>
  );
}
