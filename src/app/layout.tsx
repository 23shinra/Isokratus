import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import { Atmosphere } from "@/components/atmosphere";
import { PrefsSync } from "@/components/prefs-sync";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sokratus",
    template: "%s · Sokratus",
  },
  description: "Расписание, журнал и QR — без лишнего",
  applicationName: "Sokratus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Sokratus",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "ru_KZ",
    url: siteUrl,
    siteName: "Sokratus",
    title: "Sokratus",
    description: "Расписание, журнал и QR — без лишнего",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Sokratus",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sokratus",
    description: "Расписание, журнал и QR — без лишнего",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0e11" },
    { media: "(prefers-color-scheme: light)", color: "#e8eaef" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      data-theme="dark"
      suppressHydrationWarning
      className={`${onest.variable} ${unbounded.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="relative flex min-h-full flex-col font-sans text-ink">
        <Script
          id="sokratus-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('sokratus-prefs')||'{}');var t=(p.state&&p.state.theme)||'dark';var r=document.documentElement;r.dataset.theme=t;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
        <PrefsSync />
        <Atmosphere />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
        <PwaRegister />
      </body>
    </html>
  );
}
