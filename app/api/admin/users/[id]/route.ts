import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (userError) throw userError

    let additionalData = {}

    if (userData.role === 'owner') {
      // Run queries in parallel for better performance
      const [propertiesResult, inquiriesResult] = await Promise.all([
        supabase
          .from('properties')
          .select('id, title, status, created_at, private_room_price, images')
          .eq('owner_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('inquiries')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', id)
      ])

      additionalData = {
        properties: propertiesResult.data || [],
        inquiriesCount: inquiriesResult.count || 0,
      }
    } else if (userData.role === 'tenant') {
      // Run queries in parallel for better performance
      const [inquiriesResult, favoritesResult] = await Promise.all([
        supabase
          .from('inquiries')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', id),
        supabase
          .from('favorites')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', id)
      ])

      additionalData = {
        inquiriesCount: inquiriesResult.count || 0,
        favoritesCount: favoritesResult.count || 0,
      }
    }

    return NextResponse.json({ data: { ...userData, ...additionalData } })
  } catch (error: any) {
    console.error('Error fetching user details:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

