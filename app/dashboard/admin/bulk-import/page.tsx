"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Upload,
    FileSpreadsheet,
    Images,
    Eye,
    CheckCircle,
    ArrowRight,
    ArrowLeft,
    Loader2,
    Download,
    History,
    AlertTriangle,
    RotateCcw,
    ChevronDown,
    Trash2,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { ExcelUploadStep } from "@/components/dashboard/admin/bulk-import/ExcelUploadStep"
import { ImageUploadStep } from "@/components/dashboard/admin/bulk-import/ImageUploadStep"
import { ReviewStep } from "@/components/dashboard/admin/bulk-import/ReviewStep"
import { ResultsStep } from "@/components/dashboard/admin/bulk-import/ResultsStep"
import { StepIndicator } from "@/components/dashboard/admin/bulk-import/StepIndicator"
import { useSecureFetch } from "@/lib/csrf-context"

// ============================================================================
// Types
// ============================================================================
type ImportStep = "excel" | "images" | "review" | "results"

interface ImportJob {
    id: string
    status: string
    step: string
    excel_file_name?: string
    total_properties?: number
    total_images?: number
    processed_properties?: number
    failed_properties?: number
    new_owners?: any[]
    created_at: string
    completed_at?: string
}

// ============================================================================
// Main Component
// ============================================================================
export default function BulkImportPage() {
    const router = useRouter()
    const secureFetch = useSecureFetch()

    // Step state
    const [currentStep, setCurrentStep] = useState<ImportStep>("excel")
    const [completedSteps, setCompletedSteps] = useState<Set<ImportStep>>(new Set())

    // Job state
    const [jobId, setJobId] = useState<string | null>(null)
    const [job, setJob] = useState<ImportJob | null>(null)
    const [isCreatingJob, setIsCreatingJob] = useState(false)

    // Data state
    const [excelData, setExcelData] = useState<any>(null)
    const [imageData, setImageData] = useState<any>(null)
    const [previewData, setPreviewData] = useState<any>(null)
    const [resultsData, setResultsData] = useState<any>(null)

    // History
    const [recentJobs, setRecentJobs] = useState<ImportJob[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

    // Pending step transition for race condition fix
    const [pendingStepTransition, setPendingStepTransition] = useState<ImportStep | null>(null)

    // Load recent jobs on mount
    useEffect(() => {
        loadRecentJobs()
    }, [])

    // Handle step transition when preview data is ready (race condition fix)
    useEffect(() => {
        if (pendingStepTransition === "review" && previewData && previewData.job_id === jobId) {
            setCurrentStep("review")
            setPendingStepTransition(null)
        }
    }, [pendingStepTransition, previewData, jobId])

    const loadRecentJobs = async () => {
        setLoadingHistory(true)
        try {
            const res = await secureFetch("/api/admin/bulk-import/jobs")
            if (res.ok) {
                const data = await res.json()
                setRecentJobs(data.jobs || [])
            }
        } catch (error) {
            console.error("Failed to load jobs:", error)
        } finally {
            setLoadingHistory(false)
        }
    }

    // Create new import job
    const createJob = async () => {
        setIsCreatingJob(true)
        try {
            const res = await secureFetch("/api/admin/bulk-import/jobs", { method: "POST" })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || "Failed to create job")
            }

            const data = await res.json()
            setJobId(data.job.id)
            setJob(data.job)
            setCurrentStep("excel")
            setCompletedSteps(new Set())
            setExcelData(null)
            setImageData(null)
            setPreviewData(null)
            setResultsData(null)

            toast.success("New import job created")
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsCreatingJob(false)
        }
    }

    // Load preview data - defined before handlers that use it
    const loadPreviewData = useCallback(async (retryCount = 0) => {
        if (!jobId) return
        console.log(`[Preview] Loading preview data for job ${jobId}...`)
        try {
            // Add timeout to fetch request
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

            const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobId}/preview`, {
                signal: controller.signal,
            })
            clearTimeout(timeoutId)

            console.log(`[Preview] Response status: ${res.status}`)

            if (res.ok) {
                const data = await res.json()
                console.log(`[Preview] Data loaded successfully:`, {
                    total_properties: data.summary?.total_properties,
                    total_images: data.summary?.total_images,
                    properties_count: data.properties?.length,
                })
                setPreviewData(data)
            } else {
                const errorText = await res.text()
                console.error(`[Preview] API error (${res.status}):`, errorText)

                // Retry on 5xx errors (up to 2 retries)
                if (res.status >= 500 && retryCount < 2) {
                    console.log(`[Preview] Retrying... (${retryCount + 1}/2)`)
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
                    return loadPreviewData(retryCount + 1)
                }

                let errorData
                try {
                    errorData = JSON.parse(errorText)
                } catch {
                    errorData = { error: `Server error: ${res.status}` }
                }
                toast.error(errorData.error || "Failed to load preview data")
                // Set empty preview data so review step can still render
                setPreviewData({
                    job_id: jobId,
                    status: "error",
                    summary: {
                        total_properties: 0,
                        new_owners: 0,
                        existing_owners_matched: 0,
                        total_images: 0,
                        matched_images: 0,
                        properties_with_images: 0,
                        properties_without_images: 0,
                        orphaned_images: 0,
                    },
                    properties: [],
                    psns_without_images: [],
                    orphaned_images: [],
                    new_owners_preview: [],
                })
            }
        } catch (error: any) {
            console.error("[Preview] Failed to load preview:", error)

            // Retry on network errors (up to 2 retries)
            if (error.name === 'AbortError') {
                toast.error("Request timed out. Please try again.")
            } else if (retryCount < 2) {
                console.log(`[Preview] Retrying after error... (${retryCount + 1}/2)`)
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
                return loadPreviewData(retryCount + 1)
            } else {
                toast.error("Failed to load preview data. Please try again.")
            }

            // Set empty preview data so review step can still render
            setPreviewData({
                job_id: jobId,
                status: "error",
                summary: {
                    total_properties: 0,
                    new_owners: 0,
                    existing_owners_matched: 0,
                    total_images: 0,
                    matched_images: 0,
                    properties_with_images: 0,
                    properties_without_images: 0,
                    orphaned_images: 0,
                },
                properties: [],
                psns_without_images: [],
                orphaned_images: [],
                new_owners_preview: [],
            })
        }
    }, [jobId])

    // Handle Excel upload complete
    const handleExcelComplete = useCallback((data: any) => {
        setExcelData(data)
        setCompletedSteps((prev) => new Set([...prev, "excel"]))
        setCurrentStep("images")
    }, [])

    // Handle image upload complete
    const handleImagesComplete = useCallback(async (data: any) => {
        console.log("[Flow] Images upload complete, transitioning to review...", {
            matched_psns: data?.matched_psns,
            total_images: data?.total_images,
            jobId: jobId,
        })
        setImageData(data)
        setCompletedSteps((prev) => new Set([...prev, "images"]))
        // Load preview data first - step transition happens via useEffect when data is ready
        setPendingStepTransition("review")
        try {
            console.log("[Flow] Loading preview data...")
            await loadPreviewData()
            console.log("[Flow] Preview data loaded")
        } catch (error) {
            console.error("[Flow] Failed to load preview data:", error)
            setPendingStepTransition(null)
            toast.error("Failed to load preview. Please try clicking 'Back' and then 'Next' again.")
        }
    }, [loadPreviewData, jobId])

    // Handle import complete
    const handleImportComplete = useCallback((data: any) => {
        setResultsData(data)
        setCompletedSteps((prev) => new Set([...prev, "review", "results"]))
        setCurrentStep("results")
        loadRecentJobs()
    }, [])

    // Start over
    const handleStartOver = () => {
        createJob()
    }

    // Delete job
    const handleDeleteJob = async (jobIdToDelete: string) => {
        if (!confirm("Are you sure you want to delete this import job?")) return

        try {
            const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobIdToDelete}`, {
                method: "DELETE",
            })
            if (res.ok) {
                toast.success("Job deleted")
                loadRecentJobs()
            } else {
                throw new Error("Failed to delete")
            }
        } catch (error) {
            toast.error("Failed to delete job")
        }
    }

    // Download credentials
    const downloadCredentials = (id: string) => {
        window.open(`/api/admin/bulk-import/jobs/${id}/credentials`, "_blank")
    }

    // ============================================================================
    // Render
    // ============================================================================
    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-6xl">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Link href="/dashboard/admin" className="hover:text-primary">
                            Admin Dashboard
                        </Link>
                        <span>/</span>
                        <span>Bulk Import</span>
                    </div>
                    <h1 className="text-3xl font-bold">Unified Bulk Import</h1>
                    <p className="text-muted-foreground mt-1">
                        Import properties with images in one seamless workflow
                    </p>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="import" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2 max-w-md">
                        <TabsTrigger value="import">
                            <Upload className="h-4 w-4 mr-2" />
                            New Import
                        </TabsTrigger>
                        <TabsTrigger value="history">
                            <History className="h-4 w-4 mr-2" />
                            History
                            {recentJobs.length > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                    {recentJobs.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* Import Tab */}
                    <TabsContent value="import" className="space-y-6">
                        {!jobId ? (
                            /* Start Screen */
                            <Card className="py-12">
                                <CardContent className="text-center space-y-6">
                                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                        <Upload className="h-10 w-10 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-semibold mb-2">
                                            Start New Import
                                        </h2>
                                        <p className="text-muted-foreground max-w-md mx-auto">
                                            Upload an Excel file with property details and a folder of images.
                                            The system will automatically match images to properties by PSN.
                                        </p>
                                    </div>
                                    <Button
                                        size="lg"
                                        onClick={createJob}
                                        disabled={isCreatingJob}
                                        className="gap-2"
                                    >
                                        {isCreatingJob ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <FileSpreadsheet className="h-4 w-4" />
                                                Create Import Job
                                            </>
                                        )}
                                    </Button>

                                    {/* Instructions */}
                                    <div className="bg-muted rounded-lg p-4 max-w-2xl mx-auto text-left">
                                        <h3 className="font-medium mb-3 flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                            How it works
                                        </h3>
                                        <ol className="text-sm space-y-2 text-muted-foreground">
                                            <li>1. <strong>Upload Excel</strong> - File must have columns: PSN, Property Name, Email, Owner Name, City, Area, and pricing</li>
                                            <li>2. <strong>Upload Image Folder</strong> - Select a folder where subfolder names match PSN numbers</li>
                                            <li>3. <strong>Review</strong> - Verify matched properties and images before confirming</li>
                                            <li>4. <strong>Import</strong> - System creates owners, properties, and assigns images automatically</li>
                                        </ol>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            /* Wizard */
                            <div className="space-y-6">
                                {/* Step Indicator */}
                                <StepIndicator
                                    currentStep={currentStep}
                                    completedSteps={completedSteps}
                                />

                                {/* Step Content */}
                                <Card>
                                    <CardContent className="p-6">
                                        {currentStep === "excel" && (
                                            <ExcelUploadStep
                                                jobId={jobId}
                                                onComplete={handleExcelComplete}
                                                onCancel={() => {
                                                    if (confirm("Cancel this import? All progress will be lost.")) {
                                                        setJobId(null)
                                                        setJob(null)
                                                        setCurrentStep("excel")
                                                        setCompletedSteps(new Set())
                                                    }
                                                }}
                                            />
                                        )}

                                        {currentStep === "images" && (
                                            <ImageUploadStep
                                                jobId={jobId}
                                                onComplete={handleImagesComplete}
                                                onBack={() => setCurrentStep("excel")}
                                                onCancel={() => {
                                                    if (confirm("Cancel this import? All progress will be lost.")) {
                                                        setJobId(null)
                                                        setJob(null)
                                                        setCurrentStep("excel")
                                                        setCompletedSteps(new Set())
                                                    }
                                                }}
                                                onSkip={async () => {
                                                    // Skip image upload and go directly to review
                                                    setCompletedSteps((prev) => new Set([...prev, "images"]))
                                                    await loadPreviewData()
                                                    setCurrentStep("review")
                                                }}
                                            />
                                        )}

                                        {currentStep === "review" && (
                                            previewData ? (
                                                <ReviewStep
                                                    jobId={jobId}
                                                    previewData={previewData}
                                                    onComplete={handleImportComplete}
                                                    onBack={() => setCurrentStep("images")}
                                                    onCancel={() => {
                                                        if (confirm("Cancel this import? All progress will be lost.")) {
                                                            setJobId(null)
                                                            setJob(null)
                                                            setCurrentStep("excel")
                                                            setCompletedSteps(new Set())
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-12">
                                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                                                    <p className="text-muted-foreground mb-4">Loading preview data...</p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => loadPreviewData()}
                                                    >
                                                        Retry Loading
                                                    </Button>
                                                </div>
                                            )
                                        )}

                                        {currentStep === "results" && resultsData && (
                                            <ResultsStep
                                                jobId={jobId}
                                                results={resultsData}
                                                onStartOver={handleStartOver}
                                            />
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </TabsContent>

                    {/* History Tab */}
                    <TabsContent value="history">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5" />
                                    Recent Imports
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={loadRecentJobs}
                                    disabled={loadingHistory}
                                >
                                    <RotateCcw className={`h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {loadingHistory ? (
                                    <div className="text-center py-8">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                    </div>
                                ) : recentJobs.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                        <p>No import history yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recentJobs.map((job) => (
                                            <div
                                                key={job.id}
                                                className="border rounded-lg hover:bg-muted/50 transition-colors"
                                            >
                                                <button
                                                    onClick={() =>
                                                        setExpandedJobId(expandedJobId === job.id ? null : job.id)
                                                    }
                                                    className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-3 text-left gap-2"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm truncate">
                                                                {job.excel_file_name || "Unnamed Import"}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(job.created_at).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 justify-between sm:justify-end">
                                                        <div className="text-right text-xs">
                                                            <span className="text-green-600 font-medium">
                                                                {job.processed_properties || 0}
                                                            </span>
                                                            <span className="text-muted-foreground"> / </span>
                                                            <span>{job.total_properties || 0}</span>
                                                            {(job.failed_properties || 0) > 0 && (
                                                                <span className="text-red-600 ml-1">
                                                                    ({job.failed_properties} failed)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 sm:gap-2">
                                                            <Badge
                                                                variant={
                                                                    job.status === "completed"
                                                                        ? "default"
                                                                        : job.status === "failed"
                                                                        ? "destructive"
                                                                        : "secondary"
                                                                }
                                                                className="text-xs"
                                                            >
                                                                {job.status}
                                                            </Badge>
                                                            {job.new_owners && job.new_owners.length > 0 && (
                                                                <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                                                                    {job.new_owners.length} new
                                                                </Badge>
                                                            )}
                                                            <ChevronDown
                                                                className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
                                                                    expandedJobId === job.id ? "rotate-180" : ""
                                                                }`}
                                                            />
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Expanded Details */}
                                                {expandedJobId === job.id && (
                                                    <div className="px-4 pb-4 border-t pt-3">
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                                            <div className="text-center p-2 bg-muted rounded">
                                                                <p className="text-lg font-bold">
                                                                    {job.total_properties || 0}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Properties</p>
                                                            </div>
                                                            <div className="text-center p-2 bg-green-50 rounded">
                                                                <p className="text-lg font-bold text-green-600">
                                                                    {job.processed_properties || 0}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Success</p>
                                                            </div>
                                                            <div className="text-center p-2 bg-red-50 rounded">
                                                                <p className="text-lg font-bold text-red-600">
                                                                    {job.failed_properties || 0}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Failed</p>
                                                            </div>
                                                            <div className="text-center p-2 bg-blue-50 rounded">
                                                                <p className="text-lg font-bold text-blue-600">
                                                                    {job.total_images || 0}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Images</p>
                                                            </div>
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            {job.new_owners && job.new_owners.length > 0 && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => downloadCredentials(job.id)}
                                                                    className="gap-1 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                                                                >
                                                                    <Download className="h-3 w-3" />
                                                                    <span className="hidden sm:inline">Download Credentials</span>
                                                                    <span className="sm:hidden">Download Creds</span>
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleDeleteJob(job.id)}
                                                                className="w-full sm:w-auto"
                                                            >
                                                                <Trash2 className="h-3 w-3 mr-1" />
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
