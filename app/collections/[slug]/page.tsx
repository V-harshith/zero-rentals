import type { Metadata } from "next"
import CollectionClientPage from "./client-page"

const COLLECTION_METADATA: Record<string, { title: string; description: string }> = {
    "budget-friendly": {
        title: "Budget Friendly PGs & Rentals",
        description: "Find affordable accommodations without compromising on quality."
    },
    "wifi-included": {
        title: "PGs with WiFi Included",
        description: "Stay connected with high-speed internet included in your rent."
    },
    "meals-included": {
        title: "PGs with Meals Included",
        description: "Homely food served daily. Perfect for students and professionals."
    },
    "for-students": {
        title: "Student Friendly Accommodations",
        description: "Safe and affordable PGs near colleges and universities."
    },
    "single-rooms": {
        title: "Single Room PGs & Rentals",
        description: "Enjoy privacy with our verified single occupancy rooms."
    },
    "for-professionals": {
        title: "Premium PGs for Professionals",
        description: "Modern amenities and professional environment for working individuals."
    },
}

type Props = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const slug = (await params).slug
    const meta = COLLECTION_METADATA[slug]

    if (!meta) {
        return {
            title: "Collection Not Found | ZeroRentals"
        }
    }

    return {
        title: `${meta.title} | ZeroRentals`,
        description: meta.description,
        openGraph: {
            title: `${meta.title} | ZeroRentals`,
            description: meta.description,
            type: 'website',
        }
    }
}

export default async function Page({ params }: Props) {
    const slug = (await params).slug
    return <CollectionClientPage slug={slug} />
}
