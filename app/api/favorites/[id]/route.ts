import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

// Helper function to check if user is a tenant
async function verifyTenantRole(supabase: any, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile) return false
  return profile.role === 'tenant'
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request, 'favorites_delete', 20, 60)
    if (rateLimitResult.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: rateLimitResult.headers }
      )
    }

    // Await params for Next.js 15+
    const { id } = await params

    const supabase = await createClient()

    // Get user from server-side session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a tenant
    const isTenant = await verifyTenantRole(supabase, user.id)
    if (!isTenant) {
      return NextResponse.json(
        { error: 'Forbidden - Tenant access required' },
        { status: 403 }
      )
    }

    // Delete the favorite
    const { data, error } = await supabase
      .from('favorites')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select() // Return deleted row to confirm

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Favorite not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Removed from favorites', deleted: data[0] })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}
