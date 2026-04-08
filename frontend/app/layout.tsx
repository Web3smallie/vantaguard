import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Vantaguard — Reflex Layer for DeFi",
  description: "The first autonomous protection system for Uniswap V3 LP positions on Etherlink.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={spaceMono.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}