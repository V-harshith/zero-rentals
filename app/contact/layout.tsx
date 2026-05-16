import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with ZeroRentals. Have questions about PG accommodations, rental listings, or need support? We're here to help.",
  openGraph: {
    title: "Contact ZeroRentals",
    description: "Get in touch with ZeroRentals for PG accommodations, rental listings, or support.",
    type: "website",
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
