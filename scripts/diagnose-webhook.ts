// Diagnostic script for Razorpay webhook issues
// Run with: npx ts-node scripts/diagnose-webhook.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function diagnose() {
  console.log('=== Razorpay Webhook Diagnostic ===\n')

  // 1. Check environment variables
  console.log('1. Environment Variables:')
  console.log('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing')
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing')
  console.log('   RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing')
  console.log('   RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing')
  console.log('   RAZORPAY_WEBHOOK_SECRET:', process.env.RAZORPAY_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing')
  console.log()

  // 2. Check database tables
  console.log('2. Database Tables:')
  const { count: paymentLogsCount } = await supabase.from('payment_logs').select('*', { count: 'exact', head: true })
  const { count: paymentsCount } = await supabase.from('payments').select('*', { count: 'exact', head: true })
  const { count: subscriptionsCount } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true })

  console.log('   payment_logs:', paymentLogsCount || 0, 'records')
  console.log('   payments:', paymentsCount || 0, 'records')
  console.log('   subscriptions:', subscriptionsCount || 0, 'records')
  console.log()

  // 3. Check recent subscriptions
  console.log('3. Recent Subscriptions:')
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (subscriptions && subscriptions.length > 0) {
    subscriptions.forEach((sub: any) => {
      console.log(`   - ${sub.plan_name} (${sub.status}) - Created: ${sub.created_at}`)
    })
  } else {
    console.log('   No subscriptions found')
  }
  console.log()

  // 4. Check if webhook_events table exists
  console.log('4. Webhook Events Table:')
  try {
    const { count } = await supabase.from('webhook_events').select('*', { count: 'exact', head: true })
    console.log('   ✅ Table exists,', count || 0, 'records')

    // Show recent events
    const { data: events } = await supabase
      .from('webhook_events')
      .select('event_type, order_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    if (events && events.length > 0) {
      console.log('   Recent events:')
      events.forEach((event: any) => {
        console.log(`     - ${event.event_type}: ${event.status} (${event.created_at})`)
      })
    }
  } catch (e) {
    console.log('   ❌ Table does not exist')
    console.log('   Creating webhook_events table...')
  }
  console.log()

  // 5. Check for errors in Supabase logs (last 24 hours)
  console.log('5. Recommendations:')
  console.log('   - Check Razorpay Dashboard → Settings → Webhooks')
  console.log('   - Webhook URL should be: https://YOUR_DOMAIN/api/webhooks/razorpay')
  console.log('   - Check Vercel/Server logs for webhook errors')
  console.log('   - Verify RAZORPAY_WEBHOOK_SECRET matches Razorpay dashboard')
  console.log()

  console.log('=== End Diagnostic ===')
}

diagnose().catch(console.error)
