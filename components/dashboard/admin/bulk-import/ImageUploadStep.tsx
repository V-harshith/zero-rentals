"use client"

import { useState, useRef, useCallback } from "react"
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
    ImageOff,
} from "lucide-react"
import { toast } from "sonner"
import imageCompression from "browser-image-compression"
import { useSecureFetch } from "@/lib/csrf-context"

interface ImageUploadStepProps {
    jobId: string
    onComplete: (data: any) => void
    onBack: () => void
    onCancel?: () => void
    onSkip?: () => void
}

export function ImageUploadStep({ jobId, onComplete, onBack, onCancel, onSkip }: ImageUploadStepProps) {
    const secureFetch = useSecureFetch()
    const [files, setFiles] = useState<File[]>([])
    const [compressedFiles, setCompressedFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [compressing, setCompressing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [status, setStatus] = useState("")
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null)
    const [uploadComplete, setUploadComplete] = useState(false)
    const [warnings, setWarnings] = useState<string[]>([])
    const folderInputRef = useRef<HTMLInputElement>(null)

    // Maximum recommended images per PSN
    const MAX_IMAGES_PER_PSN = 10
    // Hard limit for total images
    const MAX_TOTAL_IMAGES = 500

    // Compress images before upload (max 2MB)
    // PRESERVES webkitRelativePath which is critical for PSN extraction
    const compressImages = async (imageFiles: File[]): Promise<File[]> => {
        const options = {
            maxSizeMB: 2,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/jpeg',
        }

        const compressed: File[] = []
        let originalSize = 0
        let compressedSize = 0

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i]
            setStatus(`Compressing ${i + 1} of ${imageFiles.length}: ${file.name}...`)

            try {
                // Store the original webkitRelativePath before compression
                const originalPath = file.webkitRelativePath
                console.log(`[Compression] Processing file ${i + 1}/${imageFiles.length}: "${file.name}", path: "${originalPath || 'N/A'}"`)

                let processedFile: File

                // Only compress if file is larger than 2MB
                if (file.size > 2 * 1024 * 1024) {
                    const compressedBlob = await imageCompression(file, options)
                    // Create new File from blob, preserving the original name and path
                    processedFile = new File([compressedBlob], file.name, {
                        type: 'image/jpeg',
                        lastModified: file.lastModified,
                    })
                    originalSize += file.size
                    compressedSize += compressedBlob.size
                    console.log(`[Compression] Compressed "${file.name}": ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`)
                } else {
                    processedFile = file
                    originalSize += file.size
                    compressedSize += file.size
                    console.log(`[Compression] Skipped "${file.name}" (already under 2MB)`)
                }

                // CRITICAL: Preserve webkitRelativePath for PSN extraction on server
                if (originalPath) {
                    Object.defineProperty(processedFile, 'webkitRelativePath', {
                        value: originalPath,
                        writable: false,
                        configurable: true,
                    })
                    console.log(`[Compression] Preserved path for "${file.name}": "${originalPath}"`)
                }

                compressed.push(processedFile)
            } catch (err) {
                console.error('[Compression] Failed for', file.name, err)
                // Use original file if compression fails, but ensure path is preserved
                compressed.push(file)
                originalSize += file.size
                compressedSize += file.size
            }
        }

        setCompressionStats({
            original: originalSize / 1024 / 1024,
            compressed: compressedSize / 1024 / 1024,
        })

        console.log(`[Compression] Complete. Total files: ${compressed.length}, Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB, Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`)
        return compressed
    }

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
            const saved = imageFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024 -
                         compressed.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024
            toast.success(`Compressed ${imageFiles.length} images. Saved ${saved.toFixed(2)} MB`)
        } catch (err) {
            toast.error("Some images failed to compress, using originals")
            setCompressedFiles(imageFiles)
        } finally {
            setCompressing(false)
            setStatus("")
        }
    }, [])

    const handleUpload = async () => {
        const filesToUpload = compressedFiles.length > 0 ? compressedFiles : files
        if (filesToUpload.length === 0) return

        setUploading(true)
        setError(null)
        setStatus("Uploading images...")

        try {
            const formData = new FormData()
            console.log(`[Upload] Preparing ${filesToUpload.length} files for upload...`)

            filesToUpload.forEach((file, index) => {
                // The compressed file should already have webkitRelativePath preserved
                // But we double-check and log for debugging
                const path = (file as any).webkitRelativePath || file.name
                console.log(`[Upload] Appending file ${index + 1}: "${file.name}", path: "${path}"`)

                // Append directly - webkitRelativePath was preserved during compression
                formData.append("images", file)
            })

            const res = await secureFetch(`/api/admin/bulk-import/jobs/${jobId}/images`, {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const errorData = await res.json()
                throw new Error(errorData.error || "Failed to upload images")
            }

            // Handle streaming response
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()

            if (reader) {
                let buffer = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""

                    for (const line of lines) {
                        if (!line.trim()) continue

                        try {
                            const data = JSON.parse(line)
                            console.log('[Upload] Received:', data)

                            if (data.error) {
                                throw new Error(data.error)
                            }

                            if (data.progress !== undefined) {
                                setProgress(data.progress)
                            }

                            if (data.status) {
                                setStatus(data.status)
                            }

                            // Handle warnings from API response
                            if (data.warnings && data.warnings.length > 0) {
                                setWarnings(data.warnings)
                            }

                            // Log detailed progress info
                            if (data.matched_psns !== undefined) {
                                console.log(`[Upload] Progress: ${data.progress}%, Matched PSNs: ${data.matched_psns}, Orphaned: ${data.orphaned_count}`)
                            }

                            if (data.completed || data.progress === 100) {
                                setResult(data)

                                // Detailed PSN matching notification
                                const matched = data.matched_psns || 0
                                const orphaned = data.orphaned_images || 0
                                const failed = data.failed_uploads || 0
                                const unmatchedPsns = data.unmatched_psns || []

                                if (failed > 0) {
                                    toast.error(`${failed} images failed to upload`, {
                                        description: "Check the error details below",
                                    })
                                }

                                if (orphaned > 0) {
                                    toast.warning(`${orphaned} images don't match any PSN in the Excel`, {
                                        description: unmatchedPsns.length > 0
                                            ? `Missing images for PSNs: ${unmatchedPsns.join(', ')}`
                                            : "These images will be skipped",
                                        duration: 6000,
                                    })
                                }

                                if (matched > 0) {
                                    toast.success(`Successfully matched ${matched} PSNs with images`, {
                                        description: `${data.total_images} images uploaded total`,
                                    })
                                }

                                // Mark upload as complete - let user click Next to proceed
                                setUploadComplete(true)
                                setResult(data)
                            }
                        } catch (e: any) {
                            console.error("Parse error:", e)
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message)
            toast.error(err.message)
        } finally {
            setUploading(false)
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
    // Server uses: parts[parts.length - 2] (second-to-last path segment)
    const psnInfo = files.reduce((acc, file) => {
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

    const psnList = Object.keys(psnInfo).sort()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Upload Image Folder</h2>
                <p className="text-muted-foreground">
                    Select a folder containing property images organized by PSN subfolders
                </p>
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
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
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

                    <div className="grid grid-cols-4 gap-3">
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

                    {result.unmatched_psns?.length > 0 && (
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

            {/* Compression Progress */}
            {compressing && (
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

            {/* Upload Progress */}
            {(uploading || compressing) && (
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>{status}</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={uploading || compressing}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>

                {onCancel && (
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={uploading || compressing}
                        className="text-muted-foreground"
                    >
                        Cancel
                    </Button>
                )}

                {files.length > 0 && !uploadComplete && (
                    <Button
                        onClick={handleUpload}
                        disabled={uploading || compressing || (compressedFiles.length === 0 && files.length === 0)}
                        className="flex-1"
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
                        className="flex-1 gap-2"
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
                        className="flex-1"
                    >
                        Skip Images
                    </Button>
                )}
            </div>
        </div>
    )
}
