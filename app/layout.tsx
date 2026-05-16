import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { ModalProvider } from "@/lib/modal-context"
import { LocationProvider } from "@/lib/location-context"
import { NotificationProvider } from "@/lib/notification-context"
import { FavoritesProvider } from "@/lib/favorites-context"
import { EmailVerificationProvider } from "@/lib/email-verification-context"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { Toaster as RadixToaster } from "@/components/ui/toaster"
import { CsrfProvider } from "@/lib/csrf-context"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "ZeroRentals - Find Your Perfect PG & Rental Home",
    template: "%s | ZeroRentals"
  },
  description: "Trusted platform for PG accommodations, co-living spaces, and rental properties across India. Find affordable single rooms, shared options, and flats.",
  keywords: ["PG", "hostel", "rental", "co-living", "room for rent", "flat for rent", "accommodation"],
  authors: [{ name: "ZeroRentals" }],
  creator: "ZeroRentals",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://zerorentals.com"),
  icons: {
    icon: [
      { url: '/icon.png' },
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png' },
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    title: "ZeroRentals - Find Your Perfect PG & Rental Home",
    description: "Trusted platform for PG accommodations, co-living spaces, and rental properties across India",
    siteName: "ZeroRentals",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZeroRentals - Find Your Perfect PG & Rental Home",
    description: "Trusted platform for PG accommodations, co-living spaces, and rental properties across India",
    creator: "@zerorentals"
  },
  verification: {
    google: "YDlz4mqOj2fyKVTDaa58NXXEQByyb1tqb8I-MfzUa40",
    other: {
      "msvalidate.01": "632BC41E34F3C664FC256B292DEABD88",
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zerorentals.com'

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ZeroRentals',
    url: baseUrl,
    logo: `${baseUrl}/icon.png`,
    sameAs: [
      'https://twitter.com/zerorentals',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: ['English', 'Hindi'],
    },
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ZeroRentals',
    url: baseUrl,
    description: 'Trusted platform for PG accommodations, co-living spaces, and rental properties across India.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/search?location={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <CsrfProvider>
          <AuthProvider>
            <EmailVerificationProvider>
              <FavoritesProvider>
                <ModalProvider>
                  <LocationProvider>
                    <SonnerToaster position="bottom-right" closeButton expand={false} />
                    <RadixToaster />
                    {children}
                  </LocationProvider>
                </ModalProvider>
              </FavoritesProvider>
            </EmailVerificationProvider>
          </AuthProvider>
        </CsrfProvider>
      </body>
    </html>
  )
}
