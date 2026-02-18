import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/admin/properties/bulk-delete
 *
 * Bulk delete multiple properties.
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

    // Limit bulk delete to 500 properties at a time
    if (ids.length > 500) {
      return NextResponse.json(
        { error: 'Invalid request: cannot delete more than 500 properties at once' },
        { status: 400 }
      )
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

    // Rate limiting: 30 bulk deletions per hour per admin (after auth, using user ID)
    const rateLimitKey = `admin:property:bulk-delete:${authUser.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 30, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // 2. Fetch properties to verify they exist and get images (Use Admin client)
    const { data: properties, error: fetchError } = await supabaseAdmin
      .from('properties')
      .select('id, images')
      .in('id', ids)

    if (fetchError) {
      throw fetchError
    }

    const foundIds = properties?.map(p => p.id) || []
    const notFoundIds = ids.filter(id => !foundIds.includes(id))

    if (foundIds.length === 0) {
      return NextResponse.json(
        { error: 'No properties found for the provided ids' },
        { status: 404 }
      )
    }

    // 3. Collect all image paths from properties to delete
    const allImagePaths: string[] = []
    for (const property of properties || []) {
      if (property.images && property.images.length > 0) {
        const paths = property.images
          .map((url: string) => {
            const parts = url.split('/property-images/')
            return parts[1]
          })
          .filter(Boolean)
        allImagePaths.push(...paths)
      }
    }

    // 4. Delete images from storage BEFORE deleting properties (for potential rollback)
    if (allImagePaths.length > 0) {
      try {
        console.log(`[ADMIN BULK DELETE] Deleting ${allImagePaths.length} images from storage for ${foundIds.length} properties`)

        // Supabase storage.remove() can handle up to 1000 paths at once
        // Process in batches of 500 to be safe
        const batchSize = 500
        let deletedCount = 0

        for (let i = 0; i < allImagePaths.length; i += batchSize) {
          const batch = allImagePaths.slice(i, i + batchSize)
          const { error: storageError } = await supabaseAdmin.storage
            .from('property-images')
            .remove(batch)

          if (storageError) {
            console.error(`[ADMIN BULK DELETE] Storage delete warning for batch ${i / batchSize + 1}:`, storageError)
            // Continue with other batches - don't fail the request
          } else {
            deletedCount += batch.length
          }
        }

        console.log(`[ADMIN BULK DELETE] Successfully deleted ${deletedCount}/${allImagePaths.length} images from storage`)
      } catch (storageError) {
        console.error('[ADMIN BULK DELETE] Storage delete error:', storageError)
        // Don't fail the request - continue with property deletion
      }
    }

    // 5. Delete the properties
    const { error: deleteError, count } = await supabaseAdmin
      .from('properties')
      .delete()
      .in('id', foundIds)

    if (deleteError) {
      console.error('[ADMIN BULK DELETE] Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete properties' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedCount: count || foundIds.length,
        requestedCount: ids.length,
        notFoundCount: notFoundIds.length,
        notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined,
      },
      message: `${count || foundIds.length} property(s) deleted successfully`
    })
  } catch (error: any) {
    console.error('[ADMIN BULK DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    )
  }
}
