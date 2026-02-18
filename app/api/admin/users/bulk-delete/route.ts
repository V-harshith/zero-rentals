import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/users/bulk-delete
 *
 * Bulk delete multiple users.
 *
 * Request body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { ids } = body

    // Validate ids parameter
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // Validate all ids are strings
    if (!ids.every(id => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'Invalid request: all ids must be strings' },
        { status: 400 }
      )
    }

    // Limit bulk delete to 100 users at a time
    if (ids.length > 100) {
      return NextResponse.json(
        { error: 'Invalid request: cannot delete more than 100 users at once' },
        { status: 400 }
      )
    }

    // Use consistent cookie-based auth like other admin routes
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: adminUser, error: adminCheckError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (adminCheckError || adminUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Rate limiting: 10 bulk deletions per hour per admin
    const rateLimitKey = `admin:user:bulk-delete:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 10, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Prevent admin from deleting themselves
    if (ids.includes(authUser.id)) {
      return NextResponse.json(
        { error: 'Cannot delete your own account. Please remove yourself from the selection.' },
        { status: 400 }
      )
    }

    // Get user details before deletion
    const { data: usersToDelete, error: getUsersError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .in('id', ids)

    if (getUsersError) {
      console.error('Error fetching users:', getUsersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    const foundIds = usersToDelete?.map(u => u.id) || []
    const notFoundIds = ids.filter(id => !foundIds.includes(id))

    if (foundIds.length === 0) {
      return NextResponse.json(
        { error: 'No users found for the provided ids' },
        { status: 404 }
      )
    }

    let deletedCount = 0
    let failedCount = 0
    const failedIds: string[] = []

    // Process users sequentially to avoid overwhelming the server
    for (const userId of foundIds) {
      try {
        // Delete user's properties first (cascade will handle related data)
        const { error: deletePropertiesError } = await supabaseAdmin
          .from('properties')
          .delete()
          .eq('owner_id', userId)

        if (deletePropertiesError) {
          console.error(`Error deleting properties for user ${userId}:`, deletePropertiesError)
          // Continue anyway - user might not have properties
        }

        // Delete user's subscriptions
        const { error: deleteSubscriptionsError } = await supabaseAdmin
          .from('subscriptions')
          .delete()
          .eq('user_id', userId)

        if (deleteSubscriptionsError) {
          console.error(`Error deleting subscriptions for user ${userId}:`, deleteSubscriptionsError)
        }

        // Delete user's favorites
        const { error: deleteFavoritesError } = await supabaseAdmin
          .from('favorites')
          .delete()
          .eq('user_id', userId)

        if (deleteFavoritesError) {
          console.error(`Error deleting favorites for user ${userId}:`, deleteFavoritesError)
        }

        // Delete user from auth
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteAuthError) {
          console.error(`Error deleting user ${userId} from auth:`, deleteAuthError)
          failedCount++
          failedIds.push(userId)
          continue
        }

        // Delete user from users table
        const { error: deleteUserError } = await supabaseAdmin
          .from('users')
          .delete()
          .eq('id', userId)

        if (deleteUserError) {
          console.error(`Error deleting user ${userId} from users table:`, deleteUserError)
          // User is already deleted from auth, so we count this as success
        }

        deletedCount++
      } catch (error) {
        console.error(`Error processing user ${userId}:`, error)
        failedCount++
        failedIds.push(userId)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedCount,
        failedCount,
        requestedCount: ids.length,
        notFoundCount: notFoundIds.length,
        notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined,
        failedIds: failedIds.length > 0 ? failedIds : undefined,
      },
      message: `${deletedCount} user(s) deleted successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`
    })

  } catch (error) {
    console.error('Bulk delete users error:', error)
    return NextResponse.json(
      { error: 'Failed to delete users' },
      { status: 500 }
    )
  }
}
