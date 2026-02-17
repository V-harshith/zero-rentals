"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
    FileSpreadsheet,
    Upload,
    AlertTriangle,
    CheckCircle,
    Loader2,
    X,
    Download,
    ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { useSecureFetch } from "@/lib/csrf-context"

interface ExcelUploadStepProps {
    jobId: string
    onComplete: (data: any) => void
    onCancel?: () => void
}

export function ExcelUploadStep({ jobId, onComplete, onCancel }: ExcelUploadStepProps) {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [canProceed, setCanProceed] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const secureFetch = useSecureFetch()

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        // Validate file type
        if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
            toast.error("Please select an Excel file (.xlsx or .xls)")
            return
        }

        // Validate file size (max 10MB)
        if (selectedFile.size > 10 * 1024 * 1024) {
            toast.error("File too large. Maximum size is 10MB")
            return
        }

        setFile(selectedFile)
        setResult(null)
        setError(null)
    }

    const handleUpload = async () => {
        if (!file) return

        setUploading(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append("file", file)

            const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobId}/excel`, {
                method: "POST",
                body: formData,
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "Failed to upload Excel")
            }

            setResult(data)

            // Extract data for notifications
            const newOwners = data.new_owners || 0
            const existingOwners = data.existing_owners || 0
            const errors = data.errors || []

            if (data.valid_properties > 0) {
                // Detailed success notification
                toast.success(`Excel parsed: ${data.valid_properties} valid properties`, {
                    description: `${newOwners} new owners, ${existingOwners} existing accounts` + (errors.length > 0 ? `, ${errors.length} errors` : ''),
                })

                // Show PSN list for verification
                if (data.psn_list?.length > 0) {
                    toast.info(`PSNs found: ${data.psn_list.slice(0, 5).join(', ')}${data.psn_list.length > 5 ? ` and ${data.psn_list.length - 5} more` : ''}`, {
                        duration: 5000,
                    })
                }

                // Allow user to proceed - don't auto-advance
                setCanProceed(true)
            } else {
                toast.error("No valid properties found in Excel", {
                    description: data.errors?.length > 0 ? `Found ${data.errors.length} validation errors` : "Check required columns",
                    duration: 5000,
                })
            }
        } catch (err: any) {
            setError(err.message)
            toast.error(err.message)
        } finally {
            setUploading(false)
        }
    }

    const clearFile = () => {
        setFile(null)
        setResult(null)
        setError(null)
        setCanProceed(false)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleProceed = () => {
        if (result) {
            onComplete(result)
        }
    }

    const downloadTemplate = async () => {
        try {
            const response = await fetch('/api/admin/bulk-import/template')

            if (!response.ok) {
                throw new Error('Failed to download template')
            }

            // Get the blob from response
            const blob = await response.blob()

            // Create download link
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'zero-rentals-bulk-import-template.xlsx'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)

            toast.success('Template downloaded successfully')
        } catch (err: any) {
            toast.error(err.message || 'Failed to download template')
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Upload Excel File</h2>
                <p className="text-muted-foreground">
                    Upload your property data. Required columns: PSN, Property Name, Email, Owner Name, City, Area
                </p>
                {/* Upload Limits Info */}
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                    <Badge variant="outline" className="text-xs">
                        Max 500 images in next step
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        Max 10 images per property
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        Max 2MB per image
                    </Badge>
                </div>
            </div>

            {/* Download Template Button */}
            <div className="flex justify-center">
                <Button
                    variant="outline"
                    onClick={downloadTemplate}
                    className="gap-2"
                >
                    <Download className="h-4 w-4" />
                    Download Template
                </Button>
            </div>

            {/* File Upload Area */}
            {!file ? (
                <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium">Click to select Excel file</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        or drag and drop here
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Maximum file size: 10MB
                    </p>
                </div>
            ) : (
                <div className="border rounded-lg p-6 bg-muted/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                        </div>
                        {!uploading && !result && (
                            <Button variant="ghost" size="sm" onClick={clearFile}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Expected Format */}
            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    <strong>Required columns:</strong> PSN, Property Name, Email, Owner Name, Owner Contact, City, Area
                    <br />
                    <strong>Optional:</strong> Private Room, Double Sharing, Triple Sharing, Four Sharing, Deposit, Facilities, USP, Landmark, PG&apos;s for
                    <br />
                    <span className="text-xs text-muted-foreground mt-1 block">
                        Tip: Download the template above to see the correct format with sample data
                    </span>
                </AlertDescription>
            </Alert>

            {/* Error Display */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Result Display */}
            {result && (
                <div
                    className={`p-4 rounded-lg border ${
                        result.valid_properties > 0
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                    }`}
                >
                    <div className="flex items-center gap-2 mb-3">
                        {result.valid_properties > 0 ? (
                            <>
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <span className="font-semibold text-green-800">Excel Parsed Successfully</span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                <span className="font-semibold text-red-800">No Valid Properties Found</span>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold">{result.total_rows}</p>
                            <p className="text-xs text-muted-foreground">Total Rows</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-green-600">
                                {result.valid_properties}
                            </p>
                            <p className="text-xs text-muted-foreground">Valid</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-blue-600">{result.new_owners}</p>
                            <p className="text-xs text-muted-foreground">New Owners</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-purple-600">{result.existing_owners}</p>
                            <p className="text-xs text-muted-foreground">Existing</p>
                        </div>
                    </div>

                    {result.errors?.length > 0 && (
                        <div className="mt-3">
                            <p className="text-sm font-medium text-red-700 mb-1">
                                Errors ({result.errors.length}):
                            </p>
                            <div className="text-xs text-red-600 max-h-24 overflow-y-auto bg-red-50 p-2 rounded">
                                {result.errors.slice(0, 5).map((err: string, i: number) => (
                                    <p key={i}>• {err}</p>
                                ))}
                                {result.errors.length > 5 && (
                                    <p>...and {result.errors.length - 5} more</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Upload Button */}
            {file && !result && (
                <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    size="lg"
                    className="w-full"
                >
                    {uploading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Parsing Excel...
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload and Parse Excel
                        </>
                    )}
                </Button>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3">
                {onCancel && (
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={uploading}
                        className="flex-1"
                    >
                        Cancel Import
                    </Button>
                )}
                {canProceed && result && (
                    <Button
                        onClick={handleProceed}
                        size="lg"
                        className="flex-1 gap-2"
                    >
                        Next: Upload Images
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
