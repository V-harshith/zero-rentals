import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing Plans",
  description: "Choose the right ZeroRentals plan for your property listing needs. Free, Starter, Professional, and Enterprise plans with featured listings and priority support.",
  openGraph: {
    title: "Pricing Plans | ZeroRentals",
    description: "Choose the right plan for your property listing needs. Featured listings and priority support.",
    type: "website",
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
