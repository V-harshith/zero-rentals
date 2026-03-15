import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { csrfProtection } from '@/lib/csrf-server'

/**
 * One-time fix: Set featured=true for all properties owned by users with active paid subscriptions
 *
 * Paid plans that include featured badge: Silver, Gold, Platinum, Elite
 *
 * GET /api/admin/fix-featured-properties
 * - Preview mode: Shows what would be updated without making changes
 *
 * POST /api/admin/fix-featured-properties
 * - Execute mode: Actually updates the properties
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const today = new Date().toISOString()

    // Get all users with active paid subscriptions
    const { data: paidSubscribers, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)
      .in('plan_name', ['Silver', 'Gold', 'Platinum', 'Elite'])

    if (subError) {
      return NextResponse.json({ error: 'Failed to fetch subscriptions', details: subError }, { status: 500 })
    }

    if (!paidSubscribers || paidSubscribers.length === 0) {
      return NextResponse.json({
        message: 'No active paid subscriptions found',
        preview: true,
        wouldUpdate: 0
      })
    }

    // Get unique user IDs
    const paidUserIds = [...new Set(paidSubscribers.map(s => s.user_id))]

    // Get properties that should be featured but aren't
    const { data: propertiesToFeature, error: propError } = await supabaseAdmin
      .from('properties')
      .select('id, title, owner_id, featured, status')
      .in('owner_id', paidUserIds)
      .in('status', ['active', 'pending'])
      .eq('featured', false)

    if (propError) {
      return NextResponse.json({ error: 'Failed to fetch properties', details: propError }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Preview mode - no changes made',
      preview: true,
      paidSubscribers: paidSubscribers.length,
      propertiesToFeature: propertiesToFeature?.length || 0,
      details: propertiesToFeature?.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status
      }))
    })

  } catch (error) {
    console.error('Error in fix-featured-properties preview:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Verify admin authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const today = new Date().toISOString()

    // Get all users with active paid subscriptions
    const { data: paidSubscribers, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan_name')
      .eq('status', 'active')
      .gt('end_date', today)
      .in('plan_name', ['Silver', 'Gold', 'Platinum', 'Elite'])

    if (subError) {
      return NextResponse.json({ error: 'Failed to fetch subscriptions', details: subError }, { status: 500 })
    }

    if (!paidSubscribers || paidSubscribers.length === 0) {
      return NextResponse.json({
        message: 'No active paid subscriptions found',
        updated: 0
      })
    }

    // Get unique user IDs
    const paidUserIds = [...new Set(paidSubscribers.map(s => s.user_id))]

    // Update properties that should be featured
    const { data: updatedProperties, error: updateError, count } = await supabaseAdmin
      .from('properties')
      .update({ featured: true })
      .in('owner_id', paidUserIds)
      .in('status', ['active', 'pending'])
      .eq('featured', false)
      .select('id, title')

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update properties', details: updateError }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Successfully updated featured properties',
      preview: false,
      paidSubscribers: paidSubscribers.length,
      updated: updatedProperties?.length || count || 0,
      details: updatedProperties
    })

  } catch (error) {
    console.error('Error in fix-featured-properties:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
