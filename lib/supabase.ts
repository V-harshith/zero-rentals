import { createBrowserClient } from '@supabase/ssr'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Configure Supabase client with persistent storage
// CRITICAL: Uses cookies by default to match middleware behavior
// This ensures session consistency between client and server
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable automatic token refresh
    autoRefreshToken: true,
    // Persist session across page refreshes
    persistSession: true,
    // Detect session from URL (for email verification links)
    detectSessionInUrl: true,
    // NOTE: No storage override - uses cookies by default to match middleware
    // This ensures session consistency between client and server
    // Flow type for PKCE (more secure)
    flowType: 'pkce',
  },
  // Global settings
  global: {
    headers: {
      'x-application-name': 'zero-rentals',
    },
  },
})

// ============================================================================
// REALTIME SUBSCRIPTION MANAGER
// ============================================================================
// Prevents duplicate subscriptions to the same table/channel
// Supports multiple callbacks per subscription for shared channels

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableRecord = { [key: string]: any }

interface SubscriptionCallback<T extends TableRecord = TableRecord> {
  id: string
  callback: (payload: RealtimePostgresChangesPayload<T>) => void
}

interface ManagedSubscription<T extends TableRecord = TableRecord> {
  channel: RealtimeChannel
  callbacks: Map<string, SubscriptionCallback<T>['callback']>
  table: string
  schema: string
  filter?: string
  status: 'connecting' | 'connected' | 'error'
}

class SubscriptionManager {
  private subscriptions: Map<string, ManagedSubscription> = new Map()
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map() // Track cleanup timers
  private static instance: SubscriptionManager | null = null
  private static readonly CLEANUP_DELAY_MS = 5000 // 5 second grace period

  static getInstance(): SubscriptionManager {
    if (!SubscriptionManager.instance) {
      SubscriptionManager.instance = new SubscriptionManager()
    }
    return SubscriptionManager.instance
  }

  /**
   * Subscribe to postgres changes with deduplication
   * Multiple components can subscribe to the same table - they'll share one channel
   */
  subscribe<T extends TableRecord = TableRecord>(
    channelName: string,
    table: string,
    callback: (payload: RealtimePostgresChangesPayload<T>) => void,
    options: {
      schema?: string
      event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
      filter?: string
    } = {}
  ): () => void {
    const { schema = 'public', event = '*', filter } = options
    const callbackId = `${channelName}-${Math.random().toString(36).slice(2, 11)}`

    // Check if subscription already exists for this channel
    const existing = this.subscriptions.get(channelName)

    if (existing) {
      // Add callback to existing subscription
      existing.callbacks.set(callbackId, callback as ManagedSubscription['callbacks'] extends Map<string, infer V> ? V : never)

      // Return cleanup function
      return () => this.unsubscribe(channelName, callbackId)
    }

    // Create new subscription
    const callbacks = new Map<string, SubscriptionCallback<T>['callback']>()
    callbacks.set(callbackId, callback)

    // Build filter object - using type assertion to satisfy RealtimeChannel.on() overloads
    const filterObj = {
      event: event as 'INSERT' | 'UPDATE' | 'DELETE' | '*',
      schema,
      table,
      ...(filter && { filter })
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        filterObj as {
          event: '*'
          schema: string
          table: string
          filter?: string
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          // Broadcast to all registered callbacks
          const managedSub = this.subscriptions.get(channelName)
          if (managedSub) {
            managedSub.callbacks.forEach((cb) => {
              try {
                cb(payload)
              } catch (error) {
                console.error(`[SubscriptionManager] Callback error for ${channelName}:`, error)
              }
            })
          }
        }
      )
      .subscribe((status) => {
        const managedSub = this.subscriptions.get(channelName)
        if (managedSub) {
          managedSub.status = status === 'SUBSCRIBED' ? 'connected' : status === 'CLOSED' ? 'error' : 'connecting'
        }
      })

    this.subscriptions.set(channelName, {
      channel,
      callbacks: callbacks as ManagedSubscription['callbacks'],
      table,
      schema,
      filter,
      status: 'connecting',
    })

    // Return cleanup function
    return () => this.unsubscribe(channelName, callbackId)
  }

  /**
   * Unsubscribe a specific callback from a channel
   * Only removes the channel when all callbacks are removed (with grace period)
   */
  private unsubscribe(channelName: string, callbackId: string): void {
    const managedSub = this.subscriptions.get(channelName)
    if (!managedSub) return

    // Remove specific callback
    managedSub.callbacks.delete(callbackId)

    // Only remove channel when no more callbacks (with grace period for rapid re-subscriptions)
    if (managedSub.callbacks.size === 0) {
      this.scheduleChannelCleanup(channelName)
    }
  }

  /**
   * Schedule channel cleanup with grace period
   * Prevents channel thrashing during rapid re-subscriptions
   */
  private scheduleChannelCleanup(channelName: string): void {
    // Clear any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(channelName)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
      const managedSub = this.subscriptions.get(channelName)
      // Double-check no new callbacks were added during grace period
      if (managedSub && managedSub.callbacks.size === 0) {
        this.removeChannel(channelName)
      }
      this.cleanupTimers.delete(channelName)
    }, SubscriptionManager.CLEANUP_DELAY_MS)

    this.cleanupTimers.set(channelName, timer)
  }

  /**
   * Force remove a channel and cleanup
   */
  removeChannel(channelName: string): void {
    const managedSub = this.subscriptions.get(channelName)
    if (!managedSub) return

    // Remove from tracking first to prevent race conditions
    this.subscriptions.delete(channelName)

    // Then remove from supabase
    try {
      supabase.removeChannel(managedSub.channel)
    } catch (error) {
      console.error(`[SubscriptionManager] Error removing channel ${channelName}:`, error)
    }
  }

  /**
   * Get status of a subscription
   */
  getStatus(channelName: string): 'connecting' | 'connected' | 'error' | 'not_found' {
    const managedSub = this.subscriptions.get(channelName)
    return managedSub?.status ?? 'not_found'
  }

  /**
   * Get all active subscription names
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  /**
   * Cleanup all subscriptions - useful for logout/reset
   */
  cleanup(): void {
    // Clear all pending cleanup timers
    this.cleanupTimers.forEach((timer) => {
      clearTimeout(timer)
    })
    this.cleanupTimers.clear()

    this.subscriptions.forEach((managedSub, channelName) => {
      try {
        supabase.removeChannel(managedSub.channel)
      } catch (error) {
        console.error(`[SubscriptionManager] Error cleaning up ${channelName}:`, error)
      }
    })
    this.subscriptions.clear()
  }
}

// Export singleton instance
export const subscriptionManager = SubscriptionManager.getInstance()

/**
 * Hook-compatible subscription helper
 * Returns a cleanup function that can be used directly in useEffect
 *
 * Usage:
 * useEffect(() => {
 *   return subscribeToTable('my-channel', 'properties', (payload) => {
 *     console.log('Change received:', payload)
 *   })
 * }, [])
 */
export function subscribeToTable<T extends TableRecord = TableRecord>(
  channelName: string,
  table: string,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  options?: {
    schema?: string
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
    filter?: string
  }
): () => void {
  return subscriptionManager.subscribe(channelName, table, callback, options)
}

// Database Types
export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    email: string
                    name: string
                    phone: string | null
                    role: 'admin' | 'owner' | 'tenant'
                    avatar_url: string | null
                    verified: boolean
                    status: 'active' | 'inactive' | 'suspended'
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['users']['Insert']>
            }
            properties: {
                Row: {
                    id: string
                    title: string
                    description: string | null
                    property_type: 'PG' | 'Co-living' | 'Rent'
                    room_type: 'Single' | 'Double' | 'Triple' | 'Four Sharing' | 'Apartment' | '1RK'
                    country: string
                    city: string
                    area: string
                    locality: string | null
                    address: string | null
                    landmark: string | null
                    latitude: number | null
                    longitude: number | null
                    google_maps_url: string | null
                    owner_id: string | null
                    owner_name: string
                    owner_contact: string
                    owner_verified: boolean
                    private_room_price: number | null
                    one_rk_price: number | null
                    double_sharing_price: number | null
                    triple_sharing_price: number | null
                    four_sharing_price: number | null
                    deposit: number | null
                    maintenance: number | null
                    furnishing: string | null
                    floor_number: number | null
                    total_floors: number | null
                    room_size: number | null
                    preferred_tenant: string | null
                    facilities: string[] | null
                    amenities: string[] | null
                    usp: string | null
                    rules: string[] | null
                    nearby_places: string[] | null
                    images: string[] | null
                    videos: string[] | null
                    availability: 'Available' | 'Occupied' | 'Under Maintenance'
                    featured: boolean
                    verified: boolean
                    status: 'active' | 'inactive' | 'pending' | 'rejected'
                    views: number
                    psn: number | null
                    source: string
                    created_at: string
                    updated_at: string
                    published_at: string | null
                }
                Insert: Omit<Database['public']['Tables']['properties']['Row'], 'id' | 'created_at' | 'updated_at' | 'views'>
                Update: Partial<Database['public']['Tables']['properties']['Insert']>
            }
        }
    }
}
