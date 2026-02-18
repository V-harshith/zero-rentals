"use client"

import React, { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
    AlertTriangle,
    CheckCircle,
    Loader2,
    ArrowLeft,
    Building2,
    Users,
    Images,
    X,
} from "lucide-react"
import { toast } from "sonner"
import { useSecureFetch } from "@/lib/csrf-context"

interface ReviewStepProps {
    jobId: string
    previewData: any
    onComplete: (data: any) => void
    onBack: () => void
    onCancel?: () => void
}

interface StreamData {
    error?: string
    progress?: number
    status?: string
    completed?: boolean
    results?: {
        created_properties?: number
        failed_properties?: number
        new_owners?: number
    }
    step?: string
    owners_created?: number
    properties_created?: number
}

// ============================================================================
// Stream Processing Helpers
// ============================================================================

const handleStreamError = (error: Error) => {
    if (error.message) {
        toast.error(error.message)
    }
    throw error
}

const handleProgressUpdate = (
    data: StreamData,
    setProgress: (p: number) => void,
    setStatus: (s: string) => void
) => {
    if (data.progress !== undefined) {
        setProgress(data.progress)
    }
    if (data.status) {
        setStatus(data.status)
    }
}

const handleCompletion = (data: StreamData, onComplete: (data: any) => void) => {
    const results = data.results || {}
    const created = results.created_properties || 0
    const failed = results.failed_properties || 0
    const newOwners = results.new_owners || 0

    if (failed > 0) {
        toast.warning(`Import completed with ${failed} errors`, {
            description: `${created} properties created, ${newOwners} new owners`,
            duration: 6000,
        })
    } else {
        toast.success(`Import completed successfully!`, {
            description: `${created} properties created, ${newOwners} new owners`,
        })
    }
    onComplete(data)
}

const handleStepNotification = (data: StreamData, totalProperties: number) => {
    if (data.step === 'creating_owners' && data.owners_created !== undefined) {
        toast.info(`Creating owner accounts...`, {
            description: `${data.owners_created} created`,
            id: 'creating-owners',
        })
    }

    if (data.step === 'creating_properties' && data.properties_created !== undefined) {
        toast.info(`Creating properties...`, {
            description: `${data.properties_created} of ${totalProperties} done`,
            id: 'creating-properties',
        })
    }
}

const processStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    properties: any[],
    setProgress: (p: number) => void,
    setStatus: (s: string) => void,
    onComplete: (data: any) => void,
    signal?: AbortSignal
): Promise<void> => {
    const decoder = new TextDecoder()
    let buffer = ""

    try {
        while (true) {
            const { done, value } = await reader.read()

            // Process any remaining data in buffer when stream ends
            if (done) {
                // Process remaining buffer content
                if (buffer.trim()) {
                    const lines = buffer.split("\n")
                    for (const line of lines) {
                        if (!line.trim()) continue

                        try {
                            const data: StreamData = JSON.parse(line)

                            if (data.error) {
                                handleStreamError(new Error(data.error))
                            }

                            handleProgressUpdate(data, setProgress, setStatus)

                            if (data.completed) {
                                handleCompletion(data, onComplete)
                            }

                            handleStepNotification(data, properties.length)
                        } catch (e: unknown) {
                            if (signal?.aborted) return
                            const message = e instanceof Error ? e.message : "Failed to process server response"
                            toast.error(message)
                        }
                    }
                }
                break
            }

            // Check abort after read to ensure we process any remaining data
            if (signal?.aborted) {
                throw new Error("Import cancelled")
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
                if (!line.trim()) continue

                try {
                    const data: StreamData = JSON.parse(line)

                    if (data.error) {
                        handleStreamError(new Error(data.error))
                    }

                    handleProgressUpdate(data, setProgress, setStatus)

                    if (data.completed) {
                        handleCompletion(data, onComplete)
                    }

                    handleStepNotification(data, properties.length)
                } catch (e: unknown) {
                    // Skip errors if aborted
                    if (signal?.aborted) return
                    const message = e instanceof Error ? e.message : "Failed to process server response"
                    toast.error(message)
                }
            }
        }
    } catch (err: unknown) {
        // Handle stream reading errors
        if (err instanceof Error) {
            if (err.name === 'AbortError' || err.message === "Import cancelled") {
                throw err
            }
            toast.error(`Stream error: ${err.message}`)
        }
        throw err
    }
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
    onBack: () => void
    onCancel?: () => void
}

const EmptyState = ({ onBack, onCancel }: EmptyStateProps) => (
    <div className="space-y-6" role="alert" aria-live="polite">
        <div className="text-center">
            <h2 className="text-xl font-semibold mb-2" id="review-heading">Review Import</h2>
            <p className="text-muted-foreground" id="review-description">
                No properties found to review
            </p>
        </div>

        <Alert variant="destructive" className="bg-red-50" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
                No valid properties were found for this import. Please go back and check your Excel file.
            </AlertDescription>
        </Alert>

        <div className="flex gap-3">
            <Button
                variant="outline"
                onClick={onBack}
                className="flex-1"
                aria-label="Go back to image upload"
            >
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Back to Images
            </Button>
            {onCancel && (
                <Button
                    variant="ghost"
                    onClick={onCancel}
                    className="text-muted-foreground"
                    aria-label="Cancel import"
                >
                    Cancel
                </Button>
            )}
        </div>
    </div>
)

// ============================================================================
// Summary Card Component
// ============================================================================

interface SummaryCardProps {
    icon: React.ReactNode
    value: number
    label: string
    colorClass: string
    ariaLabel: string
}

const SummaryCard = ({ icon, value, label, colorClass, ariaLabel }: SummaryCardProps) => (
    <Card aria-label={ariaLabel}>
        <CardContent className="pt-6 text-center">
            <div className={`h-8 w-8 mx-auto mb-2 ${colorClass}`} aria-hidden="true">
                {icon}
            </div>
            <p className="text-2xl font-bold" aria-label={`${value} ${label}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
        </CardContent>
    </Card>
)

// ============================================================================
// Main Component
// ============================================================================

export function ReviewStep({ jobId, previewData, onComplete, onBack, onCancel }: ReviewStepProps) {
    const secureFetch = useSecureFetch()
    const [confirming, setConfirming] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("")
    const [abortController, setAbortController] = useState<AbortController | null>(null)

    const summary = previewData?.summary || {}
    const properties = previewData?.properties || []
    const newOwners = previewData?.new_owners_preview || []

    // Cleanup AbortController on unmount
    useEffect(() => {
        return () => {
            abortController?.abort()
        }
    }, [abortController])

    // Show empty state if no properties
    if (properties.length === 0) {
        return <EmptyState onBack={onBack} onCancel={onCancel} />
    }

    const handleConfirm = useCallback(async () => {
        setConfirming(true)
        setIsCancelling(false)
        setStatus("Starting import...")
        setProgress(0)

        const controller = new AbortController()
        setAbortController(controller)

        try {
            const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobId}/confirm`, {
                method: "POST",
                signal: controller.signal,
            })

            if (!res.ok) {
                const errorData = await res.json()
                throw new Error(errorData.error || "Import failed")
            }

            const reader = res.body?.getReader()
            if (reader) {
                await processStream(reader, properties, setProgress, setStatus, onComplete, controller.signal)
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === "Import cancelled") {
                toast.info("Import cancelled")
                setStatus("Import cancelled")
            } else {
                toast.error(err.message || "Import failed")
            }
        } finally {
            setConfirming(false)
            setIsCancelling(false)
            setAbortController(null)
        }
    }, [jobId, properties, onComplete, secureFetch])

    const handleCancelImport = useCallback(() => {
        if (abortController) {
            setIsCancelling(true)
            setStatus("Cancelling...")
            abortController.abort()
        }
    }, [abortController])

    return (
        <div className="space-y-6" role="main" aria-labelledby="review-heading">
            {/* Header */}
            <div className="text-center" role="region" aria-label="Import summary">
                <h2 className="text-xl font-semibold mb-2" id="review-heading">Review Import</h2>
                <p className="text-muted-foreground" id="review-description">
                    Review the properties and images before confirming the import
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" role="region" aria-label="Import statistics">
                <SummaryCard
                    icon={<Building2 className="h-full w-full" />}
                    value={summary.total_properties}
                    label="Properties"
                    colorClass="text-blue-500"
                    ariaLabel={`${summary.total_properties} properties to import`}
                />

                <SummaryCard
                    icon={<Users className="h-full w-full" />}
                    value={summary.new_owners}
                    label="New Owners"
                    colorClass="text-green-500"
                    ariaLabel={`${summary.new_owners} new owners to create`}
                />

                <SummaryCard
                    icon={<Images className="h-full w-full" />}
                    value={summary.total_images}
                    label="Images"
                    colorClass="text-purple-500"
                    ariaLabel={`${summary.total_images} images to upload`}
                />

                <SummaryCard
                    icon={<CheckCircle className="h-full w-full" />}
                    value={summary.properties_with_images}
                    label="With Images"
                    colorClass="text-green-500"
                    ariaLabel={`${summary.properties_with_images} properties with images`}
                />
            </div>

            {/* Warnings */}
            {summary.properties_without_images > 0 && (
                <Alert
                    className="bg-orange-50 border-orange-200"
                    role="alert"
                    aria-live="polite"
                >
                    <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden="true" />
                    <AlertDescription className="text-orange-800">
                        <strong>{summary.properties_without_images}</strong> properties will be imported without images.
                        You can add images later via the bulk image upload feature.
                    </AlertDescription>
                </Alert>
            )}

            {summary.orphaned_images > 0 && (
                <Alert role="alert" aria-live="polite">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>
                        <strong>{summary.orphaned_images}</strong> images don't match any PSN and will be skipped.
                    </AlertDescription>
                </Alert>
            )}

            {/* New Owners Preview */}
            {newOwners.length > 0 && (
                <div role="region" aria-labelledby="new-owners-heading">
                    <h3 className="font-medium mb-3 flex items-center gap-2" id="new-owners-heading">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        New Owner Accounts ({newOwners.length})
                    </h3>
                    <div className="bg-muted rounded-lg p-3">
                        <div className="h-32 overflow-y-auto" role="list" aria-label="New owners list">
                            <div className="space-y-2">
                                {newOwners.slice(0, 5).map((owner: any, i: number) => (
                                    <div
                                        key={i}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1"
                                        role="listitem"
                                        aria-label={`${owner.name}, ${owner.email}`}
                                    >
                                        <span className="font-medium truncate">{owner.name}</span>
                                        <span className="text-muted-foreground text-xs sm:text-sm truncate">{owner.email}</span>
                                    </div>
                                ))}
                                {newOwners.length > 5 && (
                                    <p className="text-sm text-muted-foreground">
                                        ...and {newOwners.length - 5} more
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Properties Preview */}
            <div role="region" aria-labelledby="properties-heading">
                <h3 className="font-medium mb-3 flex items-center gap-2" id="properties-heading">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    Properties Preview ({properties.length})
                </h3>
                <div
                    className="h-64 border rounded-lg overflow-y-auto"
                    role="list"
                    aria-label="Properties to import"
                >
                    <div className="p-2 space-y-2">
                        {properties.slice(0, 20).map((prop: any) => (
                            <div
                                key={prop.psn}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/50 rounded gap-2"
                                role="listitem"
                                aria-label={`${prop.property_name} in ${prop.city}, owned by ${prop.owner_name}`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Badge variant="outline" className="shrink-0">{prop.psn}</Badge>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">{prop.property_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {prop.city}, {prop.area} • {prop.owner_name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {prop.is_new_owner && (
                                        <Badge variant="secondary" className="text-xs whitespace-nowrap">New Owner</Badge>
                                    )}
                                    {prop.image_count > 0 ? (
                                        <Badge className="bg-green-100 text-green-700 text-xs whitespace-nowrap">
                                            {prop.image_count} images
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-orange-500 text-xs whitespace-nowrap">
                                            No images
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                        {properties.length > 20 && (
                            <p className="text-center text-sm text-muted-foreground py-2">
                                ...and {properties.length - 20} more properties
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress (when confirming) */}
            {confirming && (
                <div
                    className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Import progress"
                >
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-blue-800">{status}</span>
                        <span className="text-blue-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2" aria-hidden="true">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Confirm Warning */}
            {!confirming && (
                <Alert variant="destructive" className="bg-red-50" role="alert">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>
                        <strong>Important:</strong> This action cannot be undone. Please verify all data before confirming.
                        New owner accounts will be created with temporary passwords.
                    </AlertDescription>
                </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={confirming}
                    className="w-full sm:w-auto"
                    aria-label="Go back to image upload"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                    Back
                </Button>

                {onCancel && !confirming && (
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={confirming}
                        className="text-muted-foreground w-full sm:w-auto"
                        aria-label="Cancel import"
                    >
                        Cancel
                    </Button>
                )}

                {confirming && (
                    <Button
                        variant="destructive"
                        onClick={handleCancelImport}
                        disabled={isCancelling}
                        className="w-full sm:w-auto"
                        aria-label="Stop import"
                    >
                        {isCancelling ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                                Cancelling...
                            </>
                        ) : (
                            <>
                                <X className="h-4 w-4 mr-2" aria-hidden="true" />
                                Stop Import
                            </>
                        )}
                    </Button>
                )}

                <Button
                    onClick={handleConfirm}
                    disabled={confirming || properties.length === 0}
                    className="flex-1 w-full sm:w-auto"
                    size="lg"
                    aria-label={confirming ? "Import in progress" : `Confirm import of ${properties.length} properties`}
                >
                    {confirming ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                            Importing...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                            <span className="hidden sm:inline">Confirm Import ({properties.length} properties)</span>
                            <span className="sm:hidden">Confirm ({properties.length})</span>
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
