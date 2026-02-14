import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const stats = {
      total: data.length,
      active: data.filter(p => p.status === 'active').length,
      pending: data.filter(p => p.status === 'pending').length,
      rejected: data.filter(p => p.status === 'rejected').length,
      totalViews: data.reduce((sum, p) => sum + (p.views || 0), 0),
    }

    return NextResponse.json({ data, stats })
  } catch (error: any) {
    console.error('Error fetching owner properties:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
