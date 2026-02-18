/**
 * Bulk Import System - Owner Service
 *
 * Handles owner creation with subscription management.
 */

import { supabaseAdmin } from "@/lib/supabase-admin"
import { decrypt, decryptLegacy } from "@/lib/encryption"
import { logger } from "./logger"
import { checkIdempotency, recordIdempotency } from "./idempotency"
import {
    createTransactionContext,
    trackCreatedOwner,
    trackCreatedSubscription,
    markItemProcessed,
    isItemProcessed,
    shouldSimulateFailure,
    type TransactionContext,
} from "@/lib/bulk-import-transaction"

export interface OwnerData {
    email: string
    name: string
    phone: string
    password_encrypted: string
}

export interface OwnerCreationResult {
    success: boolean
    userId?: string
    password?: string
    error?: string
    alreadyExists?: boolean
}

/**
 * Create owner with subscription atomically
 */
export async function createOwnerWithSubscriptionAtomically(
    ownerData: OwnerData,
    jobId: string,
    adminId: string,
    tx: TransactionContext,
    batchNumber: number,
    itemNumber: number
): Promise<OwnerCreationResult> {
    const idempotencyKey = `owner:${ownerData.email}`

    // Check idempotency
    if (isItemProcessed(tx, idempotencyKey)) {
        const existing = tx.createdOwners.find((o) => o.email === ownerData.email)
        return {
            success: true,
            userId: existing?.id,
            password: existing?.password,
            alreadyExists: true,
        }
    }

    const existingCheck = await checkIdempotency(jobId, "owner_created", ownerData.email)
    if (existingCheck.completed && existingCheck.result) {
        const result = existingCheck.result as { userId: string; password: string }
        markItemProcessed(tx, idempotencyKey)
        return {
            success: true,
            userId: result.userId,
            password: result.password,
            alreadyExists: true,
        }
    }

    // Simulate failure for testing
    if (shouldSimulateFailure(tx, "owner", batchNumber, itemNumber)) {
        const error = `Simulated failure for owner ${ownerData.email} at batch ${batchNumber}, item ${itemNumber}`
        await recordIdempotency(jobId, adminId, "owner_created", ownerData.email, "failed", { error })
        return { success: false, error }
    }

    // Decrypt password
    let password: string
    try {
        try {
            password = decrypt(ownerData.password_encrypted)
        } catch {
            const legacy = decryptLegacy(ownerData.password_encrypted)
            if (!legacy) {
                throw new Error("Failed to decrypt password")
            }
            password = legacy
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await recordIdempotency(jobId, adminId, "owner_created", ownerData.email, "failed", {
            error: errorMessage,
        })
        return { success: false, error: `Password decryption failed: ${errorMessage}` }
    }

    try {
        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: ownerData.email,
            password: password,
            email_confirm: true,
            user_metadata: {
                name: ownerData.name,
                phone: ownerData.phone,
                role: "owner",
            },
        })

        if (authError) {
            // If user already exists, handle gracefully
            if (authError.message?.includes("already exists")) {
                const {
                    data: { users },
                } = await supabaseAdmin.auth.admin.listUsers()
                const existingUser = users?.find((u) => u.email === ownerData.email)

                if (existingUser) {
                    // Ensure users table entry exists
                    await supabaseAdmin.from("users").upsert(
                        {
                            id: existingUser.id,
                            email: ownerData.email,
                            name: ownerData.name,
                            phone: ownerData.phone,
                            role: "owner",
                            verified: true,
                            email_verified_at: existingUser.email_confirmed_at || new Date().toISOString(),
                        },
                        { onConflict: "id" }
                    )

                    // Track for potential rollback (but don't delete existing users)
                    trackCreatedOwner(tx, {
                        email: ownerData.email,
                        id: existingUser.id,
                        password: "[ALREADY EXISTS]",
                    })
                    markItemProcessed(tx, idempotencyKey)

                    // Record idempotency
                    await recordIdempotency(jobId, adminId, "owner_created", ownerData.email, "completed", {
                        userId: existingUser.id,
                        password: "[ALREADY EXISTS]",
                    })

                    return {
                        success: true,
                        userId: existingUser.id,
                        password: "[ALREADY EXISTS]",
                        alreadyExists: true,
                    }
                }
            }
            throw authError
        }

        if (!authData.user) {
            throw new Error("Failed to create user - no user returned")
        }

        const userId = authData.user.id

        // Create users table entry (idempotent via upsert)
        const { error: userError } = await supabaseAdmin.from("users").upsert(
            {
                id: userId,
                email: ownerData.email,
                name: ownerData.name,
                phone: ownerData.phone,
                role: "owner",
                verified: true,
                email_verified_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
            },
            { onConflict: "id" }
        )

        if (userError) {
            logger.error("Error creating user record", { error: userError.message, userId })
            // Continue - auth user is created, which is the important part
        }

        // Create subscription atomically with user
        const startDate = new Date()
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 100)

        const { data: subData, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .insert({
                user_id: userId,
                plan_name: "Free",
                plan_duration: "lifetime",
                amount: 0,
                status: "active",
                properties_limit: 1,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
            })
            .select("id")
            .single()

        if (subError) {
            logger.error("Error creating subscription for owner", { error: subError.message, userId })
            // Log but continue - property will still be created
        } else if (subData) {
            trackCreatedSubscription(tx, { id: subData.id, userId })
        }

        // Track in transaction context
        trackCreatedOwner(tx, {
            email: ownerData.email,
            id: userId,
            password: password,
        })
        markItemProcessed(tx, idempotencyKey)

        // Record idempotency
        await recordIdempotency(jobId, adminId, "owner_created", ownerData.email, "completed", {
            userId,
            password,
        })

        // Log audit
        await supabaseAdmin.from("bulk_import_audit_log").insert({
            job_id: jobId,
            admin_id: adminId,
            action: "owner_created",
            details: {
                email: ownerData.email,
                user_id: userId,
                transaction_id: tx.jobId,
            },
        })

        return { success: true, userId, password }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error("Failed to create owner", { email: ownerData.email, error: errorMessage })
        await recordIdempotency(jobId, adminId, "owner_created", ownerData.email, "failed", {
            error: errorMessage,
        })
        return { success: false, error: errorMessage }
    }
}

/**
 * Ensure existing owner has a subscription
 */
export async function ensureOwnerSubscription(
    userId: string,
    tx: TransactionContext
): Promise<void> {
    try {
        const { data: existingSub } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle()

        if (!existingSub) {
            const startDate = new Date()
            const endDate = new Date()
            endDate.setFullYear(endDate.getFullYear() + 100)

            const { data: newSub } = await supabaseAdmin
                .from("subscriptions")
                .insert({
                    user_id: userId,
                    plan_name: "Free",
                    plan_duration: "lifetime",
                    amount: 0,
                    status: "active",
                    properties_limit: 1,
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                })
                .select("id")
                .single()

            if (newSub) {
                trackCreatedSubscription(tx, { id: newSub.id, userId })
            }
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error("Error checking/creating subscription for existing owner", { error: errorMessage, userId })
        // Continue - property will still be created
    }
}
