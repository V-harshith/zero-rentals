import { supabase } from '@/lib/supabase'
import type { Property } from '@/lib/types'
import { mapPropertyFromDB } from '@/lib/data-mappers'

/**
 * Favorites Service
 * Simple and reliable favorites operations using Supabase directly
 */

export async function getFavorites(): Promise<Property[]> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        id,
        property_id,
        created_at,
        properties (*)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching favorites:', error)
      return []
    }

    // Map the favorites data to Property objects
    return (data || [])
      .map((fav: any) => {
        const prop = Array.isArray(fav.properties) ? fav.properties[0] : fav.properties
        return prop ? mapPropertyFromDB(prop) : null
      })
      .filter(Boolean) as Property[]
  } catch (error) {
    console.error('Error fetching favorites:', error)
    return []
  }
}

export async function addFavorite(propertyId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('favorites')
      .insert([{ property_id: propertyId }])

    if (error) {
      if (error.code === '23505') {
        // Duplicate - already in favorites, that's fine
        return true
      }
      console.error('Error adding favorite:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error adding favorite:', error)
    return false
  }
}

export async function removeFavorite(propertyId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('property_id', propertyId)

    if (error) {
      console.error('Error removing favorite:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error removing favorite:', error)
    return false
  }
}

export async function checkIsFavorite(propertyId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('property_id', propertyId)
      .maybeSingle()

    if (error) {
      console.error('Error checking favorite status:', error)
      return false
    }

    return !!data
  } catch (error) {
    console.error('Error checking favorite status:', error)
    return false
  }
}

// Legacy functions for backward compatibility
export async function addToFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  return { error: !await addFavorite(propertyId) }
}

export async function removeFromFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  return { error: !await removeFavorite(propertyId) }
}
