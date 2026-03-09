/**
 * Diagnostic script to check plan tier sorting
 *
 * Usage:
 *   node scripts/check-tier-sorting.js
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable must be set
 */

const { createClient } = require('@supabase/supabase-js')

async function checkTierSorting() {
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Error: Missing environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    console.error('   Run: source .env.local && node scripts/check-tier-sorting.js')
    process.exit(1)
  }

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('\n🔍 Checking Plan Tier Sorting Issues...\n')
  console.log('=' .repeat(60))

  // 1. Check active subscriptions
  console.log('\n📋 STEP 1: Checking Active Subscriptions')
  console.log('-'.repeat(40))

  const today = new Date().toISOString()
  const { data: subscriptions, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, plan_name, status, end_date, created_at')
    .eq('status', 'active')
    .gt('end_date', today)
    .order('created_at', { ascending: false })

  if (subError) {
    console.error('❌ Error fetching subscriptions:', subError)
    process.exit(1)
  }

  console.log(`✅ Found ${subscriptions?.length || 0} active subscriptions`)

  if (subscriptions?.length > 0) {
    console.log('\n   Sample subscriptions:')
    subscriptions.slice(0, 5).forEach((sub, i) => {
      console.log(`   ${i + 1}. User: ${sub.user_id?.substring(0, 8)}... | Plan: "${sub.plan_name}" | Ends: ${new Date(sub.end_date).toLocaleDateString()}`)
    })
  } else {
    console.log('   ⚠️  No active subscriptions found!')
    console.log('   This is why paid properties are not appearing on top.')
  }

  // 2. Check plan_name format
  console.log('\n📋 STEP 2: Checking Plan Name Format')
  console.log('-'.repeat(40))

  const PLAN_TIER_RANK = {
    'ELITE': 5,
    'PLATINUM': 4,
    'GOLD': 3,
    'SILVER': 2,
    'FREE': 1,
  }

  const { data: allSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_name, status')
    .limit(100)

  const planFormats = new Set()
  allSubs?.forEach(s => {
    if (s.plan_name) {
      planFormats.add(s.plan_name)
    }
  })

  console.log(`   Found ${planFormats.size} unique plan_name formats:`)
  planFormats.forEach(format => {
    const upperFormat = format.toUpperCase()
    const rank = PLAN_TIER_RANK[upperFormat]
    const isValid = rank !== undefined
    console.log(`   - "${format}" → ${isValid ? `✅ Rank: ${rank}` : '❌ NO MATCH (will default to FREE)'}`)
  })

  // 3. Check properties and their featured status
  console.log('\n📋 STEP 3: Checking Properties')
  console.log('-'.repeat(40))

  const { data: properties, error: propError } = await supabaseAdmin
    .from('properties')
    .select('id, owner_id, featured, status, created_at')
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (propError) {
    console.error('❌ Error fetching properties:', propError)
    process.exit(1)
  }

  console.log(`✅ Found ${properties?.length || 0} active/pending properties`)

  // 4. Build tier map and check sorting
  console.log('\n📋 STEP 4: Simulating Tier Sorting')
  console.log('-'.repeat(40))

  const ownerTierMap = new Map()
  subscriptions?.forEach(s => {
    const normalizedName = (s.plan_name || 'FREE').toUpperCase().trim()
    const rank = PLAN_TIER_RANK[normalizedName] ?? 1
    const existingRank = ownerTierMap.get(s.user_id)
    if (!existingRank || rank > existingRank) {
      ownerTierMap.set(s.user_id, rank)
    }
  })

  console.log(`   Tier map has ${ownerTierMap.size} entries`)

  // Show which owners have paid plans
  if (ownerTierMap.size > 0) {
    console.log('\n   Owners with paid plans:')
    const paidOwners = Array.from(ownerTierMap.entries())
      .filter(([_, rank]) => rank > 1)
      .map(([id, rank]) => {
        const rankName = Object.entries(PLAN_TIER_RANK).find(([_, r]) => r === rank)?.[0] || 'UNKNOWN'
        return { id: id.substring(0, 8), rank, rankName }
      })

    if (paidOwners.length > 0) {
      paidOwners.forEach(o => {
        console.log(`   - ${o.id}... → ${o.rankName} (rank: ${o.rank})`)
      })
    } else {
      console.log('   ⚠️  No owners with paid plans found in tier map!')
    }
  }

  // 5. Check if paid properties have featured=true
  console.log('\n📋 STEP 5: Checking Featured Status for Paid Owners')
  console.log('-'.repeat(40))

  const paidOwnerIds = Array.from(ownerTierMap.entries())
    .filter(([_, rank]) => rank > 1)
    .map(([id]) => id)

  if (paidOwnerIds.length > 0) {
    const { data: paidProperties } = await supabaseAdmin
      .from('properties')
      .select('id, owner_id, featured, status')
      .in('owner_id', paidOwnerIds)
      .in('status', ['active', 'pending'])

    const featured = paidProperties?.filter(p => p.featured === true) || []
    const notFeatured = paidProperties?.filter(p => p.featured !== true) || []

    console.log(`   Paid owners have ${paidProperties?.length || 0} properties:`)
    console.log(`   - Featured: ${featured.length}`)
    console.log(`   - NOT Featured: ${notFeatured.length}`)

    if (notFeatured.length > 0) {
      console.log('\n   ⚠️  Properties that should be featured but are not:')
      notFeatured.slice(0, 5).forEach(p => {
        console.log(`   - Property: ${p.id.substring(0, 8)}... | Owner: ${p.owner_id?.substring(0, 8)}...`)
      })
    }
  } else {
    console.log('   ⚠️  No paid owners to check')
  }

  // 6. Summary and recommendations
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))

  const issues = []

  if (!subscriptions?.length) {
    issues.push('No active subscriptions found in database')
  }

  if (paidOwnerIds.length === 0) {
    issues.push('No owners with paid plans found')
  }

  const unpaidPaidProperties = paidOwnerIds.length > 0 ?
    (await supabaseAdmin
      .from('properties')
      .select('id')
      .in('owner_id', paidOwnerIds)
      .in('status', ['active', 'pending'])
      .neq('featured', true)).data?.length || 0 : 0

  if (unpaidPaidProperties > 0) {
    issues.push(`${unpaidPaidProperties} properties of paid owners are not featured`)
  }

  if (issues.length === 0) {
    console.log('✅ Everything looks good!')
    console.log('   If paid properties are still not appearing on top, the issue might be:')
    console.log('   - Browser caching (clear cache and hard refresh)')
    console.log('   - ISR cache on home page (wait 60 seconds or redeploy)')
  } else {
    console.log('❌ Issues found:')
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`)
    })

    console.log('\n🔧 RECOMMENDED FIXES:')

    if (!subscriptions?.length) {
      console.log('   1. Check if subscriptions are being created correctly after payment')
      console.log('      - Verify webhook is receiving payment events')
      console.log('      - Check payment_logs table for payment status')
    }

    if (unpaidPaidProperties > 0) {
      console.log('   2. Run this SQL to feature properties for paid owners:')
      console.log('')
      console.log('   -- Auto-feature properties for paid plan owners')
      console.log(`   UPDATE properties p
   SET featured = true
   FROM subscriptions s
   WHERE p.owner_id = s.user_id
     AND s.status = 'active'
     AND s.end_date > NOW()
     AND s.plan_name ILIKE ANY(ARRAY['%silver%', '%gold%', '%platinum%', '%elite%'])
     AND p.status IN ('active', 'pending')
     AND p.featured = false;`)
    }
  }

  console.log('\n')
}

checkTierSorting().catch(console.error)
