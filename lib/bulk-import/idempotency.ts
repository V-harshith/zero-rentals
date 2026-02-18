/**
 * Bulk Import System - Idempotency Service
 *
 * Ensures operations are executed exactly once.
 */

import crypto from "crypto"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { logger } from "./logger"

/**
 * Generate idempotency key for an operation
 */
export function generateIdempotencyKey(
    jobId: string,
    operation: string,
    identifier: string
): string {
    return crypto
        .createHash("sha256")
        .update(`${jobId}:${operation}:${identifier}`)
        .digest("hex")
}

/**
 * Check if operation was already completed
 */
export async function checkIdempotency(
    jobId: string,
    operation: string,
    identifier: string
): Promise<{ completed: boolean; result?: unknown }> {
    const key = generateIdempotencyKey(jobId, operation, identifier)

    const { data, error } = await supabaseAdmin
        .from("bulk_import_idempotency")
        .select("status, result")
        .eq("job_id", jobId)
        .eq("operation_key", key)
        .maybeSingle()

    if (error || !data) {
        return { completed: false }
    }

    return {
        completed: data.status === "completed",
        result: data.result,
    }
}

/**
 * Record operation completion for idempotency
 */
export async function recordIdempotency(
    jobId: string,
    adminId: string,
    operation: string,
    identifier: string,
    status: "pending" | "completed" | "failed",
    result?: unknown
): Promise<void> {
    const key = generateIdempotencyKey(jobId, operation, identifier)

    const { error } = await supabaseAdmin.from("bulk_import_idempotency").upsert(
        {
            job_id: jobId,
            admin_id: adminId,
            operation_key: key,
            operation_type: operation,
            identifier,
            status,
            result: result || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,operation_key" }
    )

    if (error) {
        logger.error("Failed to record idempotency", {
            error: error.message,
            jobId,
            operation,
            identifier,
        })
    }
}
