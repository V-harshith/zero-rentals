import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const propertyId = formData.get('propertyId') as string

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 images allowed' }, { status: 400 })
    }

    const supabase = await createClient()

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

    for (const file of files) {
      try {
        if (!file.type.startsWith('image/')) {
          errors.push(`${file.name}: Not an image file`)
          continue
        }

        if (file.size > 5 * 1024 * 1024) {
          errors.push(`${file.name}: File too large (max 5MB)`)
          continue
        }

        const fileExt = file.name.split('.').pop()
        const fileName = `${propertyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          errors.push(`${file.name}: ${uploadError.message}`)
          continue
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('property-images').getPublicUrl(fileName)

        uploadedUrls.push(publicUrl)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        errors.push(`${file.name}: ${message}`)
      }
    }

    return NextResponse.json({
      urls: uploadedUrls,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    // Sanitize error message - don't expose internal details
    return NextResponse.json(
      { error: 'Failed to upload images. Please try again.' },
      { status: 500 }
    )
  }
}
