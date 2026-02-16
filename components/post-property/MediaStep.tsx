"use client"

import { Label } from "@/components/ui/label"
import { ImagePlus, X, Loader2 } from "lucide-react"
import type { FormData } from "./types"
import { memo, useEffect, useRef } from "react"

interface MediaStepProps {
    formData: FormData
    setFormData: (data: FormData) => void
    handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
    removeImage: (index: number) => void
    maxPhotos: number
    // Edit-mode props (optional)
    isEditMode?: boolean
    existingImages?: string[]
    removeExistingImage?: (index: number) => void
    // Image processing props
    isProcessing?: boolean
    processingCount?: number
}

const MediaStepComponent = ({
    formData,
    setFormData,
    handleImageSelect,
    removeImage,
    maxPhotos,
    isEditMode = false,
    existingImages = [],
    removeExistingImage,
    isProcessing = false,
    processingCount = 0
}: MediaStepProps) => {
    const updateField = (field: keyof FormData, value: string) => {
        setFormData({ ...formData, [field]: value })
    }

    const totalImages = existingImages.length + formData.images.length

    // Track object URLs to prevent memory leaks
    const objectUrlsRef = useRef<Map<string, string>>(new Map())

    // Create object URLs for new images and track them
    useEffect(() => {
        formData.images.forEach((file, index) => {
            const key = `new-${index}-${file.name}`
            if (!objectUrlsRef.current.has(key)) {
                const url = URL.createObjectURL(file)
                objectUrlsRef.current.set(key, url)
            }
        })

        // Cleanup: revoke URLs that are no longer needed
        return () => {
            objectUrlsRef.current.forEach((url, key) => {
                const stillNeeded = formData.images.some((file, index) =>
                    key === `new-${index}-${file.name}`
                )
                if (!stillNeeded) {
                    URL.revokeObjectURL(url)
                    objectUrlsRef.current.delete(key)
                }
            })
        }
    }, [formData.images])

    // Cleanup all object URLs on unmount
    useEffect(() => {
        return () => {
            objectUrlsRef.current.forEach((url) => {
                URL.revokeObjectURL(url)
            })
            objectUrlsRef.current.clear()
        }
    }, [])

    // Get object URL for a file (memoized)
    const getObjectUrl = (file: File, index: number): string => {
        const key = `new-${index}-${file.name}`
        return objectUrlsRef.current.get(key) || ''
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold mb-1">Photos</h2>
                <p className="text-muted-foreground">Showcase your property to attract tenants.</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label className="text-base">Property Photos <span className="text-red-500">*</span></Label>
                    <span className="text-sm text-muted-foreground">{totalImages}/{maxPhotos} images</span>
                </div>

                {/* Existing Images (Edit Mode) */}
                {isEditMode && existingImages.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Existing Photos</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {existingImages.map((url, i) => (
                                <div key={`existing-${i}`} className="relative aspect-square rounded-lg overflow-hidden border group">
                                    <img src={url} className="w-full h-full object-cover" alt="Property" />
                                    {removeExistingImage && (
                                        <button
                                            onClick={() => removeExistingImage(i)}
                                            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-100 transition-opacity hover:bg-black/80 touch-manipulation"
                                            aria-label={`Remove existing image ${i + 1}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload Area */}
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors relative group ${
                    isProcessing
                        ? 'border-blue-300 bg-blue-50/50 cursor-wait'
                        : 'border-gray-300 hover:bg-gray-50 cursor-pointer'
                }`}>
                    <input
                        type="file"
                        multiple
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        onChange={handleImageSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-wait"
                        disabled={totalImages >= maxPhotos || isProcessing}
                    />
                    <div className="flex flex-col items-center gap-3">
                        <div className={`p-4 rounded-full transition-colors ${
                            isProcessing ? 'bg-blue-100' : 'bg-blue-50 group-hover:bg-blue-100'
                        }`}>
                            {isProcessing ? (
                                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                            ) : (
                                <ImagePlus className="h-8 w-8 text-blue-600" />
                            )}
                        </div>
                        <div>
                            <p className="font-semibold text-lg">
                                {isProcessing
                                    ? `Processing ${processingCount} image${processingCount !== 1 ? 's' : ''}...`
                                    : isEditMode
                                        ? 'Click to add more photos'
                                        : 'Click to upload photos'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {isProcessing
                                    ? 'Please wait while we compress your images'
                                    : 'or drag and drop here'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* New Images Preview */}
                {formData.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        {formData.images.map((file, i) => (
                            <div key={`new-${i}`} className={`relative aspect-square rounded-lg overflow-hidden border group ${isEditMode ? 'bg-blue-50/50' : ''}`}>
                                <img src={getObjectUrl(file, i)} className="w-full h-full object-cover" alt="New upload" />
                                <button
                                    onClick={() => removeImage(i)}
                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-100 transition-opacity hover:bg-black/80 touch-manipulation"
                                    aria-label={`Remove new image ${i + 1}`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    )
}

export const MediaStep = memo(MediaStepComponent)
