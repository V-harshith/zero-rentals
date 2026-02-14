import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
    try {
        // Auth check
        const supabase = await createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .maybeSingle()

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        // Get all pending staged images for this admin
        const { data: stagedImages, error: fetchError } = await supabaseAdmin
            .from('image_staging')
            .select('storage_path')
            .eq('admin_id', authUser.id)
            .eq('status', 'pending')

        if (fetchError) {
            console.error('Fetch staged images error:', fetchError)
            throw new Error('Failed to fetch staged images')
        }

        // Delete from storage
        if (stagedImages && stagedImages.length > 0) {
            const paths = stagedImages.map(img => img.storage_path)
            const { error: storageError } = await supabaseAdmin.storage
                .from('property-images-staging')
                .remove(paths)

            if (storageError) {
                console.error('Error deleting from storage:', storageError)
                // Continue anyway - try to delete from DB
            }
        }

        // Delete from database
        const { error: deleteError } = await supabaseAdmin
            .from('image_staging')
            .delete()
            .eq('admin_id', authUser.id)
            .eq('status', 'pending')

        if (deleteError) {
            console.error('Delete staged images error:', deleteError)
            throw new Error('Failed to delete staged images')
        }

        return NextResponse.json({
            success: true,
            cleared: stagedImages?.length || 0
        })
    } catch (error) {
        console.error('Clear staged images error:', error)
        const errorMsg = error instanceof Error ? error.message : 'Failed to clear staged images'
        return NextResponse.json(
            { error: 'Failed to clear staged images' },
            { status: 500 }
        )
    }
}
