import type { Metadata } from "next"
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

export default async function Page({ params }: Props) {
    const id = (await params).id
    const property = await getPropertyById(id)

    return <PropertyClientPage id={id} initialProperty={property} />
}
