import { NextResponse } from 'next/server'
import { setCsrfToken } from '@/lib/csrf-server'

export async function GET() {
  try {
    const csrfToken = await setCsrfToken()
    return NextResponse.json({ csrfToken })
  } catch (error) {
    console.error('CSRF token generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    )
  }
}
