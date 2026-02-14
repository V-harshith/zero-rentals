import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 30 user status changes per hour per admin
    const rateLimitKey = `admin:user:status:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 30, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const { id } = await params
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('users')
      .update({ status: 'active' })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to activate user' }, { status: 500 })
  }
}

