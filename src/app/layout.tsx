import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { OceanField } from "@/components/ocean-field";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Kaiel Styler | AI Photo Styling",
  description:
    "Kaiel Styler turns event and portrait photography into illustrated artwork — anime, 3D animated, comic, and storybook renders in seconds.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen font-sans text-pacific antialiased">
        <OceanField />
        {children}
      </body>
    </html>
  );
}
