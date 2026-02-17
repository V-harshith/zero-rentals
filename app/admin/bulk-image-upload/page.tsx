"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Image as ImageIcon, CheckCircle, XCircle, AlertTriangle, FolderOpen, Play, Trash2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import imageCompression from "browser-image-compression"
import { useSecureFetch } from "@/lib/csrf-context"

interface StagedImage {
    id: string
    file_name: string
    original_name: string
    extracted_psn: string
    status: string
    file_size: number
    created_at: string
    error_message?: string
}

interface StagingSummary {
    pending: number
    assigned: number
    failed: number
    orphaned: number
    total: number
}

export default function BulkImageUploadPage() {
    const router = useRouter()
    const secureFetch = useSecureFetch()
    const [images, setImages] = useState<File[]>([])
    const [idColumn, setIdColumn] = useState("PSN")
    const [uploading, setUploading] = useState(false)
    const [assigning, setAssigning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("")
    const [results, setResults] = useState<{
        total: number
        success: number
        failed: number
        errors: string[]
        stagedCount?: number
        imagesByPsn?: Record<string, number>
    } | null>(null)
    const [stagedImages, setStagedImages] = useState<StagedImage[]>([])
    const [summary, setSummary] = useState<StagingSummary | null>(null)
    const [activeTab, setActiveTab] = useState("upload")
    const [assignmentResults, setAssignmentResults] = useState<{
        total: number
        success: number
        failed: number
        orphaned: number
        matchedProperties: number
        totalUniquePsns: number
    } | null>(null)

    // Fetch staged images on mount and when tab changes
    const fetchStagedImages = useCallback(async () => {
        try {
            const response = await secureFetch('/api/admin/bulk-image-upload?status=pending')
            if (!response.ok) throw new Error('Failed to fetch staged images')
            const data = await response.json()
            setStagedImages(data.images || [])
            setSummary(data.summary || null)
        } catch (error) {
            console.error('Error fetching staged images:', error)
        }
    }, [])

    useEffect(() => {
        if (activeTab === 'review') {
            fetchStagedImages()
        }
    }, [activeTab, fetchStagedImages])

    // Compress images before upload
    const compressImages = async (files: File[]): Promise<File[]> => {
        const compressedFiles: File[] = []
        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/jpeg',
        }

        for (const file of files) {
            try {
                // Only compress if file is larger than 1MB
                if (file.size > 1024 * 1024) {
                    const compressed = await imageCompression(file, options)
                    compressedFiles.push(compressed)
                } else {
                    compressedFiles.push(file)
                }
            } catch (error) {
                console.error(`Failed to compress ${file.name}:`, error)
                compressedFiles.push(file) // Use original if compression fails
            }
        }

        return compressedFiles
    }

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const fileList = Array.from(e.target.files)
            const imageFiles = fileList.filter(file =>
                file.type.startsWith('image/')
            )

            if (imageFiles.length !== fileList.length) {
                toast.error("Some files were skipped (only images allowed)")
            }

            // Compress images
            toast.info("Compressing images...")
            const compressed = await compressImages(imageFiles)
            const totalSaved = imageFiles.reduce((sum, orig, i) =>
                sum + (orig.size - (compressed[i]?.size || orig.size)), 0
            )

            setImages(compressed)
            setResults(null)
            toast.success(`${compressed.length} images selected` +
                (totalSaved > 0 ? ` (${(totalSaved / 1024 / 1024).toFixed(2)}MB saved)` : ''))
        }
    }

    const handleUpload = async () => {
        if (images.length === 0) {
            toast.error("Please select images first")
            return
        }

        setUploading(true)
        setProgress(0)
        setStatus("Uploading...")
        setResults(null)

        try {
            const formData = new FormData()
            images.forEach(image => formData.append('images', image))
            formData.append('idColumn', idColumn)

            const response = await secureFetch('/api/admin/bulk-image-upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error('Upload failed')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n').filter(line => line.trim())

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line)

                            if (data.error) {
                                toast.error(data.error)
                                setUploading(false)
                                return
                            }

                            if (data.progress !== undefined) {
                                setProgress(data.progress)
                                setStatus(data.status || `Processing ${data.processed}/${data.total}...`)
                            }

                            if (data.results) {
                                setResults(data.results)
                                if (data.results.failed === 0) {
                                    toast.success(`Successfully staged ${data.results.success} images!`)
                                    // Switch to review tab
                                    setActiveTab('review')
                                } else {
                                    toast.warning(`Staged ${data.results.success} images with ${data.results.failed} errors`)
                                }
                            }
                        } catch (e) {
                            console.error('Parse error:', e)
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast.error("Failed to upload images")
        } finally {
            setUploading(false)
            setImages([])
        }
    }

    const handleAssign = async () => {
        if (!summary || summary.pending === 0) {
            toast.error("No pending images to assign")
            return
        }

        setAssigning(true)
        setProgress(0)
        setStatus("Matching images to properties...")
        setAssignmentResults(null)

        try {
            const response = await secureFetch('/api/admin/bulk-image-upload/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idColumn: idColumn.toLowerCase() }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Assignment failed')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n').filter(line => line.trim())

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line)

                            if (data.error) {
                                toast.error(data.error)
                                setAssigning(false)
                                return
                            }

                            if (data.progress !== undefined) {
                                setProgress(data.progress)
                                setStatus(`Processing ${data.processed}/${data.total}...`)
                            }

                            if (data.results) {
                                setAssignmentResults(data.results)
                                if (data.results.failed === 0 && data.results.orphaned === 0) {
                                    toast.success(`Successfully assigned all ${data.results.success} images!`)
                                } else {
                                    toast.warning(
                                        `Assigned ${data.results.success}, Failed: ${data.results.failed}, Orphaned: ${data.results.orphaned}`
                                    )
                                }
                                // Refresh staged images
                                fetchStagedImages()
                            }
                        } catch (e) {
                            console.error('Parse error:', e)
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error('Assignment error:', error)
            toast.error(error.message || "Failed to assign images")
        } finally {
            setAssigning(false)
        }
    }

    const clearStaged = async () => {
        if (!confirm('Are you sure you want to clear all staged images?')) return

        try {
            const response = await secureFetch('/api/admin/bulk-image-upload/clear', {
                method: 'POST'
            })

            if (!response.ok) throw new Error('Failed to clear staged images')

            toast.success('Staged images cleared')
            fetchStagedImages()
        } catch (error) {
            toast.error('Failed to clear staged images')
        }
    }

    // Group staged images by PSN
    const imagesByPsn = stagedImages.reduce((acc, img) => {
        if (!acc[img.extracted_psn]) acc[img.extracted_psn] = []
        acc[img.extracted_psn].push(img)
        return acc
    }, {} as Record<string, StagedImage[]>)

    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-5xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Bulk Image Upload</h1>
                    <p className="text-muted-foreground">
                        Upload property images in bulk and assign them to properties by PSN
                    </p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="upload">
                            <Upload className="h-4 w-4 mr-2" />
                            1. Upload Images
                        </TabsTrigger>
                        <TabsTrigger value="review">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            2. Review & Assign
                            {summary && summary.pending > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                    {summary.pending}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="space-y-6">
                        {/* Instructions */}
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                <strong>Two-Step Process:</strong>
                                <div className="mt-2 text-sm space-y-1">
                                    <p>1. Upload images to staging area (images are compressed automatically)</p>
                                    <p>2. Review and click "Assign to Properties" to match with database</p>
                                </div>
                            </AlertDescription>
                        </Alert>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ImageIcon className="h-5 w-5" />
                                    Upload to Staging
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* ID Column Input */}
                                <div className="space-y-2">
                                    <Label htmlFor="idColumn">Property ID Column Name</Label>
                                    <Input
                                        id="idColumn"
                                        placeholder="PSN"
                                        value={idColumn}
                                        onChange={(e) => setIdColumn(e.target.value)}
                                        disabled={uploading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        The column in your Excel that contains the property ID (PSN, Property_ID, etc.)
                                    </p>
                                </div>

                                {/* Image Upload */}
                                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                                    <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                    <h3 className="font-semibold mb-2">Select Property Images</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Images will be compressed automatically (max 1MB each)
                                    </p>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageSelect}
                                        className="hidden"
                                        id="image-upload"
                                        disabled={uploading}
                                    />
                                    <label htmlFor="image-upload">
                                        <Button variant="outline" disabled={uploading} asChild>
                                            <span>Select Images</span>
                                        </Button>
                                    </label>
                                    {images.length > 0 && (
                                        <div className="mt-4 p-3 bg-muted rounded-lg">
                                            <p className="text-sm font-semibold">{images.length} images selected</p>
                                            <p className="text-xs text-muted-foreground">
                                                Total size: {(images.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Image Naming Examples */}
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        <strong>Supported Image Naming:</strong>
                                        <div className="mt-2 text-xs space-y-1 font-mono">
                                            <p>• <code>155.jpg</code> → Property PSN: 155</p>
                                            <p>• <code>155-1.jpg</code>, <code>155-2.jpg</code> → Property PSN: 155</p>
                                            <p>• <code>PSN-155.png</code> → Property PSN: 155</p>
                                        </div>
                                    </AlertDescription>
                                </Alert>

                                {/* Progress */}
                                {uploading && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span>{status}</span>
                                            <span>{progress}%</span>
                                        </div>
                                        <Progress value={progress} />
                                    </div>
                                )}

                                {/* Results */}
                                {results && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <Card>
                                                <CardContent className="pt-6 text-center">
                                                    <p className="text-2xl font-bold">{results.total}</p>
                                                    <p className="text-sm text-muted-foreground">Total</p>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardContent className="pt-6 text-center">
                                                    <p className="text-2xl font-bold text-green-600">{results.success}</p>
                                                    <p className="text-sm text-muted-foreground">Staged</p>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardContent className="pt-6 text-center">
                                                    <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                                                    <p className="text-sm text-muted-foreground">Failed</p>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        {results.imagesByPsn && Object.keys(results.imagesByPsn).length > 0 && (
                                            <Alert>
                                                <CheckCircle className="h-4 w-4" />
                                                <AlertDescription>
                                                    <strong>Staged by Property ID:</strong>
                                                    <div className="mt-2 text-xs grid grid-cols-4 gap-2">
                                                        {Object.entries(results.imagesByPsn).map(([psn, count]) => (
                                                            <span key={psn}>
                                                                PSN {psn}: {count} images
                                                            </span>
                                                        ))}
                                                    </div>
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {results.errors.length > 0 && (
                                            <Alert variant="destructive">
                                                <XCircle className="h-4 w-4" />
                                                <AlertDescription>
                                                    <strong>Errors:</strong>
                                                    <div className="mt-2 text-xs max-h-32 overflow-y-auto">
                                                        {results.errors.slice(0, 10).map((error, index) => (
                                                            <p key={index}>• {error}</p>
                                                        ))}
                                                    </div>
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <Button
                                        onClick={handleUpload}
                                        disabled={images.length === 0 || uploading}
                                        className="flex-1"
                                        size="lg"
                                    >
                                        {uploading ? (
                                            <>Staging...</>
                                        ) : (
                                            <>
                                                <Upload className="h-4 w-4 mr-2" />
                                                Stage {images.length} Images
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push('/dashboard/admin')}
                                        disabled={uploading}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="review" className="space-y-6">
                        {/* Summary Stats */}
                        {summary && (
                            <div className="grid grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-3xl font-bold">{summary.pending}</p>
                                        <p className="text-sm text-muted-foreground">Pending</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-3xl font-bold text-green-600">{summary.assigned}</p>
                                        <p className="text-sm text-muted-foreground">Assigned</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-3xl font-bold text-red-600">{summary.failed}</p>
                                        <p className="text-sm text-muted-foreground">Failed</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-3xl font-bold text-orange-600">{summary.orphaned}</p>
                                        <p className="text-sm text-muted-foreground">Orphaned</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Assignment Progress */}
                        {assigning && (
                            <Card>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{status}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <Progress value={progress} />
                                </CardContent>
                            </Card>
                        )}

                        {/* Assignment Results */}
                        {assignmentResults && (
                            <Alert className={assignmentResults.failed === 0 && assignmentResults.orphaned === 0 ? 'border-green-500' : ''}>
                                <CheckCircle className={`h-4 w-4 ${assignmentResults.failed === 0 && assignmentResults.orphaned === 0 ? 'text-green-500' : ''}`} />
                                <AlertDescription>
                                    <strong>Assignment Complete:</strong>
                                    <div className="mt-2 text-sm grid grid-cols-2 gap-2">
                                        <p>✓ Assigned: {assignmentResults.success}</p>
                                        <p>✗ Failed: {assignmentResults.failed}</p>
                                        <p>⚠ Orphaned: {assignmentResults.orphaned}</p>
                                        <p>📊 Matched Properties: {assignmentResults.matchedProperties}/{assignmentResults.totalUniquePsns}</p>
                                    </div>
                                    {assignmentResults.orphaned > 0 && (
                                        <p className="mt-2 text-xs text-orange-600">
                                            Orphaned images: No matching properties found for these PSN numbers.
                                            Make sure you uploaded the Excel file first.
                                        </p>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Staged Images by PSN */}
                        {Object.keys(imagesByPsn).length > 0 ? (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Staged Images by Property ID</CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchStagedImages}
                                        disabled={assigning}
                                    >
                                        <RefreshCw className="h-4 w-4 mr-1" />
                                        Refresh
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {Object.entries(imagesByPsn).map(([psn, images]) => (
                                        <div key={psn} className="border rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold">PSN: {psn}</span>
                                                    <Badge variant="secondary">{images.length} images</Badge>
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                {images.slice(0, 5).map(img => (
                                                    <p key={img.id}>{img.original_name}</p>
                                                ))}
                                                {images.length > 5 && (
                                                    <p>...and {images.length - 5} more</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardContent className="pt-12 pb-12 text-center">
                                    <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                    <p className="text-muted-foreground">No pending images in staging</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Go to the Upload tab to add images
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                onClick={handleAssign}
                                disabled={!summary || summary.pending === 0 || assigning}
                                className="flex-1"
                                size="lg"
                                variant={summary && summary.pending > 0 ? "default" : "outline"}
                            >
                                {assigning ? (
                                    <>Assigning...</>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Assign {summary?.pending || 0} Images to Properties
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={clearStaged}
                                disabled={assigning || !summary || summary.total === 0}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Clear All
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
