/**
 * Promote Existing User to Admin
 *
 * Usage:
 *   node scripts/promote-to-admin.js <email>
 *
 * Example:
 *   node scripts/promote-to-admin.js aniljangid121@gmail.com
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable must be set
 */

const { createClient } = require('@supabase/supabase-js')

async function promoteToAdmin(email) {
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: Missing environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!email) {
    console.error('❌ Error: Email required')
    console.error('   Usage: node promote-to-admin.js <email>')
    process.exit(1)
  }

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  console.log(`\n🔄 Promoting user to admin: ${email}...\n`)

  try {
    // Find user by email
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('email', email)
      .single()

    if (userError || !userData) {
      throw new Error('User not found in database')
    }

    if (userData.role === 'admin') {
      console.log('ℹ️  User is already an admin!\n')
      return
    }

    // Update role to admin
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        role: 'admin',
        verified: true,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', userData.id)

    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`)
    }

    console.log('✅ User promoted to admin successfully!\n')
    console.log('   User ID:  ', userData.id)
    console.log('   Email:    ', email)
    console.log('   Name:     ', userData.name)
    console.log('   Old Role: ', userData.role)
    console.log('   New Role: ', 'admin')
    console.log('')
    console.log('   The user should log out and log back in for changes to take effect.')
    console.log('   They can now access: /dashboard/admin')
    console.log('')

  } catch (error) {
    console.error('❌ Failed to promote user:')
    console.error(`   ${error.message}`)
    process.exit(1)
  }
}

// Run with email from command line
const [,, email] = process.argv
promoteToAdmin(email)
