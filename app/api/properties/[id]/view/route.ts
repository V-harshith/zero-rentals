import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

// Generate a session ID from request fingerprint
function generateSessionId(req: NextRequest): string {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'
    // Simple hash of IP + user agent for session tracking
    const data = `${ip}:${userAgent}`
    let hash = 0
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return `sess_${Math.abs(hash).toString(36)}`
}

// Hash IP for privacy
function hashIp(ip: string): string {
    let hash = 0
    for (let i = 0; i < ip.length; i++) {
        const char = ip.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return `ip_${Math.abs(hash).toString(36)}`
}

// POST /api/properties/[id]/view - Track property view with abuse prevention
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const supabase = await createClient()

        // Get current user if authenticated
        const { data: { user } } = await supabase.auth.getUser()

        // Get property owner to prevent owner self-views
        const { data: property } = await supabase
            .from('properties')
            .select('owner_id')
            .eq('id', id)
            .single()

        // Don't count views from the owner
        if (user && property?.owner_id === user.id) {
            return NextResponse.json({ success: true, tracked: false, reason: 'owner_view' })
        }

        // Generate session ID for anonymous tracking
        const sessionId = generateSessionId(request)
        const ipHash = hashIp(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '')
        const userAgent = request.headers.get('user-agent') || ''
        const referrer = request.headers.get('referer') || ''

        // Determine view source from referrer
        let viewSource = 'direct'
        if (referrer.includes('/search')) viewSource = 'search'
        else if (referrer.includes('/featured')) viewSource = 'featured'
        else if (referrer.includes('/pg') || referrer.includes('/co-living') || referrer.includes('/rent')) viewSource = 'category'

        // Use the secure tracking function
        const { data: result, error } = await supabase.rpc('track_property_view', {
            p_property_id: id,
            p_session_id: sessionId,
            p_user_id: user?.id || null,
            p_ip_hash: ipHash,
            p_user_agent: userAgent,
            p_referrer: referrer,
            p_view_source: viewSource
        })

        if (error) {
            console.error('View tracking error:', error)
            // Don't fallback to simple increment - fail silently to prevent abuse
            return NextResponse.json({ success: true, tracked: false, error: 'tracking_failed' })
        }

        return NextResponse.json({
            success: true,
            tracked: result?.is_unique ?? true,
            ...result
        })
    } catch (error: any) {
        console.error('Error tracking view:', error)
        // Don't fail the request - view tracking should be invisible to users
        return NextResponse.json({ success: true, tracked: false, error: 'tracking_failed' })
    }
}

// GET /api/properties/[id]/view - Get view analytics (for owners/admins)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const supabase = await createClient()

        // Check authentication
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user role
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        // Check if user is owner of this property or admin
        const { data: property } = await supabase
            .from('properties')
            .select('owner_id')
            .eq('id', id)
            .single()

        if (userData?.role !== 'admin' && property?.owner_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Get analytics
        const { data: analytics, error } = await supabase.rpc('get_property_analytics', {
            p_property_id: id,
            p_days: 30
        })

        if (error) {
            console.error('Analytics error:', error)
            return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
        }

        return NextResponse.json(analytics)
    } catch (error: any) {
        console.error('Error fetching view analytics:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
