import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Increase body size limit for image uploads (prevents 413 Payload Too Large)
export const bodyParser = {
  sizeLimit: '10mb',
}

interface UploadResult {
  uploadId: string
  url: string
  storagePath: string
  fileName: string
}

/**
 * Transaction-safe image upload for properties
 *
 * Flow:
 * 1. Validate user and property ownership
 * 2. Save upload records to DB (pending status)
 * 3. Upload files to storage
 * 4. Update upload records to completed
 * 5. On failure: mark as orphaned for cleanup job
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  let propertyId: string | null = null
  const uploadsNeedingRollback: Array<{ id: string; storagePath: string }> = []

  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    propertyId = formData.get('propertyId') as string
    const files = formData.getAll('files') as File[]

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 images allowed' }, { status: 400 })
    }

    // CRITICAL: Verify ownership before allowing upload
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, owner_id')
      .eq('id', propertyId)
      .single()

    if (propertyError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (property.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const uploadedUrls: string[] = []
    const errors: string[] = []

    // Phase 1: Create pending upload records in database FIRST
    // This ensures we track uploads before storage operations
    const uploadRecords: Array<{
      id: string
      file: File
      storagePath: string
      publicUrl: string
    }> = []

    for (const file of files) {
      try {
        // Validate file
        if (!file.type.startsWith('image/')) {
          errors.push(`${file.name}: Not an image file`)
          continue
        }

        if (file.size > 5 * 1024 * 1024) {
          errors.push(`${file.name}: File too large (max 5MB)`)
          continue
        }

        // Generate unique file path
        const fileExt = file.name.split('.').pop() || 'jpg'
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(7)
        const storagePath = `${propertyId}/${timestamp}-${randomSuffix}.${fileExt}`
        const fileName = `${timestamp}-${randomSuffix}.${fileExt}`

        // Get public URL (will be valid after upload)
        const {
          data: { publicUrl },
        } = supabase.storage.from('property-images').getPublicUrl(storagePath)

        // Create pending upload record in database FIRST
        const { data: uploadRecord, error: dbError } = await supabase
          .from('property_image_uploads')
          .insert({
            property_id: propertyId,
            owner_id: user.id,
            file_name: fileName,
            storage_path: storagePath,
            public_url: publicUrl,
            file_size: file.size,
            mime_type: file.type,
            status: 'pending',
          })
          .select('id')
          .single()

        if (dbError || !uploadRecord) {
          errors.push(`${file.name}: Failed to create upload record`)
          console.error('DB insert error:', dbError)
          continue
        }

        uploadRecords.push({
          id: uploadRecord.id,
          file,
          storagePath,
          publicUrl,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        errors.push(`${file.name}: ${message}`)
      }
    }

    // Phase 2: Upload files to storage
    const completedUploads: UploadResult[] = []

    for (const record of uploadRecords) {
      try {
        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(record.storagePath, record.file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          errors.push(`${record.file.name}: ${uploadError.message}`)

          // Mark as failed in database
          await supabase.rpc('mark_image_upload_failed', {
            p_upload_id: record.id,
            p_error_message: uploadError.message,
          })
          continue
        }

        // Mark as completed in database
        const { error: completeError } = await supabase.rpc(
          'mark_image_upload_completed',
          {
            p_upload_id: record.id,
            p_property_id: propertyId,
          }
        )

        if (completeError) {
          errors.push(`${record.file.name}: Failed to mark upload complete`)
          console.error('Complete error:', completeError)

          // Try to delete from storage to maintain consistency
          await supabase.storage.from('property-images').remove([record.storagePath])

          // Mark as failed
          await supabase.rpc('mark_image_upload_failed', {
            p_upload_id: record.id,
            p_error_message: completeError.message,
          })
          continue
        }

        uploadedUrls.push(record.publicUrl)
        completedUploads.push({
          uploadId: record.id,
          url: record.publicUrl,
          storagePath: record.storagePath,
          fileName: record.file.name,
        })
        uploadsNeedingRollback.push({
          id: record.id,
          storagePath: record.storagePath,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        errors.push(`${record.file.name}: ${message}`)

        // Mark as failed in database
        await supabase.rpc('mark_image_upload_failed', {
          p_upload_id: record.id,
          p_error_message: message,
        })
      }
    }

    return NextResponse.json({
      urls: uploadedUrls,
      uploads: completedUploads,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error uploading images:', error)

    // Rollback: Mark any completed uploads as orphaned for cleanup
    if (uploadsNeedingRollback.length > 0) {
      try {
        const uploadIds = uploadsNeedingRollback.map((u) => u.id)
        await supabase.rpc('mark_orphaned_uploads', {
          p_property_id: propertyId,
          p_upload_ids: uploadIds,
        })
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError)
      }
    }

    // Sanitize error message - don't expose internal details
    return NextResponse.json(
      { error: 'Failed to upload images. Please try again.' },
      { status: 500 }
    )
  }
}

/**
 * Mark uploads as orphaned when property update fails
 * Call this from property update routes when image URLs fail to save
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { propertyId, uploadIds } = body

    if (!propertyId || !Array.isArray(uploadIds)) {
      return NextResponse.json(
        { error: 'Property ID and upload IDs required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify ownership
    const { data: property } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', propertyId)
      .single()

    if (!property || property.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Mark uploads as orphaned
    const { data: count, error } = await supabase.rpc('mark_orphaned_uploads', {
      p_property_id: propertyId,
      p_upload_ids: uploadIds,
    })

    if (error) {
      console.error('Error marking uploads as orphaned:', error)
      return NextResponse.json(
        { error: 'Failed to mark uploads as orphaned' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Uploads marked as orphaned',
      count,
    })
  } catch (error) {
    console.error('Error in PATCH:', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
