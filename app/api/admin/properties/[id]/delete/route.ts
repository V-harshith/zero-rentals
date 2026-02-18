import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'
import { acquirePropertyLock, releasePropertyLock } from '@/lib/property-locks'

/**
 * POST /api/admin/properties/[id]/delete
 *
 * Delete a single property with database-level concurrent edit protection.
 * Uses distributed locking via PostgreSQL to prevent race conditions
 * across Vercel serverless instances.
 *
 * No request body required.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // 1. Verify Authentication & Admin Role (Standard Client)
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Rate limiting: 60 deletions per hour per admin (after auth, using user ID)
    const rateLimitKey = `admin:property:delete:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Acquire distributed lock for concurrent edit protection
    const lockResult = await acquirePropertyLock(params.id, authUser.id, 30, 'delete')
    if (!lockResult.success) {
      return NextResponse.json(
        {
          error: lockResult.error || 'Property is being processed by another admin. Please try again later.',
          locked_by: lockResult.adminId,
          expires_at: lockResult.expiresAt,
          seconds_remaining: lockResult.secondsRemaining
        },
        { status: 423 } // Locked
      )
    }

    try {
      // 3. Fetch Property to verify it exists and get images (Use Admin client)
      const { data: property, error: fetchError } = await supabaseAdmin
        .from('properties')
        .select('id, title, images')
        .eq('id', params.id)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }

      // 4. Delete images from storage BEFORE deleting property (for potential rollback)
      if (property.images && property.images.length > 0) {
        try {
          const filePaths = property.images
            .map((url: string) => {
              const parts = url.split('/property-images/')
              return parts[1]
            })
            .filter(Boolean)

          if (filePaths.length > 0) {
            console.log(`[ADMIN DELETE] Deleting ${filePaths.length} images from storage for property ${params.id}`)
            const { error: storageError } = await supabaseAdmin.storage
              .from('property-images')
              .remove(filePaths)

            if (storageError) {
              console.error(`[ADMIN DELETE] Storage delete warning for property ${params.id}:`, storageError)
              // Don't fail the request - continue with property deletion
            } else {
              console.log(`[ADMIN DELETE] Successfully deleted ${filePaths.length} images from storage for property ${params.id}`)
            }
          }
        } catch (storageError) {
          console.error(`[ADMIN DELETE] Storage delete error for property ${params.id}:`, storageError)
          // Don't fail the request - continue with property deletion
        }
      }

      // 5. Delete the property
      const { error: deleteError } = await supabaseAdmin
        .from('properties')
        .delete()
        .eq('id', params.id)

      if (deleteError) {
        console.error('[ADMIN DELETE] Delete error:', deleteError)
        return NextResponse.json(
          { error: 'Failed to delete property' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          id: params.id,
          title: property.title,
        },
        message: 'Property deleted successfully'
      })
    } finally {
      // Always release the lock
      await releasePropertyLock(params.id, authUser.id, 'delete')
    }
  } catch (error: any) {
    console.error('[ADMIN DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
