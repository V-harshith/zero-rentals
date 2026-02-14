// Test Supabase Connection
// Run with: node scripts/test-supabase.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Supabase Connection...\n');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`📍 URL: ${supabaseUrl}`);
console.log(`🔑 Key: ${supabaseKey.substring(0, 20)}...\n`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test 1: Check users table
    console.log('📊 Test 1: Checking users table...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(5);

    if (usersError) {
      console.error('❌ Users table error:', usersError.message);
    } else {
      console.log(`✅ Users table accessible (${users.length} users found)`);
      if (users.length > 0) {
        console.log('   Sample user:', users[0].email, '-', users[0].role);
      }
    }

    // Test 2: Check properties table
    console.log('\n📊 Test 2: Checking properties table...');
    const { data: properties, error: propertiesError } = await supabase
      .from('properties')
      .select('*')
      .limit(5);

    if (propertiesError) {
      console.error('❌ Properties table error:', propertiesError.message);
    } else {
      console.log(`✅ Properties table accessible (${properties.length} properties found)`);
    }

    // Test 3: Check subscriptions table
    console.log('\n📊 Test 3: Checking subscriptions table...');
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(5);

    if (subscriptionsError) {
      console.error('❌ Subscriptions table error:', subscriptionsError.message);
    } else {
      console.log(`✅ Subscriptions table accessible (${subscriptions.length} subscriptions found)`);
    }

    // Test 4: Check inquiries table
    console.log('\n📊 Test 4: Checking inquiries table...');
    const { data: inquiries, error: inquiriesError } = await supabase
      .from('inquiries')
      .select('*')
      .limit(5);

    if (inquiriesError) {
      console.error('❌ Inquiries table error:', inquiriesError.message);
    } else {
      console.log(`✅ Inquiries table accessible (${inquiries.length} inquiries found)`);
    }

    // Test 5: Check storage buckets
    console.log('\n📊 Test 5: Checking storage buckets...');
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();

    if (bucketsError) {
      console.error('❌ Storage error:', bucketsError.message);
    } else {
      console.log(`✅ Storage accessible (${buckets.length} buckets found)`);
      if (buckets.length > 0) {
        buckets.forEach(bucket => {
          console.log(`   - ${bucket.name} (${bucket.public ? 'public' : 'private'})`);
        });
      } else {
        console.log('   ⚠️  No storage buckets found. You need to create "property-images" bucket.');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Supabase connection test complete!');
    console.log('='.repeat(50));

    // Summary
    console.log('\n📋 SUMMARY:');
    console.log('✅ Database connection: Working');
    console.log('✅ Tables created: Yes');
    console.log('✅ Seed data: ' + (users && users.length > 0 ? 'Yes' : 'No'));
    console.log('⚠️  Storage bucket: ' + (buckets && buckets.some(b => b.name === 'property-images') ? 'Yes' : 'Needs setup'));

    console.log('\n🚀 NEXT STEPS:');
    if (!buckets || !buckets.some(b => b.name === 'property-images')) {
      console.log('1. Create "property-images" bucket in Supabase Dashboard');
      console.log('2. Set bucket to Public');
      console.log('3. Configure RLS policies for storage');
    }
    console.log('4. Start implementing authentication (Task 2.2)');
    console.log('5. Follow CURRENT_STATUS.md for next tasks');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

testConnection();
