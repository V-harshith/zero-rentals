"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { getPropertyById, updateProperty, deleteProperty } from "@/lib/data-service"
import { uploadPropertyImages } from "@/lib/storage-service"
import { DeletePropertyDialog } from "@/components/delete-property-dialog"
import { withAuth } from "@/lib/with-auth"
import type { Property } from "@/lib/types"

// Import shared components (same as post-property)
import { BasicDetailsStep } from "@/components/post-property/BasicDetailsStep"
import { RoomSelectionStep } from "@/components/post-property/RoomSelectionStep"
import { PricingStep } from "@/components/post-property/PricingStep"
import { RulesStep } from "@/components/post-property/RulesStep"
import { MediaStep } from "@/components/post-property/MediaStep"
import { type FormData } from "@/components/post-property/types"

const INITIAL_DATA: FormData = {
    propertyType: 'PG',
    title: "",
    description: "",
    city: "",
    area: "",
    address: "",
    pincode: "",
    rooms: {
        '1rk': { selected: false, rent: "", deposit: "", amenities: [] },
        single: { selected: false, rent: "", deposit: "", amenities: [] },
        double: { selected: false, rent: "", deposit: "", amenities: [] },
        triple: { selected: false, rent: "", deposit: "", amenities: [] },
        four: { selected: false, rent: "", deposit: "", amenities: [] },
    },
    gender: "male",
    preferredTenant: "any",
    noSmoking: false,
    noNonVeg: false,
    noDrinking: false,
    noLoudMusic: false,
    noOppGender: false,
    otherRules: "",
    directionsTip: "",
    furnishing: "" as "Fully Furnished" | "Semi Furnished" | "Unfurnished" | "",
    images: []
}

function EditPropertyPage() {
    const router = useRouter()
    const params = useParams()
    const { user, isLoading: authLoading } = useAuth()
    const isAdmin = user?.role === 'admin'
    const [property, setProperty] = useState<Property | null>(null)
    const [loading, setLoading] = useState(true)
    const [currentStep, setCurrentStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<string>("")
    const [formData, setFormData] = useState<FormData>(INITIAL_DATA)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [existingImages, setExistingImages] = useState<string[]>([])
    const [isDirty, setIsDirty] = useState(false) // Track if form has unsaved changes

    // Track if update is in progress to prevent race conditions
    const isUpdatingRef = useRef(false)
    const dataLoadedRef = useRef(false)
    const visibilityStateRef = useRef(document.visibilityState)

    // localStorage key for persisting form data
    const getStorageKey = useCallback(() => `property_edit_${params.id}_${user?.id || 'guest'}`, [params.id, user?.id])

    // Check for saved data immediately on mount (for mobile tab switching)
    const checkSavedData = useCallback(() => {
        if (!params.id || !user?.id) return false

        const storageKey = getStorageKey()
        const savedData = localStorage.getItem(storageKey)

        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                // Only restore if data is less than 24 hours old
                const savedAt = parsed.savedAt ? new Date(parsed.savedAt) : null
                const isRecent = savedAt && (Date.now() - savedAt.getTime()) < 24 * 60 * 60 * 1000

                if (isRecent && parsed.formData) {
                    setFormData(parsed.formData)
                    setExistingImages(parsed.existingImages || [])
                    setIsDirty(true)
                    toast.info("Restored your unsaved changes", {
                        description: "Your previous edits have been restored."
                    })
                    setLoading(false)
                    dataLoadedRef.current = true
                    return true
                } else {
                    // Data is too old, clear it
                    localStorage.removeItem(storageKey)
                }
            } catch {
                localStorage.removeItem(storageKey)
            }
        }
        return false
    }, [getStorageKey, params.id, user?.id])

    // Handle visibility change (for mobile tab switching)
    useEffect(() => {
        const handleVisibilityChange = () => {
            const newState = document.visibilityState
            const wasHidden = visibilityStateRef.current === 'hidden'
            visibilityStateRef.current = newState

            // User is returning to the tab
            if (newState === 'visible' && wasHidden) {
                console.log('[Edit Property] User returned to tab, checking for saved data...')
                // Check for saved data - this handles the case where browser unloaded the page
                const hasSavedData = checkSavedData()

                if (!hasSavedData && !dataLoadedRef.current) {
                    // No saved data and no data loaded yet, load from database
                    loadPropertyData()
                }
            }

            // User is leaving the tab - save data immediately
            if (newState === 'hidden') {
                console.log('[Edit Property] User leaving tab, saving form data...')
                if (isDirty && user && params.id) {
                    const storageKey = getStorageKey()
                    const dataToSave = {
                        formData,
                        existingImages,
                        savedAt: new Date().toISOString()
                    }
                    // Use sync method to ensure it saves before page unloads
                    localStorage.setItem(storageKey, JSON.stringify(dataToSave))
                }
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [checkSavedData, formData, existingImages, isDirty, user, params.id, getStorageKey])

    // --- Loading Data after HOC verifies Auth ---
    useEffect(() => {
        // Don't reload data if an update is in progress or data already loaded
        if (isUpdatingRef.current || dataLoadedRef.current) return

        if (user && params.id) {
            // Check for saved form data in localStorage first
            const hasSavedData = checkSavedData()

            if (!hasSavedData) {
                // No saved data, load from database
                dataLoadedRef.current = true
                loadPropertyData()
            }
        }
    }, [user?.id, params.id, checkSavedData]) // Only re-run when user ID changes

    // Save form data to localStorage when it changes (for persistence across tab switches)
    useEffect(() => {
        if (isDirty && user && params.id) {
            const storageKey = getStorageKey()
            const dataToSave = {
                formData,
                existingImages,
                savedAt: new Date().toISOString()
            }
            localStorage.setItem(storageKey, JSON.stringify(dataToSave))
        }
    }, [formData, existingImages, isDirty, user, params.id])

    // Handle beforeunload to warn about unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault()
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
                return e.returnValue
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [isDirty])

    const loadPropertyData = async () => {
        try {
            const property = await getPropertyById(params.id as string)
            if (!property) {
                toast.error("Property not found")
                router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')
                return
            }

            // Check ownership (Bypass for admin)
            if (property.owner?.id !== user?.id && user?.role !== 'admin') {
                toast.error("You don't have permission to edit this property")
                router.push(`/property/${params.id}`)
                return
            }

            setProperty(property)
            setExistingImages(property.images || [])

            // Hydrate form data from property
            const hydratedData: FormData = {
                propertyType: property.propertyType || 'PG',
                title: property.title,
                description: property.description?.split('\n\nDirections:')[0] || '',
                city: property.location?.city || "",
                area: property.location?.area || "",
                address: property.location?.address || "",
                pincode: property.location?.pincode || "",
                rooms: {
                    '1rk': {
                        selected: property.roomType === '1RK',
                        rent: property.roomType === '1RK' ? property.price?.toString() || '' : (property.roomPrices?.['1rk']?.toString() || ''),
                        deposit: property.deposit?.toString() || '',
                        amenities: property.amenities || []
                    },
                    single: {
                        selected: property.roomType === 'Single' || !!property.roomPrices?.single,
                        rent: property.roomPrices?.single?.toString() || (property.roomType === 'Single' ? property.price?.toString() : '') || '',
                        deposit: property.deposit?.toString() || '',
                        amenities: property.amenities || []
                    },
                    double: {
                        selected: !!property.roomPrices?.double || property.roomType === 'Double',
                        rent: property.roomPrices?.double?.toString() || (property.roomType === 'Double' ? property.price?.toString() : '') || '',
                        deposit: property.deposit?.toString() || '',
                        amenities: property.amenities || []
                    },
                    triple: {
                        selected: !!property.roomPrices?.triple || property.roomType === 'Triple',
                        rent: property.roomPrices?.triple?.toString() || (property.roomType === 'Triple' ? property.price?.toString() : '') || '',
                        deposit: property.deposit?.toString() || '',
                        amenities: property.amenities || []
                    },
                    four: {
                        selected: !!property.roomPrices?.four || property.roomType === 'Four Sharing',
                        rent: property.roomPrices?.four?.toString() || (property.roomType === 'Four Sharing' ? property.price?.toString() : '') || '',
                        deposit: property.deposit?.toString() || '',
                        amenities: property.amenities || []
                    }
                },
                gender: property.preferredTenant?.toLowerCase() || 'male',
                preferredTenant: 'any',
                noSmoking: property.rules?.includes('No Smoking') || false,
                noNonVeg: property.rules?.includes('No Non-Veg') || false,
                noDrinking: property.rules?.includes('No Drinking') || false,
                noLoudMusic: property.rules?.includes('No Loud Music') || false,
                noOppGender: property.rules?.includes('No Opposite Gender') || false,
                otherRules: property.rules?.find((r: string) =>
                    !['No Smoking', 'No Non-Veg', 'No Drinking', 'No Loud Music', 'No Opposite Gender'].includes(r)
                    && !r.startsWith('Preferred Tenant:')
                ) || '',
                directionsTip: property.description?.split('\n\nDirections: ')[1] || '',
                furnishing: property.furnishing || '' as FormData['furnishing'],
                images: [] // New images added during edit
            }

            setFormData(hydratedData)
        } catch {
            toast.error("Failed to load property details")
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // --- Logic ---
    const maxSteps = 5
    const progress = (currentStep / maxSteps) * 100

    // Helper to update form data and mark as dirty
    const updateFormData = (updater: (prev: FormData) => FormData) => {
        setFormData(updater)
        setIsDirty(true)
    }

    const toggleRoom = (roomType: string) => {
        updateFormData((prev) => {
            const currentRoom = prev.rooms[roomType] || { selected: false, rent: "", deposit: "", amenities: [] }
            return {
                ...prev,
                rooms: {
                    ...prev.rooms,
                    [roomType]: {
                        ...currentRoom,
                        selected: !currentRoom.selected,
                    },
                },
            }
        })
    }

    const updateRoomData = (roomType: string, field: string, value: string | string[]) => {
        updateFormData((prev) => {
            const currentRoom = prev.rooms[roomType] || { selected: false, rent: "", deposit: "", amenities: [] }
            return {
                ...prev,
                rooms: {
                    ...prev.rooms,
                    [roomType]: {
                        ...currentRoom,
                        [field]: value,
                    },
                },
            }
        })
    }

    const toggleAmenity = (roomType: string, amenity: string) => {
        const currentRoom = formData.rooms[roomType] || { selected: false, rent: "", deposit: "", amenities: [] }
        const currentAmenities = currentRoom.amenities
        const newAmenities = currentAmenities.includes(amenity)
            ? currentAmenities.filter((a) => a !== amenity)
            : [...currentAmenities, amenity]

        updateRoomData(roomType, "amenities", newAmenities)
    }

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files)
            const totalImages = existingImages.length + formData.images.length + newFiles.length
            if (totalImages > 10) {
                toast.error("You can upload a maximum of 10 images")
                return
            }
            updateFormData(prev => ({
                ...prev,
                images: [...prev.images, ...newFiles]
            }))
        }
    }

    const removeImage = (index: number) => {
        updateFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }))
    }

    const removeExistingImage = (index: number) => {
        setExistingImages(prev => prev.filter((_, i) => i !== index))
        setIsDirty(true) // Mark as dirty since images changed
    }

    const validateStep = (step: number): boolean => {
        switch (step) {
            case 1:
                if (!formData.title.trim()) { toast.error("Property Title is required"); return false }
                if (formData.title.length < 5) { toast.error("Title is too short"); return false }
                if (!formData.description.trim()) { toast.error("Description is required"); return false }
                if (formData.description.length < 20) { toast.error("Description should be at least 20 characters"); return false }
                if (!formData.city.trim()) { toast.error("City is required"); return false }
                if (!formData.area.trim()) { toast.error("Area is required"); return false }
                if (!formData.address.trim()) { toast.error("Full Address is required"); return false }
                if (!formData.pincode || formData.pincode.length !== 6) { toast.error("Valid 6-digit pincode is required"); return false }
                return true

            case 2:
                const hasSelectedRoom = Object.values(formData.rooms).some(r => r.selected)
                if (!hasSelectedRoom) { toast.error("Please select at least one room type"); return false }
                return true

            case 3:
                const selectedRooms = Object.entries(formData.rooms).filter(([_, r]) => r.selected)
                for (const [type, room] of selectedRooms) {
                    if (!room.rent || parseInt(room.rent) <= 0) {
                        toast.error(`Please enter valid rent for ${type} room`); return false
                    }
                    if (!room.deposit || parseInt(room.deposit) < 0) {
                        toast.error(`Please enter valid deposit for ${type} room`); return false
                    }
                }
                if (!formData.furnishing) {
                    toast.error("Please select furnishing type"); return false
                }
                return true

            case 4:
                return true

            case 5:
                if (existingImages.length + formData.images.length === 0) {
                    toast.error("Please keep at least 1 image of your property")
                    return false
                }
                return true

            default:
                return true
        }
    }

    const handleNext = () => {
        if (validateStep(currentStep)) {
            if (currentStep < maxSteps) {
                setCurrentStep(currentStep + 1)
                window.scrollTo(0, 0)
            }
        }
    }

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1)
            window.scrollTo(0, 0)
        }
    }

    const handleSubmit = async () => {
        if (!validateStep(5)) return

        // Prevent data reload during submission
        isUpdatingRef.current = true

        try {
            setIsSubmitting(true)
            setUploadStatus("Updating property...")

            // 1. Determine primary pricing (lowest selected rent)
            const selectedRoomTypes = Object.entries(formData.rooms)
                .filter(([_, r]) => r.selected)
                .map(([type, r]) => ({ type, price: parseInt(r.rent), deposit: parseInt(r.deposit) }))

            const primaryRoom = selectedRoomTypes.sort((a, b) => a.price - b.price)[0]

            const roomTypeMap: Record<string, string> = {
                '1rk': '1RK', 'single': 'Single', 'double': 'Double', 'triple': 'Triple', 'four': 'Four Sharing'
            }

            // 2. Create roomPrices object with ALL selected room prices
            const roomPrices: Record<string, number> = {}
            for (const [type, room] of Object.entries(formData.rooms)) {
                if (room.selected && room.rent) {
                    roomPrices[type] = parseInt(room.rent)
                }
            }

            // 3. Prepare Updates
            const propertyUpdates: Partial<Property> & { roomPrices?: Record<string, number> } = {
                title: formData.title,
                description: formData.description + (formData.directionsTip ? `\n\nDirections: ${formData.directionsTip}` : ""),
                propertyType: formData.propertyType,
                roomType: roomTypeMap[primaryRoom.type] as Property['roomType'],
                price: primaryRoom.price,
                deposit: primaryRoom.deposit,
                roomPrices,
                amenities: Array.from(
                    new Set(
                        Object.values(formData.rooms)
                            .filter(r => r.selected)
                            .flatMap(r => r.amenities || [])
                    )
                ),
                location: {
                    city: formData.city,
                    area: formData.area,
                    address: formData.address,
                    pincode: formData.pincode,
                },
                preferredTenant: (formData.gender === 'male' ? 'Male' : formData.gender === 'female' ? 'Female' : formData.gender === 'couple' ? 'Couple' : 'Any') as Property['preferredTenant'],
                furnishing: formData.furnishing || undefined,
                rules: [
                    formData.noSmoking ? 'No Smoking' : '',
                    formData.noNonVeg ? 'No Non-Veg' : '',
                    formData.noDrinking ? 'No Drinking' : '',
                    formData.noLoudMusic ? 'No Loud Music' : '',
                    formData.noOppGender ? 'No Opposite Gender' : '',
                    formData.preferredTenant !== 'any' ? `Preferred Tenant: ${formData.preferredTenant.charAt(0).toUpperCase() + formData.preferredTenant.slice(1)}` : '',
                    formData.otherRules
                ].filter(Boolean),
                images: existingImages
            }

            // 4. Upload New Images
            let finalImages = [...existingImages]
            if (formData.images.length > 0) {
                setUploadStatus(`Uploading ${formData.images.length} new images...`)
                const { urls, errors } = await uploadPropertyImages(formData.images, params.id as string)

                if (errors.length > 0) {
                    toast.warning("Some images failed to upload")
                }
                if (urls.length > 0) {
                    finalImages = [...finalImages, ...urls]
                }
            }
            propertyUpdates.images = finalImages

            // 5. Update DB
            const { error } = await updateProperty(params.id as string, propertyUpdates)

            if (error) {
                throw new Error("Failed to update property")
            }

            setUploadStatus("Success!")
            toast.success("Property updated successfully!")

            // Clear saved form data from localStorage
            localStorage.removeItem(getStorageKey())
            setIsDirty(false)

            router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')

        } catch (error: any) {
            console.error("=== UPDATE ERROR ===")
            console.error("Error:", error)
            console.error("Error Message:", error.message)
            console.error("Error Details:", error.details)

            // Show detailed validation errors if available
            let errorMessage = error.message || "Failed to update property"

            // Handle Zod validation errors
            if (error.details && Array.isArray(error.details)) {
                const fieldErrors = error.details.map((err: any) => {
                    const field = err.path?.join('.') || 'Unknown field'
                    return `${field}: ${err.message}`
                })
                if (fieldErrors.length > 0) {
                    errorMessage = `Validation failed:\n${fieldErrors.join('\n')}`
                }
            }

            toast.error("Property Update Failed", {
                description: errorMessage,
                duration: 8000
            })
            setUploadStatus("")
        } finally {
            setIsSubmitting(false)
            // Allow data reload after submission completes
            isUpdatingRef.current = false
        }
    }

    const handleDelete = async () => {
        const { error } = await deleteProperty(params.id as string)
        if (error) {
            toast.error("Failed to delete property")
        } else {
            toast.success("Property deleted successfully")
            router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={isAdmin ? '/dashboard/admin' : '/dashboard/owner'} className="p-2 hover:bg-gray-100 rounded-full">
                            <ArrowLeft className="h-5 w-5 text-gray-600" />
                        </Link>
                        <div className="flex flex-col">
                            <h1 className="font-semibold text-lg">Edit Property</h1>
                            <span className="text-xs text-muted-foreground">Step {currentStep} of {maxSteps}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDirty && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    localStorage.removeItem(getStorageKey())
                                    setIsDirty(false)
                                    loadPropertyData()
                                    toast.info("Changes discarded", {
                                        description: "Reloaded original property data"
                                    })
                                }}
                            >
                                Discard Changes
                            </Button>
                        )}
                        <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                            Delete
                        </Button>
                    </div>
                </div>
                <Progress value={progress} className="h-1 rounded-none" />
            </header>

            <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
                <Card className="shadow-sm border-0 bg-white">
                    <CardContent className="p-6 md:p-8 min-h-[60vh]">

                        {/* Step 1: Basic Details — Shared Component */}
                        {currentStep === 1 && (
                            <BasicDetailsStep formData={formData} setFormData={updateFormData} />
                        )}

                        {/* Step 2: Room Selection — Shared Component */}
                        {currentStep === 2 && (
                            <RoomSelectionStep formData={formData} toggleRoom={toggleRoom} />
                        )}

                        {/* Step 3: Pricing & Amenities — Shared Component */}
                        {currentStep === 3 && (
                            <PricingStep
                                formData={formData}
                                updateRoomData={updateRoomData}
                                toggleAmenity={toggleAmenity}
                                updateFormData={(field, value) => updateFormData(prev => ({ ...prev, [field]: value }))}
                            />
                        )}

                        {/* Step 4: Rules & Preferences — Shared Component */}
                        {currentStep === 4 && (
                            <RulesStep formData={formData} setFormData={updateFormData} />
                        )}

                        {/* Step 5: Media — Shared Component */}
                        {currentStep === 5 && (
                            <MediaStep
                                formData={formData}
                                setFormData={updateFormData}
                                handleImageSelect={handleImageSelect}
                                removeImage={removeImage}
                                maxPhotos={10}
                                isEditMode={true}
                                existingImages={existingImages}
                                removeExistingImage={removeExistingImage}
                            />
                        )}

                    </CardContent>

                    <CardContent className="border-t bg-gray-50 p-6 flex justify-between rounded-b-xl">
                        <Button variant="outline" onClick={handleBack} disabled={currentStep === 1 || isSubmitting}>Back</Button>

                        {currentStep < maxSteps ? (
                            <Button onClick={handleNext} className="bg-primary px-8">Next</Button>
                        ) : (
                            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-primary px-8 font-bold">
                                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {uploadStatus}</> : "Update Property"}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </main>

            <DeletePropertyDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} onConfirm={handleDelete} propertyTitle={formData.title} />
        </div>
    )
}

export default withAuth(EditPropertyPage, { requiredRole: 'owner' })
