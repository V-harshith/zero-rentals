import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cron job to cleanup orphaned image files from storage
 * Should be called by a scheduler (Vercel Cron, GitHub Actions, etc.)
 *
 * Query params:
 * - secret: CRON_SECRET environment variable for authentication
 * - batchSize: Number of files to process per run (default: 50)
 */

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const batchSize = parseInt(searchParams.get('batchSize') || '50', 10)
    const supabase = await createClient()

    const results: {
      processed: number
      deletedFromStorage: number
      deletedRecords: number
      oldRecordsCleaned?: number
      errors: string[]
    } = {
      processed: 0,
      deletedFromStorage: 0,
      deletedRecords: 0,
      errors: [],
    }

    // Get orphaned uploads from database
    const { data: orphanedUploads, error: fetchError } = await supabase.rpc(
      'get_orphaned_uploads',
      { p_older_than_minutes: 30 }
    )

    if (fetchError) {
      console.error('Error fetching orphaned uploads:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch orphaned uploads' },
        { status: 500 }
      )
    }

    if (!orphanedUploads || orphanedUploads.length === 0) {
      return NextResponse.json({
        message: 'No orphaned uploads found',
        results,
      })
    }

    // Process in batches
    const uploadsToProcess = orphanedUploads.slice(0, batchSize)

    for (const upload of uploadsToProcess) {
      try {
        results.processed++

        // Delete from storage first
        const { error: storageError } = await supabase.storage
          .from('property-images')
          .remove([upload.storage_path])

        if (storageError) {
          // If file doesn't exist in storage, we can still delete the record
          if (!storageError.message?.includes('Not found')) {
            results.errors.push(
              `Storage delete failed for ${upload.id}: ${storageError.message}`
            )
            continue
          }
        }

        results.deletedFromStorage++

        // Delete the database record
        const { error: deleteError } = await supabase.rpc(
          'delete_upload_record',
          { p_upload_id: upload.id }
        )

        if (deleteError) {
          results.errors.push(
            `Record delete failed for ${upload.id}: ${deleteError.message}`
          )
          continue
        }

        results.deletedRecords++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push(`Failed to process ${upload.id}: ${message}`)
      }
    }

    // Also cleanup old completed records (keep for 30 days)
    try {
      const { data: cleanedCount, error: cleanupError } = await supabase.rpc(
        'cleanup_old_upload_records',
        { p_days_old: 30 }
      )

      if (cleanupError) {
        results.errors.push(`Cleanup old records failed: ${cleanupError.message}`)
      } else {
        results.oldRecordsCleaned = cleanedCount || 0
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push(`Cleanup old records error: ${message}`)
    }

    return NextResponse.json({
      message: 'Cleanup completed',
      results,
    })
  } catch (error) {
    console.error('Error in cleanup job:', error)
    return NextResponse.json({ error: 'Cleanup job failed' }, { status: 500 })
  }
}

// Also support POST for flexibility with cron services
export async function POST(request: NextRequest) {
  return GET(request)
}
