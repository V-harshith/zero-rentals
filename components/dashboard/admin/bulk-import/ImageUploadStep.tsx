"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
    Images,
    FolderOpen,
    AlertTriangle,
    CheckCircle,
    Loader2,
    ArrowLeft,
    ArrowRight,
    X,
} from "lucide-react"
import { toast } from "sonner"
import imageCompression from "browser-image-compression"
import { useSecureFetch } from "@/lib/csrf-context"

interface ImageUploadStepProps {
    jobId: string
    onComplete: (data: ImageUploadResult) => void
    onBack: () => void
    onCancel?: () => void
    onSkip?: () => void
}

interface ImageUploadResult {
    total_images: number
    matched_psns: number
    orphaned_images: number
    failed_uploads: number
    unmatched_psns?: string[]
    completed: boolean
    progress: number
    status: string
}

interface CompressionOptions {
    maxSizeMB: number
    maxWidthOrHeight: number
    useWebWorker: boolean
    fileType?: string
}

// Maximum recommended images per PSN
const MAX_IMAGES_PER_PSN = 10
// Hard limit for total images
const MAX_TOTAL_IMAGES = 500
// Batch limits for Vercel free tier
const MAX_BATCH_SIZE_MB = 3.0
const MAX_FILES_PER_BATCH = 4

export function ImageUploadStep({ jobId, onComplete, onBack, onCancel, onSkip }: ImageUploadStepProps) {
    const secureFetch = useSecureFetch()
    const [files, setFiles] = useState<File[]>([])
    const [compressedFiles, setCompressedFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [compressing, setCompressing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("")
    const [result, setResult] = useState<ImageUploadResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null)
    const [uploadComplete, setUploadComplete] = useState(false)
    const [warnings, setWarnings] = useState<string[]>([])
    const folderInputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const objectUrlsRef = useRef<string[]>([])

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
            objectUrlsRef.current = []
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [])

    // Fallback canvas-based compression when library fails
    const fallbackCanvasCompression = async (file: File, options: CompressionOptions): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            const url = URL.createObjectURL(file)
            objectUrlsRef.current.push(url)

            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img
                const maxDim = options.maxWidthOrHeight || 1920

                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = (height / width) * maxDim
                        width = maxDim
                    } else {
                        width = (width / height) * maxDim
                        height = maxDim
                    }
                }

                // Create canvas
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')

                if (!ctx) {
                    reject(new Error('Could not get canvas context'))
                    return
                }

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height)

                // Determine quality based on target size
                const targetSizeMB = options.maxSizeMB || 2
                const quality = targetSizeMB < 1 ? 0.6 : targetSizeMB < 2 ? 0.7 : 0.8

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob)
                        } else {
                            reject(new Error('Canvas toBlob failed'))
                        }
                    },
                    options.fileType || 'image/jpeg',
                    quality
                )
            }

            img.onerror = () => {
                reject(new Error('Failed to load image for compression'))
            }

            img.src = url
        })
    }

    // Compress images before upload (max 2MB target)
    // PRESERVES webkitRelativePath which is critical for PSN extraction
    const compressImages = useCallback(async (imageFiles: File[]): Promise<File[]> => {
        const compressed: File[] = []
        let originalSize = 0
        let compressedSize = 0

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i]
            setStatus(`Processing ${i + 1} of ${imageFiles.length}: ${file.name}...`)

            try {
                // Store the original webkitRelativePath before compression
                const originalPath = file.webkitRelativePath
                const fileSizeMB = file.size / 1024 / 1024

                let processedFile: File
                originalSize += file.size

                // Always compress images, but with different targets based on original size
                const options: CompressionOptions = {
                    maxSizeMB: fileSizeMB > 2 ? 2 : Math.max(0.5, fileSizeMB * 0.7),
                    maxWidthOrHeight: 1920,
                    useWebWorker: false, // Disabled to avoid CSP blob: script-src errors
                    fileType: 'image/jpeg',
                }

                // Compress all files, but be less aggressive on already-small files
                let compressedBlob: Blob
                try {
                    compressedBlob = await imageCompression(file, options)
                } catch {
                    // Try fallback canvas compression
                    compressedBlob = await fallbackCanvasCompression(file, options)
                }

                // Create new File from blob, preserving the original name and path
                processedFile = new File([compressedBlob], file.name, {
                    type: 'image/jpeg',
                    lastModified: file.lastModified,
                })

                compressedSize += compressedBlob.size

                // CRITICAL: Preserve webkitRelativePath for PSN extraction on server
                if (originalPath) {
                    Object.defineProperty(processedFile, 'webkitRelativePath', {
                        value: originalPath,
                        writable: false,
                        configurable: true,
                    })
                }

                compressed.push(processedFile)
            } catch {
                // Use original file if compression fails
                compressed.push(file)
                originalSize += file.size
                compressedSize += file.size
            }
        }

        setCompressionStats({
            original: originalSize / 1024 / 1024,
            compressed: compressedSize / 1024 / 1024,
        })

        return compressed
    }, [])

    const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || [])

        // Filter only image files
        const imageFiles = selectedFiles.filter(file =>
            file.type.startsWith('image/')
        )

        if (imageFiles.length === 0) {
            toast.error("No image files found in selected folder")
            return
        }

        if (imageFiles.length > 500) {
            toast.error("Too many images. Maximum is 500 images per import")
            return
        }

        setFiles(imageFiles)
        setResult(null)
        setError(null)
        setProgress(0)
        setCompressionStats(null)
        setWarnings([])

        // Pre-upload validation: Check image counts per PSN
        const psnCounts = imageFiles.reduce((acc, file) => {
            const path = file.webkitRelativePath || file.name
            const parts = path.split(/[/\\]/)
            // Use second-to-last part (folder name containing images) - matches server
            const psn = parts.length >= 2 ? parts[parts.length - 2] : null

            // PSN should be numeric (digits only) - matches server regex /^\d+$/
            if (psn && /^\d+$/.test(psn)) {
                acc[psn] = (acc[psn] || 0) + 1
            }
            return acc
        }, {} as Record<string, number>)

        const psnWarnings: string[] = []
        for (const [psn, count] of Object.entries(psnCounts)) {
            if (count > MAX_IMAGES_PER_PSN) {
                psnWarnings.push(
                    `Property ${psn} has ${count} images (max ${MAX_IMAGES_PER_PSN} recommended). Only first ${MAX_IMAGES_PER_PSN} will be used.`
                )
            }
        }

        if (psnWarnings.length > 0) {
            setWarnings(psnWarnings)
            toast.warning(`${psnWarnings.length} propert${psnWarnings.length === 1 ? 'y' : 'ies'} exceed the recommended image limit`, {
                description: "Only the first 10 images per property will be used",
                duration: 6000,
            })
        }

        // Compress images
        setCompressing(true)
        try {
            const compressed = await compressImages(imageFiles)
            setCompressedFiles(compressed)

            // Calculate actual savings
            const originalTotal = imageFiles.reduce((sum, f) => sum + f.size, 0)
            const compressedTotal = compressed.reduce((sum, f) => sum + f.size, 0)
            const savedMB = (originalTotal - compressedTotal) / 1024 / 1024
            const savingsPercent = originalTotal > 0 ? ((originalTotal - compressedTotal) / originalTotal * 100).toFixed(1) : '0'

            if (savedMB > 0.1) {
                toast.success(`Compressed ${imageFiles.length} images`, {
                    description: `Saved ${savedMB.toFixed(2)} MB (${savingsPercent}%)`,
                })
            } else {
                toast.info(`${imageFiles.length} images processed`, {
                    description: "Images were already optimally compressed",
                })
            }
        } catch (err) {
            toast.error("Image compression failed, using original files")
            setCompressedFiles(imageFiles)
        } finally {
            setCompressing(false)
            setStatus("")
        }
    }, [])

    const MAX_BATCH_SIZE_MB = 3.0 // Stay safely under Vercel's 4.5MB limit (headers add overhead)
    const MAX_FILES_PER_BATCH = 4 // Conservative limit for 10s timeout

    const createBatches = (files: File[]): File[][] => {
        const batches: File[][] = []
        let currentBatch: File[] = []
        let currentBatchSize = 0

        for (const file of files) {
            const fileSizeMB = file.size / 1024 / 1024

            // If single file is too large, we'll try to upload it anyway
            // (compression should have handled this)
            if (currentBatch.length >= MAX_FILES_PER_BATCH ||
                (currentBatchSize + fileSizeMB > MAX_BATCH_SIZE_MB && currentBatch.length > 0)) {
                batches.push(currentBatch)
                currentBatch = []
                currentBatchSize = 0
            }

            currentBatch.push(file)
            currentBatchSize += fileSizeMB
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch)
        }

        return batches
    }

    const handleUpload = async () => {
        const filesToUpload = compressedFiles.length > 0 ? compressedFiles : files
        if (filesToUpload.length === 0) return

        setUploading(true)
        setError(null)
        setStatus("Preparing upload batches...")

        // Create batches to stay under Vercel's 4.5MB limit
        const batches = createBatches(filesToUpload)

        const allResults: ImageUploadResult[] = []
        let totalUploaded = 0
        let totalFailed = 0

        // Create new abort controller for this upload
        abortControllerRef.current = new AbortController()

        try {
            let globalFileIndex = 0
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex]
                setStatus(`Uploading batch ${batchIndex + 1} of ${batches.length} (${batch.length} files)...`)

                const formData = new FormData()

                batch.forEach((file) => {
                    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
                    // Use GLOBAL index across all batches to prevent index collision
                    formData.append(`image_${globalFileIndex}`, file)
                    formData.append(`path_${globalFileIndex}`, path)
                    globalFileIndex++
                })

                const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobId}/images`, {
                    method: "POST",
                    body: formData,
                    signal: abortControllerRef.current.signal,
                })

                if (!res.ok) {
                    const contentType = res.headers.get('content-type') || ''
                    let errorMessage = `Upload failed: ${res.status} ${res.statusText}`

                    if (contentType.includes('application/json')) {
                        try {
                            const errorData = await res.json()
                            errorMessage = errorData.error || errorData.message || errorMessage
                        } catch {
                            // JSON parsing failed, use default message
                        }
                    } else {
                        if (res.status === 413) {
                            errorMessage = "File size too large. Try selecting fewer images or reducing image quality."
                        } else if (res.status === 429) {
                            errorMessage = "Rate limit exceeded. Please wait a moment and try again."
                        } else if (res.status >= 500) {
                            errorMessage = "Server error. Please try again later or contact support."
                        }
                    }

                    // If a batch fails, mark all files in that batch as failed
                    totalFailed += batch.length

                    // Continue with next batch instead of failing completely
                    if (batchIndex < batches.length - 1) {
                        toast.error(`Batch ${batchIndex + 1} failed: ${errorMessage}`, {
                            description: "Continuing with next batch..."
                        })
                        continue
                    } else {
                        throw new Error(errorMessage)
                    }
                }

                // Handle streaming response for this batch
                const reader = res.body?.getReader()
                const decoder = new TextDecoder()

                if (reader) {
                    let buffer = ""

                    while (true) {
                        const { done, value } = await reader.read()

                        if (done) {
                            // Process any remaining data in buffer
                            if (buffer.trim()) {
                                try {
                                    const data = JSON.parse(buffer.trim()) as {
                                        error?: string
                                        progress?: number
                                        status?: string
                                        completed?: boolean
                                        total_images?: number
                                        matched_psns?: number
                                        orphaned_images?: number
                                        failed_uploads?: number
                                        unmatched_psns?: string[]
                                    }
                                    if (data.progress === 100 || data.completed) {
                                        allResults.push({
                                            total_images: data.total_images || totalUploaded,
                                            matched_psns: data.matched_psns || 0,
                                            orphaned_images: data.orphaned_images || 0,
                                            failed_uploads: data.failed_uploads || 0,
                                            unmatched_psns: data.unmatched_psns || [],
                                            completed: true,
                                            progress: 100,
                                            status: data.status || "Images uploaded successfully"
                                        })
                                    }
                                } catch {
                                    // Ignore parse errors on final buffer
                                }
                            }
                            break
                        }

                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split("\n")
                        buffer = lines.pop() || ""

                        for (const line of lines) {
                            if (!line.trim()) continue

                            let data: {
                                error?: string
                                progress?: number
                                status?: string
                                completed?: boolean
                                total_images?: number
                                matched_psns?: number
                                orphaned_images?: number
                                failed_uploads?: number
                                unmatched_psns?: string[]
                            }
                            try {
                                data = JSON.parse(line) as typeof data

                                if (data.error) {
                                    throw new Error(data.error)
                                }

                                if (data.progress !== undefined) {
                                    // Calculate overall progress across all batches
                                    const batchProgress = data.progress / 100
                                    const overallProgress = ((batchIndex + batchProgress) / batches.length) * 100
                                    setProgress(Math.round(overallProgress))
                                }

                                if (data.status) {
                                    setStatus(`Batch ${batchIndex + 1}/${batches.length}: ${data.status}`)
                                }

                                if (data.completed || data.progress === 100) {
                                    // Server sends aggregate data in final response - use it directly
                                    allResults.push({
                                        total_images: data.total_images || totalUploaded,
                                        matched_psns: data.matched_psns || 0,
                                        orphaned_images: data.orphaned_images || 0,
                                        failed_uploads: data.failed_uploads || 0,
                                        unmatched_psns: data.unmatched_psns || [],
                                        completed: true,
                                        progress: 100,
                                        status: data.status || "Images uploaded successfully"
                                    })
                                }
                            } catch (parseError: unknown) {
                                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError)
                                if (errorMessage &&
                                    errorMessage !== 'Unexpected end of JSON input' &&
                                    !errorMessage.includes('JSON')) {
                                    throw parseError
                                }
                            }
                        }
                    }
                }
            }

            // All batches completed - use server's final result
            const lastResult = allResults[allResults.length - 1]
            // Server returns aggregate data in the final response
            const finalResult: ImageUploadResult = lastResult || {
                total_images: totalUploaded,
                failed_uploads: totalFailed,
                matched_psns: 0,
                orphaned_images: 0,
                completed: true,
                progress: 100,
                status: "Images uploaded successfully"
            }

            setResult(finalResult)
            setUploadComplete(true)
            setProgress(100)

            if (totalUploaded > 0) {
                toast.success(`Successfully uploaded ${totalUploaded} images`)
            }

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                setError("Upload cancelled")
                toast.info("Upload cancelled")
            } else {
                const errorMessage = err instanceof Error ? err.message : "Image upload failed"
                setError(errorMessage)
                toast.error("Image Upload Failed", {
                    description: errorMessage,
                    duration: 8000,
                })
            }
        } finally {
            setUploading(false)
            abortControllerRef.current = null
        }
    }

    const clearFiles = () => {
        setFiles([])
        setCompressedFiles([])
        setCompressionStats(null)
        setResult(null)
        setError(null)
        setProgress(0)
        setStatus("")
        setUploadComplete(false)
        setWarnings([])
        if (folderInputRef.current) {
            folderInputRef.current.value = ""
        }
    }

    const handleProceed = () => {
        if (result) {
            onComplete(result)
        }
    }

    // Extract PSN info from files for preview (matches server-side logic)
    // Use compressedFiles if available, otherwise use original files
    const filesForPreview = compressedFiles.length > 0 ? compressedFiles : files
    const psnInfo = filesForPreview.reduce((acc, file) => {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        const parts = path.split(/[/\\]/)
        const psn = parts.length >= 2 ? parts[parts.length - 2] : null

        if (psn && /^\d+$/.test(psn)) {
            acc[psn] = (acc[psn] || 0) + 1
        }
        return acc
    }, {} as Record<string, number>)

    const psnList = Object.keys(psnInfo).sort()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Upload Image Folder</h2>
                <p className="text-muted-foreground">
                    Select a folder containing property images organized by PSN subfolders
                </p>
                {/* Upload Limits Info */}
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                    <Badge variant="outline" className="text-xs">
                        Max {MAX_TOTAL_IMAGES} images total
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        Max {MAX_IMAGES_PER_PSN} images per property
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        Max 2MB per image
                    </Badge>
                </div>
            </div>

            {/* Folder Upload Area */}
            {files.length === 0 ? (
                <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => folderInputRef.current?.click()}
                >
                    <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-expect-error - webkitdirectory is non-standard but needed for folder upload
                        webkitdirectory=""
                        directory=""
                        multiple
                        onChange={handleFolderSelect}
                        className="hidden"
                    />
                    <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium">Click to select folder</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Folder should contain subfolders named by PSN number
                    </p>
                </div>
            ) : (
                <div className="border rounded-lg p-6 bg-muted/30">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <Images className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-medium">{files.length} images selected</p>
                                <p className="text-sm text-muted-foreground">
                                    Total size: {(files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                                    {compressionStats && (
                                        <span className="text-green-600 ml-2">
                                            → {compressionStats.compressed.toFixed(2)} MB
                                            ({((1 - compressionStats.compressed / compressionStats.original) * 100).toFixed(0)}% saved)
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        {!uploading && !result && (
                            <Button variant="ghost" size="sm" onClick={clearFiles}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* PSN Detection Preview */}
                    {psnList.length > 0 && (
                        <div className="mt-4">
                            <p className="text-sm font-medium mb-2">Detected PSN folders:</p>
                            <div className="flex flex-wrap gap-2">
                                {psnList.slice(0, 10).map(psn => (
                                    <Badge key={psn} variant="outline" className={psnInfo[psn] > MAX_IMAGES_PER_PSN ? "border-yellow-500 text-yellow-700 bg-yellow-50" : ""}>
                                        {psn} ({psnInfo[psn]} imgs)
                                        {psnInfo[psn] > MAX_IMAGES_PER_PSN && " ⚠"}
                                    </Badge>
                                ))}
                                {psnList.length > 10 && (
                                    <Badge variant="outline">+{psnList.length - 10} more</Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Pre-upload Warnings */}
                    {warnings.length > 0 && !uploadComplete && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm font-medium text-yellow-800 mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Image Limit Warnings:
                            </p>
                            <ul className="text-xs text-yellow-700 space-y-1">
                                {warnings.map((warning, idx) => (
                                    <li key={idx}>• {warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Expected Structure */}
            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    <strong>Expected folder structure:</strong>
                    <pre className="mt-2 text-xs bg-muted p-2 rounded">
{`YourFolder/
├── 1053/
│   ├── image1.jpg
│   └── image2.jpg
├── 1054/
│   └── image1.jpg
└── ...`}
                    </pre>
                    <p className="mt-2 text-xs">
                        PSN is extracted from subfolder names (e.g., &quot;1053&quot; folder = PSN 1053)
                    </p>
                </AlertDescription>
            </Alert>

            {/* Error Display */}
            {error && (
                <Alert variant="destructive" className="border-red-500 bg-red-50">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <AlertDescription className="ml-2">
                        <div className="font-semibold text-red-800 mb-1">Upload Failed</div>
                        <div className="text-red-700">{error}</div>
                        <div className="mt-2 text-xs text-red-600">
                            <strong>Troubleshooting:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Images are uploaded in batches of 5 files maximum</li>
                                <li>Each image is automatically compressed to under 2MB</li>
                                <li>Maximum 500 images per import</li>
                                <li>Supported formats: JPG, PNG, WebP</li>
                            </ul>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Result Display */}
            {result && (
                <div className={`p-4 rounded-lg border ${result.total_images > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-2 mb-3">
                        {result.total_images > 0 ? (
                            <>
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <span className="font-semibold text-green-800">Images Uploaded Successfully</span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                <span className="font-semibold text-red-800">Upload Failed</span>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold">{result.total_images}</p>
                            <p className="text-xs text-muted-foreground">Uploaded</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-green-600">{result.matched_psns}</p>
                            <p className="text-xs text-muted-foreground">Matched PSNs</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-orange-600">{result.orphaned_images}</p>
                            <p className="text-xs text-muted-foreground">Orphaned</p>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <p className="text-lg font-bold text-red-600">{result.failed_uploads || 0}</p>
                            <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                    </div>

                    {result.unmatched_psns && result.unmatched_psns.length > 0 && (
                        <div className="mt-3">
                            <p className="text-sm text-orange-700">
                                ⚠ {result.unmatched_psns.length} properties have no images
                            </p>
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm font-medium text-yellow-800 mb-2">
                                ⚠ Image Limit Warnings:
                            </p>
                            <ul className="text-xs text-yellow-700 space-y-1">
                                {warnings.map((warning, idx) => (
                                    <li key={idx}>• {warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Upload/Compression Progress */}
            {uploading && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-blue-800">{status}</span>
                        <span className="text-blue-600">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>
            )}

            {/* Compression-only indicator (when not yet uploading) */}
            {compressing && !uploading && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">{status}</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-blue-600">
                        Compressing images to max 2MB for faster upload
                    </p>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={uploading || compressing}
                    className="w-full sm:w-auto"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>

                {onCancel && (
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={uploading || compressing}
                        className="text-muted-foreground w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                )}

                {files.length > 0 && !uploadComplete && (
                    <Button
                        onClick={handleUpload}
                        disabled={uploading || compressing || (compressedFiles.length === 0 && files.length === 0)}
                        className="flex-1 w-full sm:w-auto"
                    >
                        {compressing ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Compressing...
                            </>
                        ) : uploading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Images className="h-4 w-4 mr-2" />
                                Upload {compressedFiles.length || files.length} Images
                            </>
                        )}
                    </Button>
                )}

                {uploadComplete && result && (
                    <Button
                        onClick={handleProceed}
                        className="flex-1 gap-2 w-full sm:w-auto"
                    >
                        Next: Review Import
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}

                {!uploadComplete && files.length === 0 && onSkip && (
                    <Button
                        variant="outline"
                        onClick={onSkip}
                        disabled={uploading || compressing}
                        className="flex-1 w-full sm:w-auto"
                    >
                        Skip Images
                    </Button>
                )}
            </div>
        </div>
    )
}
