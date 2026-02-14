import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 60 requests per minute per admin
    const rateLimitKey = `admin:analytics:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 60, 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = await createClient()

    const [
      { count: totalProperties },
      { count: activeProperties },
      { count: pendingProperties },
      { count: totalUsers },
      { count: totalOwners },
      { count: totalTenants },
      { count: totalInquiries },
      { data: recentProperties }
    ] = await Promise.all([
      supabase.from('properties').select('*', { count: 'exact', head: true }),
      supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'owner'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'tenant'),
      supabase.from('inquiries').select('*', { count: 'exact', head: true }),
      supabase.from('properties').select('id, title, city, area, status, created_at, images').order('created_at', { ascending: false }).limit(10)
    ])

    const stats = {
      properties: {
        total: totalProperties || 0,
        active: activeProperties || 0,
        pending: pendingProperties || 0,
      },
      users: {
        total: totalUsers || 0,
        owners: totalOwners || 0,
        tenants: totalTenants || 0,
      },
      inquiries: {
        total: totalInquiries || 0,
      },
      recentProperties: recentProperties || [],
    }

    return NextResponse.json({ data: stats })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
