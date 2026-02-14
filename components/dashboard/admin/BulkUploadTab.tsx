"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
    Upload, FileSpreadsheet, CheckCircle, XCircle,
    AlertTriangle, Download, Loader2, Users, Key,
    History, Clock, RotateCcw, ShieldCheck, StopCircle,
    ChevronDown, ArrowRight, Images, Sparkles
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

// ============================================================================
// TYPES
// ============================================================================
interface UploadResults {
    total: number
    success: number
    failed: number
    errors: string[]
}

interface OwnerCredential {
    email: string
    password: string
    name: string
    phone: string
    properties: string[]
    isNew: boolean
}

interface ValidationResult {
    valid: boolean
    totalRows: number
    columns: string[]
    missingRequired: string[]
    warnings: string[]
    sampleRows: Record<string, unknown>[]
    ownerEmails: number
    ownerEmailsMissing: number
    priceErrors: number
}

interface UploadHistoryItem {
    id: string
    file_name: string
    total_rows: number
    success_count: number
    failed_count: number
    status: string
    new_owners_count: number
    created_at: string
    completed_at: string | null
}

interface UploadDetail {
    id: string
    file_name: string
    status: string
    total_rows: number
    success_count: number
    failed_count: number
    new_owners_count: number
    errors: string[]
    credentials_count: number
    created_at: string
    completed_at: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================
export function BulkUploadTab() {
    // File & upload state
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [statusMessage, setStatusMessage] = useState("")
    const [processed, setProcessed] = useState(0)
    const [total, setTotal] = useState(0)
    const [results, setResults] = useState<UploadResults | null>(null)
    const [credentials, setCredentials] = useState<OwnerCredential[]>([])
    const [uploadId, setUploadId] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Validation state
    const [validating, setValidating] = useState(false)
    const [validation, setValidation] = useState<ValidationResult | null>(null)

    // Upload history
    const [history, setHistory] = useState<UploadHistoryItem[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [uploadDetail, setUploadDetail] = useState<UploadDetail | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)

    // Load upload history on mount
    const loadHistory = useCallback(async () => {
        setLoadingHistory(true)
        try {
            const res = await fetch('/api/admin/bulk-upload/history')
            if (res.ok) {
                const data = await res.json()
                setHistory(data.uploads || [])
            }
        } catch {
            // Silent fail for history
        } finally {
            setLoadingHistory(false)
        }
    }, [])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    const toggleDetail = async (id: string) => {
        if (expandedId === id) {
            setExpandedId(null)
            setUploadDetail(null)
            return
        }
        setExpandedId(id)
        setLoadingDetail(true)
        setUploadDetail(null)
        try {
            const res = await fetch(`/api/admin/bulk-upload/${id}`)
            if (res.ok) {
                const data = await res.json()
                setUploadDetail(data.upload)
            } else {
                toast.error('Failed to load upload details')
            }
        } catch {
            toast.error('Failed to load upload details')
        } finally {
            setLoadingDetail(false)
        }
    }

    const downloadPastCredentials = (id: string) => {
        window.open(`/api/admin/bulk-upload/${id}?format=csv`, '_blank')
        toast.success('Credentials download started')
    }

    const downloadPastErrors = () => {
        if (!uploadDetail?.errors?.length) return
        const csvRows = ['Category,Row,Error']
        for (const error of uploadDetail.errors) {
            csvRows.push(`"${error.replace(/"/g, '""')}"`)
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `errors_${uploadDetail.file_name}_${new Date(uploadDetail.created_at).toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // ========================================================================
    // FILE HANDLING
    // ========================================================================
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0]
            if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
                setFile(selectedFile)
                setResults(null)
                setCredentials([])
                setValidation(null)
                setProgress(0)
            } else {
                toast.error("Please select an Excel file (.xlsx or .xls)")
            }
        }
    }

    // ========================================================================
    // VALIDATION
    // ========================================================================
    const handleValidate = async () => {
        if (!file) return

        setValidating(true)
        setValidation(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await fetch('/api/admin/bulk-upload/validate', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const data = await res.json()
                toast.error(data.error || 'Validation failed')
                return
            }

            const result = await res.json() as ValidationResult
            setValidation(result)

            if (result.valid) {
                toast.success(`File validated: ${result.totalRows} rows ready to upload`)
            } else {
                toast.error(`Validation failed: Missing columns: ${result.missingRequired.join(', ')}`)
            }
        } catch {
            toast.error("Validation failed")
        } finally {
            setValidating(false)
        }
    }

    // ========================================================================
    // UPLOAD
    // ========================================================================
    const handleCancel = async () => {
        if (!uploadId) return
        setCancelling(true)
        try {
            await fetch('/api/admin/bulk-upload/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId }),
            })
            toast.info('Cancellation requested — will stop after current batch')
        } catch {
            toast.error('Failed to cancel')
        } finally {
            setCancelling(false)
        }
    }

    const handleUpload = async () => {
        if (!file) {
            toast.error("Please select a file first")
            return
        }

        // Legacy upload is deprecated - redirect to new unified import
        toast.info("Redirecting to new Unified Import Wizard...", {
            description: "The legacy upload has been replaced with a better system.",
            duration: 3000,
        })

        // Store file in sessionStorage for the new wizard to pick up
        setTimeout(() => {
            window.location.href = '/dashboard/admin/bulk-import'
        }, 1500)
    }

    // ========================================================================
    // DOWNLOADS
    // ========================================================================
    const downloadCredentials = () => {
        if (credentials.length === 0) return

        const csvRows = [
            ['Owner Email', 'Password', 'Owner Name', 'Phone', 'Properties', 'Login URL'].join(',')
        ]
        for (const cred of credentials) {
            csvRows.push([
                cred.email,
                cred.password,
                `"${cred.name}"`,
                cred.phone,
                `"${cred.properties.join('; ')}"`,
                'https://zerorentals.com/login/owner'
            ].join(','))
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `owner_credentials_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Credentials CSV downloaded!")
    }

    const downloadErrorLog = () => {
        if (!results?.errors.length) return

        const csvRows = ['Row,Error']
        for (const error of results.errors) {
            csvRows.push(`"${error.replace(/"/g, '""')}"`)
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `upload_errors_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const resetForm = () => {
        setFile(null)
        setResults(null)
        setCredentials([])
        setValidation(null)
        setProgress(0)
        setProcessed(0)
        setTotal(0)
        setUploadId(null)
        setStatusMessage("")
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ========================================================================
    // RENDER
    // ========================================================================
    return (
        <div className="space-y-6">
            {/* New Unified Bulk Import Card */}
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600" />
                        Unified Bulk Import (New)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground mb-3">
                                Import properties with images in one seamless workflow. Upload your Excel file
                                and image folders organized by PSN. The system will automatically match
                                images to properties and create owner accounts.
                            </p>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Badge variant="outline" className="gap-1">
                                    <FileSpreadsheet className="h-3 w-3" />
                                    Excel Upload
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Images className="h-3 w-3" />
                                    Image Folders
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    <Users className="h-3 w-3" />
                                    Auto-Create Owners
                                </Badge>
                            </div>
                        </div>
                    </div>
                    <Link href="/dashboard/admin/bulk-import">
                        <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                            Launch Unified Import Wizard
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Legacy Upload Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-muted-foreground">
                        <FileSpreadsheet className="h-5 w-5" />
                        Legacy Bulk Upload (Excel Only)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* File Upload */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                            file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                        }`}
                    >
                        <Upload className={`h-12 w-12 mx-auto mb-4 ${file ? 'text-green-500' : 'text-muted-foreground'}`} />
                        <h3 className="font-semibold mb-2">
                            {file ? file.name : 'Choose Excel File'}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {file
                                ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                                : 'Upload .xlsx file with property data (Harshith.xlsx format)'
                            }
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                            id="bulk-file-upload"
                            disabled={uploading}
                        />
                        <label htmlFor="bulk-file-upload">
                            <Button variant={file ? "outline" : "default"} disabled={uploading} asChild>
                                <span>{file ? 'Change File' : 'Select File'}</span>
                            </Button>
                        </label>
                    </div>

                    {/* Expected Format */}
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <strong>Expected Excel Columns (Harshith.xlsx format):</strong>
                            <div className="mt-2 text-xs grid grid-cols-1 md:grid-cols-2 gap-1">
                                <p>• Country, City, Area, Locality</p>
                                <p>• PG&apos;s For, Property Name</p>
                                <p>• Owner Name, Owner Contact, Email</p>
                                <p>• Landmark, USP, Facilities</p>
                                <p>• Private Room, Double Sharing, Triple Sharing, Four Sharing</p>
                                <p>• Deposit, Address, PSN</p>
                            </div>
                            <p className="mt-2 text-xs text-blue-700">
                                <strong>Owner accounts</strong> are auto-created from the Email column. Owners can log in after upload.
                            </p>
                        </AlertDescription>
                    </Alert>

                    {/* Validation Results */}
                    {validation && (
                        <div className={`p-4 rounded-lg border ${validation.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                {validation.valid ? (
                                    <ShieldCheck className="h-5 w-5 text-green-600" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-red-600" />
                                )}
                                <h4 className={`font-semibold ${validation.valid ? 'text-green-800' : 'text-red-800'}`}>
                                    {validation.valid ? 'Validation Passed' : 'Validation Failed'}
                                </h4>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                <div className="text-center p-2 bg-white rounded border">
                                    <p className="text-lg font-bold">{validation.totalRows}</p>
                                    <p className="text-xs text-muted-foreground">Total Rows</p>
                                </div>
                                <div className="text-center p-2 bg-white rounded border">
                                    <p className="text-lg font-bold text-green-600">{validation.ownerEmails}</p>
                                    <p className="text-xs text-muted-foreground">With Email</p>
                                </div>
                                <div className="text-center p-2 bg-white rounded border">
                                    <p className="text-lg font-bold text-amber-600">{validation.ownerEmailsMissing}</p>
                                    <p className="text-xs text-muted-foreground">No Email</p>
                                </div>
                                <div className="text-center p-2 bg-white rounded border">
                                    <p className="text-lg font-bold text-red-600">{validation.priceErrors}</p>
                                    <p className="text-xs text-muted-foreground">No Price</p>
                                </div>
                            </div>

                            {validation.missingRequired.length > 0 && (
                                <p className="text-sm text-red-700 mb-2">
                                    <strong>Missing required columns:</strong> {validation.missingRequired.join(', ')}
                                </p>
                            )}

                            {validation.warnings.length > 0 && (
                                <div className="text-xs text-amber-700 space-y-1">
                                    {validation.warnings.map((w, i) => (
                                        <p key={i}>⚠ {w}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Progress */}
                    {uploading && (
                        <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                    <span className="text-sm font-medium text-blue-800">{statusMessage}</span>
                                </div>
                                {uploadId && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleCancel}
                                        disabled={cancelling}
                                        className="gap-1 text-xs"
                                    >
                                        <StopCircle className="h-3 w-3" />
                                        {cancelling ? 'Cancelling...' : 'Cancel Upload'}
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center justify-between text-sm text-blue-700">
                                <span>{processed > 0 ? `${processed} / ${total} properties` : 'Starting...'}</span>
                                <span className="font-semibold">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </div>
                    )}

                    {/* Results */}
                    {results && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <Card className="border-blue-200">
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-2xl font-bold">{results.total}</p>
                                        <p className="text-sm text-muted-foreground">Total Rows</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-green-200">
                                    <CardContent className="pt-6 text-center">
                                        <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                                        <p className="text-2xl font-bold text-green-600">{results.success}</p>
                                        <p className="text-sm text-muted-foreground">Success</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-red-200">
                                    <CardContent className="pt-6 text-center">
                                        <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                                        <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                                        <p className="text-sm text-muted-foreground">Failed</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Credentials */}
                            {credentials.length > 0 && (
                                <Alert className="border-green-200 bg-green-50">
                                    <Key className="h-4 w-4 text-green-600" />
                                    <AlertDescription>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <strong className="text-green-800">
                                                    {credentials.length} new owner account{credentials.length > 1 ? 's' : ''} created
                                                </strong>
                                                <p className="text-sm text-green-700 mt-1">
                                                    Download the credentials CSV now — passwords cannot be retrieved later.
                                                </p>
                                            </div>
                                            <Button
                                                onClick={downloadCredentials}
                                                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                                                size="sm"
                                            >
                                                <Download className="h-4 w-4" />
                                                Download Credentials
                                            </Button>
                                        </div>
                                        <div className="mt-3 text-xs text-green-700 max-h-32 overflow-auto space-y-1">
                                            {credentials.slice(0, 5).map((cred, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <Users className="h-3 w-3 shrink-0" />
                                                    <span>{cred.name} — {cred.email} — {cred.properties.length} propert{cred.properties.length > 1 ? 'ies' : 'y'}</span>
                                                </div>
                                            ))}
                                            {credentials.length > 5 && (
                                                <p className="font-semibold">...and {credentials.length - 5} more</p>
                                            )}
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Errors */}
                            {results.errors.length > 0 && (
                                <Alert variant="destructive">
                                    <XCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        <div className="flex items-center justify-between mb-2">
                                            <strong>Errors ({results.errors.length})</strong>
                                            <Button variant="outline" size="sm" onClick={downloadErrorLog} className="gap-1 text-xs">
                                                <Download className="h-3 w-3" />
                                                Download Log
                                            </Button>
                                        </div>
                                        <div className="text-xs max-h-40 overflow-y-auto space-y-1">
                                            {results.errors.slice(0, 10).map((error, index) => (
                                                <p key={index}>• {error}</p>
                                            ))}
                                            {results.errors.length > 10 && (
                                                <p className="mt-2 font-semibold">
                                                    ...and {results.errors.length - 10} more errors
                                                </p>
                                            )}
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        {/* Validate button - show when file selected but not yet validated */}
                        {file && !validation && !results && !uploading && (
                            <Button
                                onClick={handleValidate}
                                disabled={validating}
                                variant="outline"
                                size="lg"
                                className="gap-2"
                            >
                                {validating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ShieldCheck className="h-4 w-4" />
                                )}
                                {validating ? 'Validating...' : 'Validate First'}
                            </Button>
                        )}

                        <Button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="flex-1"
                            size="lg"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload Properties
                                </>
                            )}
                        </Button>
                        {results && (
                            <Button variant="outline" onClick={resetForm} disabled={uploading}>
                                Upload Another
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Upload History */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Upload History
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}>
                            <RotateCcw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading history...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p>No upload history yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((item) => (
                                <div key={item.id} className="rounded-lg border hover:bg-muted/50 transition-colors">
                                    <button
                                        onClick={() => toggleDetail(item.id)}
                                        className="w-full flex items-center justify-between p-3 text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm truncate">{item.file_name}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(item.created_at).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right text-xs">
                                                <span className="text-green-600 font-medium">{item.success_count}</span>
                                                <span className="text-muted-foreground"> / </span>
                                                <span>{item.total_rows}</span>
                                                {item.failed_count > 0 && (
                                                    <span className="text-red-600 ml-1">({item.failed_count} failed)</span>
                                                )}
                                            </div>
                                            {item.new_owners_count > 0 && (
                                                <Badge variant="outline" className="text-xs gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {item.new_owners_count}
                                                </Badge>
                                            )}
                                            <Badge
                                                variant={
                                                    item.status === 'completed' ? 'default' :
                                                    item.status === 'processing' ? 'secondary' : 'destructive'
                                                }
                                                className="text-xs"
                                            >
                                                {item.status}
                                            </Badge>
                                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Expanded Detail Panel */}
                                    {expandedId === item.id && (
                                        <div className="px-4 pb-4 border-t">
                                            {loadingDetail ? (
                                                <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Loading details...
                                                </div>
                                            ) : uploadDetail ? (
                                                <div className="pt-3 space-y-3">
                                                    {/* Stats Row */}
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div className="text-center p-2 bg-blue-50 rounded">
                                                            <p className="text-lg font-bold">{uploadDetail.total_rows}</p>
                                                            <p className="text-xs text-muted-foreground">Total</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-green-50 rounded">
                                                            <p className="text-lg font-bold text-green-600">{uploadDetail.success_count}</p>
                                                            <p className="text-xs text-muted-foreground">Success</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-red-50 rounded">
                                                            <p className="text-lg font-bold text-red-600">{uploadDetail.failed_count}</p>
                                                            <p className="text-xs text-muted-foreground">Failed</p>
                                                        </div>
                                                        <div className="text-center p-2 bg-purple-50 rounded">
                                                            <p className="text-lg font-bold text-purple-600">{uploadDetail.new_owners_count}</p>
                                                            <p className="text-xs text-muted-foreground">New Owners</p>
                                                        </div>
                                                    </div>

                                                    {/* Duration */}
                                                    {uploadDetail.completed_at && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Duration: {Math.round((new Date(uploadDetail.completed_at).getTime() - new Date(uploadDetail.created_at).getTime()) / 1000)}s
                                                        </p>
                                                    )}

                                                    {/* Error Summary */}
                                                    {uploadDetail.errors.length > 0 && (
                                                        <div className="bg-red-50 border border-red-200 rounded p-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-medium text-red-800">
                                                                    {uploadDetail.errors.length} error{uploadDetail.errors.length > 1 ? 's' : ''}
                                                                </span>
                                                                <Button variant="ghost" size="sm" onClick={downloadPastErrors} className="text-xs h-6 px-2 gap-1">
                                                                    <Download className="h-3 w-3" />
                                                                    Errors CSV
                                                                </Button>
                                                            </div>
                                                            <div className="text-xs text-red-700 max-h-24 overflow-y-auto space-y-0.5">
                                                                {uploadDetail.errors.slice(0, 5).map((err, i) => (
                                                                    <p key={i}>• {err}</p>
                                                                ))}
                                                                {uploadDetail.errors.length > 5 && (
                                                                    <p className="font-medium">...and {uploadDetail.errors.length - 5} more</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-2">
                                                        {uploadDetail.credentials_count > 0 && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => downloadPastCredentials(uploadDetail.id)}
                                                                className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                                                            >
                                                                <Key className="h-3 w-3" />
                                                                Download {uploadDetail.credentials_count} Credentials
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="py-4 text-center text-sm text-muted-foreground">Failed to load details</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
