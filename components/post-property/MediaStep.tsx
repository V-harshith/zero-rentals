"use client"

import { Label } from "@/components/ui/label"
import { ImagePlus, X } from "lucide-react"
import type { FormData } from "./types"
import { memo } from "react"

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
}

const MediaStepComponent = ({
    formData,
    setFormData,
    handleImageSelect,
    removeImage,
    maxPhotos,
    isEditMode = false,
    existingImages = [],
    removeExistingImage
}: MediaStepProps) => {
    const updateField = (field: keyof FormData, value: string) => {
        setFormData({ ...formData, [field]: value })
    }

    const totalImages = existingImages.length + formData.images.length

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
                                            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
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
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors relative cursor-pointer group">
                    <input
                        type="file"
                        multiple
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        onChange={handleImageSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={totalImages >= maxPhotos}
                    />
                    <div className="flex flex-col items-center gap-3">
                        <div className="bg-blue-50 p-4 rounded-full group-hover:bg-blue-100 transition-colors">
                            <ImagePlus className="h-8 w-8 text-blue-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-lg">
                                {isEditMode ? 'Click to add more photos' : 'Click to upload photos'}
                            </p>
                            <p className="text-sm text-muted-foreground">or drag and drop here</p>
                        </div>
                    </div>
                </div>

                {/* New Images Preview */}
                {formData.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        {formData.images.map((file, i) => (
                            <div key={`new-${i}`} className={`relative aspect-square rounded-lg overflow-hidden border group ${isEditMode ? 'bg-blue-50/50' : ''}`}>
                                <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="New upload" />
                                <button
                                    onClick={() => removeImage(i)}
                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
