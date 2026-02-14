import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { csrfProtection } from "@/lib/csrf-server"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 10 user deletions per hour per admin
    const rateLimitKey = `admin:user:delete:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 10, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const { id } = await params
    const userId = id

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

    // Prevent admin from deleting themselves
    if (authUser.id === userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Get user details before deletion
    const { data: userToDelete, error: getUserError } = await supabaseAdmin
      .from('users')
      .select('email, name, role')
      .eq('id', userId)
      .single()

    if (getUserError || !userToDelete) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete user's properties first (cascade will handle related data)
    const { error: deletePropertiesError } = await supabaseAdmin
      .from('properties')
      .delete()
      .eq('owner_id', userId)

    if (deletePropertiesError) {
      console.error('Error deleting properties:', deletePropertiesError)
      // Continue anyway - user might not have properties
    }

    // Delete user's subscriptions
    const { error: deleteSubscriptionsError } = await supabaseAdmin
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)

    if (deleteSubscriptionsError) {
      console.error('Error deleting subscriptions:', deleteSubscriptionsError)
    }

    // Delete user's favorites
    const { error: deleteFavoritesError } = await supabaseAdmin
      .from('favorites')
      .delete()
      .eq('user_id', userId)

    if (deleteFavoritesError) {
      console.error('Error deleting favorites:', deleteFavoritesError)
    }

    // Finally, delete the user from auth
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      return NextResponse.json(
        { error: 'Failed to delete user from authentication' },
        { status: 500 }
      )
    }

    // Delete user from users table
    const { error: deleteUserError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (deleteUserError) {
      console.error('Error deleting user from users table:', deleteUserError)
      // User is already deleted from auth, so we consider this a success
    }

    return NextResponse.json({
      success: true,
      message: `User ${userToDelete.email} deleted successfully`,
    })

  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    )
  }
}
