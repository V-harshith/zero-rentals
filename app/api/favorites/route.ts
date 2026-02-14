import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

// Helper function to check if user is a tenant
async function verifyTenantRole(supabase: any, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile) return false
  return profile.role === 'tenant'
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request, 'favorites_get', 30, 60)
    if (rateLimitResult.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: rateLimitResult.headers }
      )
    }

    const supabase = await createClient()

    // Get user from server-side session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a tenant
    const isTenant = await verifyTenantRole(supabase, user.id)
    if (!isTenant) {
      return NextResponse.json(
        { error: 'Forbidden - Tenant access required' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('favorites')
      .select(`
        id,
        property_id,
        created_at,
        properties (*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching favorites:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request, 'favorites_post', 20, 60)
    if (rateLimitResult.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: rateLimitResult.headers }
      )
    }

    const supabase = await createClient()

    // Get user from server-side session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a tenant
    const isTenant = await verifyTenantRole(supabase, user.id)
    if (!isTenant) {
      return NextResponse.json(
        { error: 'Forbidden - Tenant access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { property_id } = body

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('favorites')
      .insert([{ user_id: user.id, property_id }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already in favorites' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding favorite:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
