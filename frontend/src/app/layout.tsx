import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientProviders from "./ClientProviders";
import { ThemeProvider } from "@/components/ThemeProvider"; 

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = "https://woco.eth.limo/";
const siteTitle = "WoCo - World Computer";
const siteDescription = "Privacy-First, Peer-to-Peer Infrastructure for the Open Web. Built on Swarm Network and Ethereum standards.";
const logoUrl = `${siteUrl}logo.png`;

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,

  // Open Graph tags (Facebook, LinkedIn, Discord, iMessage, etc.)
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "WoCo",
    images: [
      {
        url: logoUrl,
        width: 800,
        height: 800,
        alt: "WoCo Logo",
      },
    ],
    type: "website",
    locale: "en_US",
  },

  // Twitter Card tags
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: [logoUrl],
  },

  other: {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.woco-net.com https://gateway.woco-net.com;",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('woco.theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ClientProviders>
            {children}
          </ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
