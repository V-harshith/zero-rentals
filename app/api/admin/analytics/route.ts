import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// GET /api/admin/analytics - Get platform-wide analytics
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify admin role
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (userData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Get platform analytics
        const { data: analytics, error } = await supabase.rpc('get_platform_analytics', {
            p_days: 30
        })

        if (error) {
            console.error('Platform analytics error:', error)
            return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
        }

        return NextResponse.json(analytics)
    } catch (error: any) {
        console.error('Error fetching admin analytics:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
