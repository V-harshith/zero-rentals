#!/usr/bin/env tsx
/**
 * Analytics Verification Script
 *
 * Verifies data consistency between properties.views and property_views table.
 * Run this script periodically to ensure view counts are accurate.
 *
 * Usage:
 *   npx tsx scripts/verify-analytics.ts
 *   npx tsx scripts/verify-analytics.ts --fix  # Auto-fix discrepancies
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase environment variables')
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

interface VerificationResult {
    propertyId: string
    title: string
    cachedViews: number
    actualViews: number
    difference: number
}

interface SummaryStats {
    totalProperties: number
    propertiesWithViews: number
    totalViewRecords: number
    botViewsFiltered: number
    suspiciousViews: number
    discrepanciesFound: number
}

async function verifyAnalytics(autoFix = false): Promise<void> {
    console.log('🔍 Verifying property analytics...\n')

    try {
        // Get summary statistics
        const { data: summary, error: summaryError } = await supabase
            .from('property_views_summary')
            .select('*')

        if (summaryError) {
            throw new Error(`Failed to fetch summary: ${summaryError.message}`)
        }

        const stats: SummaryStats = {
            totalProperties: summary?.length || 0,
            propertiesWithViews: summary?.filter((s: any) => s.total_view_records > 0).length || 0,
            totalViewRecords: summary?.reduce((acc: number, s: any) => acc + (s.total_view_records || 0), 0) || 0,
            botViewsFiltered: summary?.reduce((acc: number, s: any) => acc + (s.bot_views || 0), 0) || 0,
            suspiciousViews: summary?.reduce((acc: number, s: any) => acc + (s.suspicious_views || 0), 0) || 0,
            discrepanciesFound: 0
        }

        // Find discrepancies
        const discrepancies: VerificationResult[] = []

        for (const row of summary || []) {
            if (row.cached_views !== row.actual_unique_views) {
                discrepancies.push({
                    propertyId: row.property_id,
                    title: row.property_title,
                    cachedViews: row.cached_views || 0,
                    actualViews: row.actual_unique_views || 0,
                    difference: (row.actual_unique_views || 0) - (row.cached_views || 0)
                })
            }
        }

        stats.discrepanciesFound = discrepancies.length

        // Print summary
        console.log('📊 Summary Statistics')
        console.log('=====================')
        console.log(`Total Properties:        ${stats.totalProperties.toLocaleString()}`)
        console.log(`Properties with Views:   ${stats.propertiesWithViews.toLocaleString()}`)
        console.log(`Total View Records:      ${stats.totalViewRecords.toLocaleString()}`)
        console.log(`Bot Views Filtered:      ${stats.botViewsFiltered.toLocaleString()}`)
        console.log(`Suspicious Views:        ${stats.suspiciousViews.toLocaleString()}`)
        console.log(`Discrepancies Found:     ${stats.discrepanciesFound.toLocaleString()}`)
        console.log()

        // Print discrepancies
        if (discrepancies.length > 0) {
            console.log('⚠️  View Count Discrepancies')
            console.log('============================')
            console.log('Property ID                          | Cached | Actual | Diff | Title')
            console.log('-'.repeat(100))

            for (const d of discrepancies.slice(0, 20)) {
                const title = d.title.length > 30 ? d.title.substring(0, 27) + '...' : d.title
                console.log(
                    `${d.propertyId} | ${String(d.cachedViews).padStart(6)} | ${String(d.actualViews).padStart(6)} | ${String(d.difference).padStart(4)} | ${title}`
                )
            }

            if (discrepancies.length > 20) {
                console.log(`... and ${discrepancies.length - 20} more`)
            }
            console.log()

            // Auto-fix if requested
            if (autoFix) {
                console.log('🔧 Auto-fixing discrepancies...')
                const { data: fixed, error: fixError } = await supabase.rpc('recalculate_property_views')

                if (fixError) {
                    console.error(`❌ Failed to fix discrepancies: ${fixError.message}`)
                } else {
                    const fixedCount = (fixed as any[])?.length || 0
                    console.log(`✅ Fixed ${fixedCount} properties`)

                    for (const row of (fixed as any[]) || []) {
                        console.log(`   ${row.property_id}: ${row.old_views} → ${row.new_views}`)
                    }
                }
            } else {
                console.log('💡 Run with --fix to auto-correct discrepancies')
            }
        } else {
            console.log('✅ All view counts are consistent!')
        }

        // Check for orphaned view records
        console.log('\n🔍 Checking for orphaned view records...')
        const { data: orphaned, error: orphanError } = await supabase
            .from('property_views')
            .select('id, property_id')
            .not('property_id', 'in', (
                supabase.from('properties').select('id')
            ))
            .limit(10)

        if (orphanError) {
            console.log(`   ⚠️  Could not check for orphans: ${orphanError.message}`)
        } else if (orphaned && orphaned.length > 0) {
            console.log(`   ⚠️  Found ${orphaned.length} orphaned view records (property no longer exists)`)
            console.log(`   💡 Run cleanup to remove: DELETE FROM property_views WHERE property_id NOT IN (SELECT id FROM properties)`)
        } else {
            console.log('   ✅ No orphaned view records found')
        }

        // Check recent view activity
        console.log('\n📈 Recent View Activity (Last 24 Hours)')
        console.log('=======================================')
        const { data: recent, error: recentError } = await supabase
            .from('property_views')
            .select('is_unique_view, is_bot, is_suspicious')
            .gte('view_timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

        if (recentError) {
            console.log(`   ⚠️  Could not fetch recent activity: ${recentError.message}`)
        } else {
            const unique = recent?.filter((r: any) => r.is_unique_view && !r.is_bot).length || 0
            const total = recent?.length || 0
            const bots = recent?.filter((r: any) => r.is_bot).length || 0
            const suspicious = recent?.filter((r: any) => r.is_suspicious).length || 0

            console.log(`   Total Views:    ${total.toLocaleString()}`)
            console.log(`   Unique Views:   ${unique.toLocaleString()}`)
            console.log(`   Bot Views:      ${bots.toLocaleString()}`)
            console.log(`   Suspicious:     ${suspicious.toLocaleString()}`)
        }

        console.log('\n✅ Verification complete!')

    } catch (error) {
        console.error('❌ Verification failed:', error)
        process.exit(1)
    }
}

// Main execution
const autoFix = process.argv.includes('--fix')
verifyAnalytics(autoFix)
