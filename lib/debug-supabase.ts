/**
 * Production Debugging Utility
 * Add this to your production site to diagnose issues
 * 
 * Usage: Open browser console and run: window.debugSupabase()
 */

// Add to window object for easy access in production
if (typeof window !== 'undefined') {
    (window as any).debugSupabase = async function () {
        console.log('=== SUPABASE DEBUG INFO ===')

        // 1. Check environment variables
        console.log('1. Environment Variables:')
        console.log('   SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING')
        console.log('   ANON_KEY exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

        // 2. Check if Supabase client is initialized
        try {
            const { createClient } = await import('@supabase/supabase-js')
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            )
            console.log('2. Supabase Client: ✅ Initialized')

            // 3. Test auth session
            console.log('3. Testing Auth Session...')
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) {
                console.error('   Session Error:', sessionError)
            } else {
                console.log('   Session:', session ? '✅ Active' : '❌ No session')
                if (session) {
                    console.log('   User ID:', session.user.id)
                    console.log('   Email:', session.user.email)
                }
            }

            // 4. Test database query
            console.log('4. Testing Database Query...')
            const { data, error, count } = await supabase
                .from('properties')
                .select('id', { count: 'exact' })
                .limit(1)

            if (error) {
                console.error('   Query Error:', error)
            } else {
                console.log('   Query Result: ✅ Success')
                console.log('   Total Properties:', count)
                console.log('   Sample Data:', data)
            }

            // 5. Test user profile query
            if (session) {
                console.log('5. Testing User Profile Query...')
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single()

                if (userError) {
                    console.error('   User Query Error:', userError)
                } else {
                    console.log('   User Profile: ✅ Found')
                    console.log('   Role:', userData?.role)
                    console.log('   Name:', userData?.name)
                }
            }

            // 6. Check network connectivity
            console.log('6. Network Test...')
            try {
                const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/')
                console.log('   Supabase Reachable:', response.ok ? '✅ Yes' : '❌ No')
                console.log('   Status:', response.status)
            } catch (netError) {
                console.error('   Network Error:', netError)
            }

        } catch (error) {
            console.error('Fatal Error:', error)
        }

        console.log('=== END DEBUG INFO ===')
    }

    console.log('🔧 Debug utility loaded. Run window.debugSupabase() to diagnose issues.')
}

export { }
