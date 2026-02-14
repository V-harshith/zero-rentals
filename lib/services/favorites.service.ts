import { supabase } from '@/lib/supabase'
import type { Property } from '@/lib/types'
import { mapPropertyFromDB } from '@/lib/data-mappers'

/**
 * Favorites Service
 * Handles all favorite-related operations
 */

export async function getFavorites(userId: string): Promise<Property[]> {
  try {
    const response = await fetch('/api/favorites')
    if (!response.ok) throw new Error('Failed to fetch favorites')
    
    const { data } = await response.json()
    
    // Map the favorites data to Property objects
    return data.map((fav: any) => mapPropertyFromDB(fav.properties))
  } catch (error) {
    console.error('Error fetching favorites:', error)
    return []
  }
}

export async function addFavorite(propertyId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to add favorite')
    }
    
    return true
  } catch (error: any) {
    console.error('Error adding favorite:', error)
    throw error
  }
}

export async function removeFavorite(favoriteId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/favorites/${favoriteId}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) throw new Error('Failed to remove favorite')
    
    return true
  } catch (error) {
    console.error('Error removing favorite:', error)
    throw error
  }
}

export async function checkIsFavorite(userId: string, propertyId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .maybeSingle()
    
    if (error) throw error
    return data?.id || null
  } catch (error) {
    console.error('Error checking favorite status:', error)
    return null
  }
}

// Legacy functions for backward compatibility (use Supabase directly)
export async function addToFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('favorites')
      .insert([{ user_id: userId, property_id: propertyId }])
    
    return { error }
  } catch (error) {
    return { error }
  }
}

export async function removeFromFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('property_id', propertyId)
    
    return { error }
  } catch (error) {
    return { error }
  }
}
