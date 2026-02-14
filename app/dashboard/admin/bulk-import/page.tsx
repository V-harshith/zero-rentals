"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
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

    // Load recent jobs on mount
    useEffect(() => {
        loadRecentJobs()
    }, [])

    const loadRecentJobs = async () => {
        setLoadingHistory(true)
        try {
            const res = await fetch("/api/admin/bulk-import/jobs")
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
            const res = await fetch("/api/admin/bulk-import/jobs", { method: "POST" })
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

    // Handle Excel upload complete
    const handleExcelComplete = useCallback((data: any) => {
        setExcelData(data)
        setCompletedSteps((prev) => new Set([...prev, "excel"]))
        setCurrentStep("images")
    }, [])

    // Handle image upload complete
    const handleImagesComplete = useCallback((data: any) => {
        setImageData(data)
        setCompletedSteps((prev) => new Set([...prev, "images"]))
        setCurrentStep("review")
        loadPreviewData()
    }, [])

    // Load preview data
    const loadPreviewData = async () => {
        if (!jobId) return
        try {
            const res = await fetch(`/api/admin/bulk-import/jobs/${jobId}/preview`)
            if (res.ok) {
                const data = await res.json()
                setPreviewData(data)
            }
        } catch (error) {
            console.error("Failed to load preview:", error)
        }
    }

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
            const res = await fetch(`/api/admin/bulk-import/jobs/${jobIdToDelete}`, {
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
                                            />
                                        )}

                                        {currentStep === "images" && (
                                            <ImageUploadStep
                                                jobId={jobId}
                                                onComplete={handleImagesComplete}
                                                onBack={() => setCurrentStep("excel")}
                                            />
                                        )}

                                        {currentStep === "review" && previewData && (
                                            <ReviewStep
                                                jobId={jobId}
                                                previewData={previewData}
                                                onComplete={handleImportComplete}
                                                onBack={() => setCurrentStep("images")}
                                            />
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

                                {/* Cancel Button */}
                                <div className="flex justify-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            if (confirm("Cancel this import? All progress will be lost.")) {
                                                setJobId(null)
                                                setJob(null)
                                                setCurrentStep("excel")
                                                setCompletedSteps(new Set())
                                            }
                                        }}
                                        className="text-muted-foreground"
                                    >
                                        Cancel Import
                                    </Button>
                                </div>
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
                                                    className="w-full flex items-center justify-between p-3 text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <p className="font-medium text-sm">
                                                                {job.excel_file_name || "Unnamed Import"}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(job.created_at).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right text-xs">
                                                            <span className="text-green-600 font-medium">
                                                                {job.processed_properties || 0}
                                                            </span>
                                                            <span className="text-muted-foreground"> / </span>
                                                            <span>{job.total_properties || 0}</span>
                                                            {job.failed_properties > 0 && (
                                                                <span className="text-red-600 ml-1">
                                                                    ({job.failed_properties} failed)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Badge
                                                            variant={
                                                                job.status === "completed"
                                                                    ? "default"
                                                                    : job.status === "failed"
                                                                    ? "destructive"
                                                                    : "secondary"
                                                            }
                                                        >
                                                            {job.status}
                                                        </Badge>
                                                        {job.new_owners && job.new_owners.length > 0 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {job.new_owners.length} new owners
                                                            </Badge>
                                                        )}
                                                        <ChevronDown
                                                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                                                                expandedJobId === job.id ? "rotate-180" : ""
                                                            }`}
                                                        />
                                                    </div>
                                                </button>

                                                {/* Expanded Details */}
                                                {expandedJobId === job.id && (
                                                    <div className="px-4 pb-4 border-t pt-3">
                                                        <div className="grid grid-cols-4 gap-4 mb-4">
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
                                                        <div className="flex gap-2">
                                                            {job.new_owners && job.new_owners.length > 0 && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => downloadCredentials(job.id)}
                                                                    className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                                                                >
                                                                    <Download className="h-3 w-3" />
                                                                    Download Credentials
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleDeleteJob(job.id)}
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
