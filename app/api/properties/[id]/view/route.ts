import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// POST /api/properties/[id]/view - Increment view count
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const supabase = await createClient()

        // Increment views using SQL to avoid race conditions
        const { data, error } = await supabase.rpc('increment_property_views', {
            property_id: id
        })

        if (error) {
            // If RPC doesn't exist, fallback to manual update
            // First get current views
            const { data: property } = await supabase
                .from('properties')
                .select('views')
                .eq('id', id)
                .single()

            const newViews = ((property?.views as number) || 0) + 1

            const { error: updateError } = await supabase
                .from('properties')
                .update({ views: newViews })
                .eq('id', id)

            if (updateError) throw updateError
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error incrementing view count:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

