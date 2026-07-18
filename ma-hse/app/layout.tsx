import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/layout/providers";
import { parseTheme, THEME_STORAGE_KEY } from "@/lib/theme";
import "driver.js/dist/driver.css";
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
  const cookieStore = await cookies();
  const locale = await getLocale();
  const messages = await getMessages();
  const theme = parseTheme(cookieStore.get(THEME_STORAGE_KEY)?.value);

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <body className={`${sora.variable} ${plexMono.variable} min-h-screen antialiased`}>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
