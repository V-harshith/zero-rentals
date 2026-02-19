import { createClient, SupabaseClient } from '@supabase/supabase-js'

let adminClientInstance: SupabaseClient | null = null

/**
 * Validates environment variables and creates the admin client.
 * Uses lazy initialization to avoid build-time errors when env vars aren't available.
 */
function getAdminClient(): SupabaseClient {
    if (adminClientInstance) {
        return adminClientInstance
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
        throw new Error(
            '[supabase-admin] Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL\n' +
            'This is a critical configuration error. Please ensure the Supabase URL is configured.'
        )
    }

    if (!supabaseServiceKey) {
        throw new Error(
            '[supabase-admin] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY\n' +
            'This is a critical configuration error. The service role key must be configured for admin operations.'
        )
    }

    // Validate that the service key is not a demo/placeholder key
    const isPlaceholderKey =
        supabaseServiceKey.includes('demo') ||
        supabaseServiceKey.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1v') ||
        supabaseServiceKey.length < 50

    if (isPlaceholderKey) {
        throw new Error(
            '[supabase-admin] Invalid service role key detected.\n' +
            'The configured SUPABASE_SERVICE_ROLE_KEY appears to be a placeholder or demo key.\n' +
            'Please configure a valid service role key from your Supabase project settings.'
        )
    }

    adminClientInstance = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    return adminClientInstance
}

/**
 * Supabase admin client with service role privileges.
 * LAZY-INITIALIZED: Environment variables are validated on first use, not at import time.
 * This prevents build-time errors when env vars aren't available during static generation.
 *
 * ⚠️ WARNING: This client has full administrative access. NEVER use on the client side.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getAdminClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (client as any)[prop]
    }
})
