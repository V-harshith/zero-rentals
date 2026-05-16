import type { Metadata } from "next"
import Script from "next/script"
import { getPropertyById } from "@/lib/data-service"
import PropertyClientPage from "./client-page"

type Props = {
    params: Promise<{ id: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    // read route params
    const id = (await params).id

    // fetch data
    const property = await getPropertyById(id)

    if (!property) {
        return {
            title: "Property Not Found | ZeroRentals"
        }
    }

    const title = `${property.title} | ${property.location?.city || "ZeroRentals"} | ZeroRentals`
    const description = property.description?.substring(0, 160) || `Check out this ${property.propertyType} in ${property.location?.area || "your area"}, ${property.location?.city || "your city"}. Rent: ₹${property.price}/month.`
    const images = property.images && property.images.length > 0 ? [property.images[0]] : []

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images,
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images,
        }
    }
}

function generatePropertyJsonLd(property: NonNullable<Awaited<ReturnType<typeof getPropertyById>>>) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zerorentals.com'

    return {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name: property.title,
        description: property.description?.substring(0, 300) || '',
        url: `${baseUrl}/property/${property.id}`,
        datePosted: property.createdAt || new Date().toISOString(),
        image: property.images && property.images.length > 0 ? property.images : undefined,
        offers: {
            '@type': 'Offer',
            price: property.price,
            priceCurrency: 'INR',
            availability: property.availability === 'Available'
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
        },
        address: {
            '@type': 'PostalAddress',
            addressLocality: property.location?.area || '',
            addressRegion: property.location?.city || '',
            addressCountry: 'IN',
            postalCode: property.location?.pincode || '',
        },
        ...(property.location?.latitude && property.location?.longitude && {
            geo: {
                '@type': 'GeoCoordinates',
                latitude: property.location.latitude,
                longitude: property.location.longitude,
            }
        }),
        numberOfRooms: property.roomType === 'Single' ? 1 : property.roomType === 'Double' ? 1 : undefined,
        floorSize: property.roomSize ? {
            '@type': 'QuantitativeValue',
            value: property.roomSize,
            unitCode: 'SQF',
        } : undefined,
    }
}

export default async function Page({ params }: Props) {
    const id = (await params).id
    const property = await getPropertyById(id)

    const jsonLd = property ? generatePropertyJsonLd(property) : null

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <PropertyClientPage id={id} initialProperty={property} />
        </>
    )
}
