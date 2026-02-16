import { supabase } from '@/lib/supabase'
import type { Property } from '@/lib/types'
import { mapPropertyFromDB } from '@/lib/data-mappers'
import { favoritesLogger } from '@/lib/favorites-logger'
import { withRetry, fetchWithRetry } from '@/lib/retry-utils'

/**
 * Favorites Service
 * Handles all favorite-related operations with comprehensive error handling
 */

// Error types for better error handling
export class FavoritesError extends Error {
  constructor(
    message: string,
    public readonly code: 'NETWORK' | 'AUTH' | 'SERVER' | 'NOT_FOUND' | 'CONFLICT' | 'UNKNOWN',
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'FavoritesError'
  }
}

/**
 * Classify fetch errors into specific error types
 */
function classifyFetchError(error: unknown, response?: Response): FavoritesError {
  if (error instanceof FavoritesError) {
    return error
  }

  if (!response) {
    // Network error (no response)
    return new FavoritesError(
      'Network error. Please check your connection and try again.',
      'NETWORK'
    )
  }

  switch (response.status) {
    case 401:
      return new FavoritesError(
        'Your session has expired. Please sign in again.',
        'AUTH',
        401
      )
    case 403:
      return new FavoritesError(
        'You don\'t have permission to perform this action.',
        'AUTH',
        403
      )
    case 404:
      return new FavoritesError(
        'Favorite not found.',
        'NOT_FOUND',
        404
      )
    case 409:
      return new FavoritesError(
        'This property is already in your favorites.',
        'CONFLICT',
        409
      )
    case 429:
      return new FavoritesError(
        'Too many requests. Please wait a moment and try again.',
        'NETWORK',
        429
      )
    case 500:
    case 502:
    case 503:
    case 504:
      return new FavoritesError(
        'Server error. Please try again later.',
        'SERVER',
        response.status
      )
    default:
      return new FavoritesError(
        'An unexpected error occurred. Please try again.',
        'UNKNOWN',
        response.status
      )
  }
}

/**
 * Parse API response and handle errors
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw classifyFetchError(new Error(errorData.error), response)
  }

  return response.json()
}

export async function getFavorites(userId: string): Promise<Property[]> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.info('Fetching favorites', {
      userId,
      action: 'fetch',
      requestId,
    })

    const response = await withRetry(
      () => fetch('/api/favorites'),
      'getFavorites',
      { userId, action: 'fetch', requestId },
      { maxRetries: 2 }
    )

    const { data } = await parseResponse<{ data: any[] }>(response)

    favoritesLogger.info('Successfully fetched favorites', {
      userId,
      count: data.length,
      requestId,
    })

    // Map the favorites data to Property objects
    return data.map((fav: any) => mapPropertyFromDB(fav.properties))
  } catch (error) {
    const classifiedError = classifyFetchError(error)
    favoritesLogger.error('Failed to fetch favorites', {
      userId,
      errorCode: classifiedError.code,
      statusCode: classifiedError.statusCode,
      requestId,
    }, error)
    throw classifiedError
  }
}

export async function addFavorite(propertyId: string): Promise<boolean> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.info('Adding favorite', {
      propertyId,
      action: 'add',
      requestId,
    })

    const response = await withRetry(
      () =>
        fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId }),
        }),
      'addFavorite',
      { propertyId, action: 'add', requestId },
      { maxRetries: 2 }
    )

    await parseResponse(response)

    favoritesLogger.info('Successfully added favorite', {
      propertyId,
      requestId,
    })

    return true
  } catch (error) {
    const classifiedError = classifyFetchError(error)
    favoritesLogger.error('Failed to add favorite', {
      propertyId,
      errorCode: classifiedError.code,
      statusCode: classifiedError.statusCode,
      requestId,
    }, error)
    throw classifiedError
  }
}

export async function removeFavorite(favoriteId: string): Promise<boolean> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.info('Removing favorite', {
      favoriteId,
      action: 'remove',
      requestId,
    })

    const response = await withRetry(
      () =>
        fetch(`/api/favorites/${favoriteId}`, {
          method: 'DELETE',
        }),
      'removeFavorite',
      { favoriteId, action: 'remove', requestId },
      { maxRetries: 2 }
    )

    await parseResponse(response)

    favoritesLogger.info('Successfully removed favorite', {
      favoriteId,
      requestId,
    })

    return true
  } catch (error) {
    const classifiedError = classifyFetchError(error)
    favoritesLogger.error('Failed to remove favorite', {
      favoriteId,
      errorCode: classifiedError.code,
      statusCode: classifiedError.statusCode,
      requestId,
    }, error)
    throw classifiedError
  }
}

export async function checkIsFavorite(userId: string, propertyId: string): Promise<string | null> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.debug('Checking favorite status', {
      userId,
      propertyId,
      action: 'check',
      requestId,
    })

    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .maybeSingle()

    if (error) {
      favoritesLogger.error('Supabase error checking favorite status', {
        userId,
        propertyId,
        errorCode: error.code,
        requestId,
      }, error)
      throw new FavoritesError(
        'Failed to check favorite status.',
        'SERVER'
      )
    }

    favoritesLogger.debug('Favorite status checked', {
      userId,
      propertyId,
      isFavorite: !!data,
      requestId,
    })

    return data?.id || null
  } catch (error) {
    if (error instanceof FavoritesError) {
      throw error
    }
    favoritesLogger.error('Unexpected error checking favorite status', {
      userId,
      propertyId,
      requestId,
    }, error)
    throw new FavoritesError(
      'Failed to check favorite status.',
      'UNKNOWN'
    )
  }
}

// Legacy functions for backward compatibility (use Supabase directly)
export async function addToFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.info('Legacy: Adding to favorites', {
      userId,
      propertyId,
      requestId,
    })

    const { error } = await supabase
      .from('favorites')
      .insert([{ user_id: userId, property_id: propertyId }])

    if (error) {
      favoritesLogger.error('Legacy: Failed to add favorite', {
        userId,
        propertyId,
        errorCode: error.code,
        requestId,
      }, error)
    }

    return { error }
  } catch (error) {
    favoritesLogger.error('Legacy: Unexpected error adding favorite', {
      userId,
      propertyId,
      requestId,
    }, error)
    return { error }
  }
}

export async function removeFromFavorites(userId: string, propertyId: string): Promise<{ error: any }> {
  const requestId = favoritesLogger.generateRequestId()

  try {
    favoritesLogger.info('Legacy: Removing from favorites', {
      userId,
      propertyId,
      requestId,
    })

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('property_id', propertyId)

    if (error) {
      favoritesLogger.error('Legacy: Failed to remove favorite', {
        userId,
        propertyId,
        errorCode: error.code,
        requestId,
      }, error)
    }

    return { error }
  } catch (error) {
    favoritesLogger.error('Legacy: Unexpected error removing favorite', {
      userId,
      propertyId,
      requestId,
    }, error)
    return { error }
  }
}
