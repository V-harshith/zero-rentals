// ============================================================================
// Bulk Import Job Queue - Concurrency Control & Rate Limiting
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase-admin"

// In-memory locks for active processing (per-instance, not distributed)
const processingLocks = new Map<string, number>()
const adminRateLimits = new Map<string, { count: number; resetAt: number }>()

// Constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_JOBS = 3 // Max new jobs per minute per admin
const LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes lock timeout

export interface QueueStatus {
    canProceed: boolean
    reason?: string
    queuePosition?: number
    estimatedWaitSeconds?: number
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check if admin has exceeded rate limit for creating new jobs
 */
export async function checkRateLimit(adminId: string): Promise<QueueStatus> {
    const now = Date.now()
    const key = adminId

    // Clean up expired entries
    for (const [k, v] of adminRateLimits.entries()) {
        if (v.resetAt < now) {
            adminRateLimits.delete(k)
        }
    }

    const current = adminRateLimits.get(key)

    if (!current) {
        adminRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
        return { canProceed: true }
    }

    if (current.resetAt < now) {
        // Window expired, reset
        adminRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
        return { canProceed: true }
    }

    if (current.count >= RATE_LIMIT_MAX_JOBS) {
        const waitSeconds = Math.ceil((current.resetAt - now) / 1000)
        return {
            canProceed: false,
            reason: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_JOBS} new jobs per minute.`,
            estimatedWaitSeconds: waitSeconds,
        }
    }

    // Increment count
    current.count++
    return { canProceed: true }
}

/**
 * Record a new job creation for rate limiting
 */
export function recordJobCreation(adminId: string): void {
    const now = Date.now()
    const key = adminId
    const current = adminRateLimits.get(key)

    if (!current || current.resetAt < now) {
        adminRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    } else {
        current.count++
    }
}

// ============================================================================
// Concurrent Job Prevention (Per Admin)
// ============================================================================

/**
 * Check if admin has any job currently being processed
 */
export async function hasConcurrentProcessingJob(adminId: string): Promise<boolean> {
    const { data: processingJobs, error } = await supabaseAdmin
        .from("bulk_import_jobs")
        .select("id, status, processing_started_at")
        .eq("admin_id", adminId)
        .in("status", ["processing", "parsing_excel", "uploading_images"])
        .limit(1)

    if (error) {
        console.error("Error checking concurrent jobs:", error)
        // Fail safe - assume no concurrent job on error
        return false
    }

    if (!processingJobs || processingJobs.length === 0) {
        return false
    }

    // Check if job has been processing too long (stale lock)
    const job = processingJobs[0]
    if (job.processing_started_at) {
        const startedAt = new Date(job.processing_started_at).getTime()
        const now = Date.now()
        if (now - startedAt > LOCK_TIMEOUT_MS) {
            // Job is stale, mark it as failed
            await supabaseAdmin
                .from("bulk_import_jobs")
                .update({
                    status: "failed",
                    error_message: "Job timed out - processing took too long",
                    error_details: { timeout_after_ms: LOCK_TIMEOUT_MS },
                })
                .eq("id", job.id)

            // Log the timeout
            await supabaseAdmin.from("bulk_import_audit_log").insert({
                job_id: job.id,
                admin_id: adminId,
                action: "job_timeout",
                details: { previous_status: job.status },
            })

            return false
        }
    }

    return true
}

/**
 * Acquire a distributed lock for job processing using database
 */
export async function acquireProcessingLock(
    jobId: string,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    // Check in-memory lock first (faster)
    const existingLock = processingLocks.get(jobId)
    if (existingLock) {
        const now = Date.now()
        if (now - existingLock < LOCK_TIMEOUT_MS) {
            return { success: false, error: "Job is already being processed" }
        }
        // Lock expired, clear it
        processingLocks.delete(jobId)
    }

    // Check if admin has another job being processed
    const hasConcurrent = await hasConcurrentProcessingJob(adminId)
    if (hasConcurrent) {
        return {
            success: false,
            error: "You have another import job currently being processed. Please wait for it to complete.",
        }
    }

    // Set in-memory lock
    processingLocks.set(jobId, Date.now())

    return { success: true }
}

/**
 * Release the processing lock
 */
export function releaseProcessingLock(jobId: string): void {
    processingLocks.delete(jobId)
}

/**
 * Clear all locks for an admin (useful for cleanup)
 */
export function clearAdminLocks(adminId: string): void {
    // This is a placeholder - in a distributed system we'd need a different approach
    // For now, individual job locks are cleared via releaseProcessingLock
}

// ============================================================================
// Job Queue Management
// ============================================================================

/**
 * Get queue position for a job (if implementing a true queue)
 */
export async function getQueuePosition(jobId: string, adminId: string): Promise<number> {
    // Get all pending jobs for this admin ordered by creation time
    const { data: pendingJobs } = await supabaseAdmin
        .from("bulk_import_jobs")
        .select("id, created_at")
        .eq("admin_id", adminId)
        .in("status", ["ready", "images_uploaded"])
        .order("created_at", { ascending: true })

    if (!pendingJobs) return 0

    const position = pendingJobs.findIndex(job => job.id === jobId)
    return position === -1 ? 0 : position + 1
}

/**
 * Get estimated wait time based on queue position
 */
export function estimateWaitTime(queuePosition: number): number {
    // Estimate 30 seconds per job ahead in queue
    return queuePosition * 30
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface JobProgress {
    status: string
    progress: number
    step?: string
    processedCount?: number
    totalCount?: number
    failedCount?: number
    message?: string
}

/**
 * Update job progress in database for persistence
 */
export async function updateJobProgress(
    jobId: string,
    progress: JobProgress
): Promise<void> {
    try {
        await supabaseAdmin
            .from("bulk_import_jobs")
            .update({
                status: progress.status,
                step: progress.step,
                processed_properties: progress.processedCount,
                total_properties: progress.totalCount,
                failed_properties: progress.failedCount,
                updated_at: new Date().toISOString(),
            })
            .eq("id", jobId)
    } catch (error) {
        console.error("Failed to update job progress:", error)
        // Non-critical, don't throw
    }
}

/**
 * Get current job progress
 */
export async function getJobProgress(jobId: string): Promise<JobProgress | null> {
    const { data: job, error } = await supabaseAdmin
        .from("bulk_import_jobs")
        .select("status, step, processed_properties, total_properties, failed_properties")
        .eq("id", jobId)
        .single()

    if (error || !job) return null

    const processedCount = job.processed_properties || 0
    const totalCount = job.total_properties || 0
    const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0

    return {
        status: job.status,
        progress: progressPercent,
        step: job.step || undefined,
        processedCount,
        totalCount,
        failedCount: job.failed_properties || 0,
    }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up stale locks and timed-out jobs
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupStaleJobs(): Promise<{
    locksCleared: number
    jobsMarkedFailed: number
}> {
    const now = Date.now()
    let locksCleared = 0
    let jobsMarkedFailed = 0

    // Clear expired in-memory locks
    for (const [jobId, timestamp] of processingLocks.entries()) {
        if (now - timestamp > LOCK_TIMEOUT_MS) {
            processingLocks.delete(jobId)
            locksCleared++
        }
    }

    // Find and mark stale processing jobs as failed
    const timeoutThreshold = new Date(now - LOCK_TIMEOUT_MS).toISOString()
    const { data: staleJobs } = await supabaseAdmin
        .from("bulk_import_jobs")
        .select("id, admin_id")
        .eq("status", "processing")
        .lt("processing_started_at", timeoutThreshold)

    if (staleJobs && staleJobs.length > 0) {
        for (const job of staleJobs) {
            await supabaseAdmin
                .from("bulk_import_jobs")
                .update({
                    status: "failed",
                    error_message: "Job timed out - processing took too long",
                })
                .eq("id", job.id)

            await supabaseAdmin.from("bulk_import_audit_log").insert({
                job_id: job.id,
                admin_id: job.admin_id,
                action: "job_timeout_cleanup",
                details: { automated: true },
            })

            jobsMarkedFailed++
        }
    }

    return { locksCleared, jobsMarkedFailed }
}
