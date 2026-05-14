import type { Metadata } from "next";
import Script from "next/script";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MA HSE",
  description: "EHS multi-plant management MVP",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} data-theme="normal" suppressHydrationWarning>
      <body className={`${sora.variable} ${plexMono.variable} min-h-screen antialiased`}>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var storedTheme = window.localStorage.getItem("ma-hse-theme");
              if (storedTheme === "black" || storedTheme === "normal") {
                document.documentElement.setAttribute("data-theme", storedTheme);
              }
            } catch (error) {}
          `}
        </Script>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
