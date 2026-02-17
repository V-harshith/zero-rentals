import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // CSRF Protection
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: csrfCheck.error || 'Invalid request' }, { status: 403 })
    }

    // Rate limiting: 30 verifications per hour per admin
    const rateLimitKey = `admin:user:verify:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'}`
    const rateLimitResult = await rateLimit(rateLimitKey, 30, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const { id } = await params

    const supabase = await createClient()

    // Check authentication
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: adminUser, error: adminCheckError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (adminCheckError || adminUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { verified = true } = body

    // Update user verification status
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        verified,
        email_verified_at: verified ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select('id, name, email, verified')
      .single()

    if (updateError) {
      console.error('Error verifying user:', updateError)
      return NextResponse.json({ error: 'Failed to verify user' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `User ${verified ? 'verified' : 'unverified'} successfully`,
      user: updatedUser
    })
  } catch (error: any) {
    console.error('Verify user error:', error)
    return NextResponse.json(
      { error: 'Failed to verify user' },
      { status: 500 }
    )
  }
}
