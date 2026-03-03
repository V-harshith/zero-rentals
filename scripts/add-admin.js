/**
 * Add New Admin User Script
 *
 * Usage:
 *   node scripts/add-admin.js <email> <password> <name>
 *
 * Example:
 *   node scripts/add-admin.js admin@company.com "SecurePass123!" "John Admin"
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable must be set
 */

const { createClient } = require('@supabase/supabase-js')

async function addAdmin(email, password, name, phone = '') {
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: Missing environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Validate inputs
  if (!email || !password || !name) {
    console.error('❌ Error: Missing required arguments')
    console.error('   Usage: node add-admin.js <email> <password> <name> [phone]')
    process.exit(1)
  }

  // Validate password strength
  const passwordErrors = []
  if (password.length < 8) passwordErrors.push('at least 8 characters')
  if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter')
  if (!/[a-z]/.test(password)) passwordErrors.push('one lowercase letter')
  if (!/[0-9]/.test(password)) passwordErrors.push('one number')
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) passwordErrors.push('one special character')

  if (passwordErrors.length > 0) {
    console.error('❌ Error: Password must contain:')
    passwordErrors.forEach(err => console.error(`   - ${err}`))
    process.exit(1)
  }

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log(`\n🔄 Creating admin user: ${email}...\n`)

  try {
    // Create user with Supabase Auth Admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: name,
        role: 'admin'
      }
    })

    if (authError) {
      throw new Error(`Auth error: ${authError.message}`)
    }

    const userId = authData.user.id

    // Update the public.users table to ensure role is set correctly
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .update({
        role: 'admin',
        name: name,
        phone: phone,
        verified: true,
        status: 'active',
        email_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (dbError) {
      console.warn('⚠️  Warning: Could not update user profile:', dbError.message)
      console.warn('   The user was created but profile may be incomplete.')
    }

    console.log('✅ Admin user created successfully!\n')
    console.log('   User ID:    ', userId)
    console.log('   Email:      ', email)
    console.log('   Name:       ', name)
    console.log('   Role:       ', 'admin')
    console.log('   Verified:   ', 'Yes')
    console.log('')
    console.log('   The user can now log in at:')
    console.log(`   ${supabaseUrl.replace('.supabase.co', '')}/login/admin`)
    console.log('')

  } catch (error) {
    console.error('❌ Failed to create admin user:')
    console.error(`   ${error.message}`)
    process.exit(1)
  }
}

// Parse command line arguments
const [,, email, password, name, phone] = process.argv

addAdmin(email, password, name, phone)
