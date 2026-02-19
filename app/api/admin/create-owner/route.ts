import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { csrfProtection } from '@/lib/csrf-server'
import { rateLimit } from '@/lib/rate-limit'

const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function POST(request: NextRequest) {
  try {
    // CSRF check
    const csrfCheck = await csrfProtection(request)
    if (!csrfCheck.valid) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
    }

    // Get server-side Supabase client (handles cookies properly)
    const supabase = await createClient()

    // Verify admin using server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[ADMIN API] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user profile to get role
    const { data: userData, error: profileError } = await supabase
      .from('users')
      .select('role, name, email')
      .eq('id', user.id)
      .single()

    if (profileError || !userData || userData.role !== 'admin') {
      console.error('[ADMIN API] Not admin:', profileError, userData)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit admin owner creation (20 per hour per admin)
    const rateLimitKey = `admin:create-owner:${user.id}`
    const rateLimitResult = await rateLimit(rateLimitKey, 20, 60 * 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Parse body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { email, password, name, phone } = body

    // Validate inputs
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Check if email exists
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json(
        { error: `An account with email ${email} already exists.` },
        { status: 409 }
      )
    }

    // Create user with admin API (bypasses public API rate limits)
    const { data: authData, error: createError } = await adminSupabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: false,
      user_metadata: { name, role: 'owner', phone: phone || null }
    })

    if (createError) {
      console.error('Admin create user error:', createError)
      return NextResponse.json(
        { error: `Failed to create owner account: ${createError.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create owner account - no user returned' },
        { status: 500 }
      )
    }

    // Insert into users table
    const { error: userError } = await adminSupabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: email.toLowerCase(),
        name,
        phone: phone || null,
        role: 'owner',
        verified: false
      })

    if (userError) {
      // Rollback auth user
      await adminSupabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { error: `Failed to create owner profile: ${userError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      message: 'Owner account created successfully'
    })

  } catch (error: any) {
    console.error('Create owner API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
