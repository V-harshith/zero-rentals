import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { PropertyCategories } from "@/components/property-categories"
import { FeaturedProperties } from "@/components/featured-properties"
import { HandpickedCollections } from "@/components/handpicked-collections"
import { TrustStatistics } from "@/components/trust-statistics"
import { HowItWorks } from "@/components/how-it-works"
import { Footer } from "@/components/footer"
import { LocationPermissionModal } from "@/components/location-permission-modal"
import { PromotionalBanner } from "@/components/promotional-banners"
// Import data service for server-side fetching
import { getFeaturedProperties } from "@/lib/data-service"

// Revalidate data every 60 seconds
export const revalidate = 60

export default async function HomePage() {
  // Fetch data on the server
  const featuredProperties = await getFeaturedProperties(6)

  return (
    <div className="min-h-screen flex flex-col">
      <PromotionalBanner />
      <Header />
      <main className="flex-1">
        <HeroSection />
        <TrustStatistics />
        <PropertyCategories />
        {/* Pass fetched data to client component */}
        <FeaturedProperties initialProperties={featuredProperties} />
        <HandpickedCollections />
        <HowItWorks />
      </main>
      <Footer />
      <LocationPermissionModal />
    </div>
  )
}
