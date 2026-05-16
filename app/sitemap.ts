import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zerorentals.com'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/co-living`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pg`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/featured-pgs`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/handpicked-pgs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/post-property`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  // Collection pages
  const collections = [
    'budget-friendly',
    'wifi-included',
    'meals-included',
    'for-students',
    'single-rooms',
    'for-professionals',
  ]

  const collectionPages: MetadataRoute.Sitemap = collections.map((slug) => ({
    url: `${baseUrl}/collections/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // Dynamic property pages
  let propertyPages: MetadataRoute.Sitemap = []
  try {
    const { data: properties, error } = await supabase
      .from('properties')
      .select('id, updated_at, created_at')
      .eq('status', 'active')
      .eq('availability', 'Available')
      .order('created_at', { ascending: false })

    if (!error && properties) {
      propertyPages = properties.map((property) => ({
        url: `${baseUrl}/property/${property.id}`,
        lastModified: new Date(property.updated_at || property.created_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    }
  } catch (error) {
    console.error('[Sitemap] Failed to fetch properties:', error)
  }

  return [...staticPages, ...collectionPages, ...propertyPages]
}
