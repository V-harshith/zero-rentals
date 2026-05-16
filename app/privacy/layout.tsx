import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ZeroRentals Privacy Policy. Learn how we collect, use, and protect your personal information when you use our PG and rental property platform.",
  openGraph: {
    title: "Privacy Policy | ZeroRentals",
    description: "Learn how ZeroRentals collects, uses, and protects your personal information.",
    type: "website",
  },
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children
}
