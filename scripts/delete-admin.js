/**
 * Delete User/Admin Script
 *
 * Usage:
 *   node scripts/delete-admin.js <email>
 *
 * Example:
 *   node scripts/delete-admin.js aniljangid121@gmail.com
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable must be set
 */

const { createClient } = require('@supabase/supabase-js')

async function deleteUser(email) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: Missing environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!email) {
    console.error('❌ Error: Email required')
    console.error('   Usage: node delete-admin.js <email>')
    process.exit(1)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  console.log(`\n🔄 Looking for user: ${email}...\n`)

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

    console.log('User found:')
    console.log('   User ID:  ', userData.id)
    console.log('   Email:    ', userData.email)
    console.log('   Name:     ', userData.name || 'N/A')
    console.log('   Role:     ', userData.role)
    console.log('')

    // Confirm deletion (skip in CI/non-interactive environments)
    if (process.stdin.isTTY) {
      const readline = require('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const answer = await new Promise((resolve) => {
        rl.question('Are you sure you want to delete this user? (yes/no): ', resolve)
      })
      rl.close()

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Deletion cancelled.')
        process.exit(0)
      }
    }

    // Delete using Admin API (this deletes from auth.users and cascades)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userData.id)

    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`)
    }

    console.log('')
    console.log('✅ User deleted successfully!')
    console.log('')
    console.log('   User ID:    ', userData.id)
    console.log('   Email:      ', email)
    console.log('   Deleted at: ', new Date().toISOString())
    console.log('')

  } catch (error) {
    console.error('❌ Failed to delete user:')
    console.error(`   ${error.message}`)
    process.exit(1)
  }
}

const [,, email] = process.argv
deleteUser(email)
