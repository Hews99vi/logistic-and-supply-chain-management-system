import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Dairy Distribution Operations",
  description: "Commercial dairy distribution operations system."
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} bg-slate-100 font-sans text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
