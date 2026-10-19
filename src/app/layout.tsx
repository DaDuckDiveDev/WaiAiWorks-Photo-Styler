import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted Archivo (SIL OFL, see src/fonts/OFL.txt) with both of its axes:
// weight for hierarchy, width for the wide camera-body lettering on display
// text. Bundling the file means builds never reach out to Google Fonts.
const archivo = localFont({
  src: "../fonts/archivo-latin-wdth.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  title: "Kaiel Styler | AI Photo Studio",
  description:
    "Kaiel Styler turns event and portrait photography into illustrated artwork and fixes closed or wandering eyes — anime, 3D animated, comic, and storybook renders in seconds.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#050B16",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen font-sans text-pearl antialiased">{children}</body>
    </html>
  );
}
