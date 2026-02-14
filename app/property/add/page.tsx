"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AMENITIES_LIST } from "@/lib/mock-data"
import { createProperty } from "@/lib/data-service"
import { uploadPropertyImages, UploadProgress } from "@/lib/storage-service"
import { toast } from "sonner"
import { handleError } from "@/lib/error-handler"
import { Home, MapPin, IndianRupee, Sparkles, ImageIcon, CheckCircle, ArrowLeft, ArrowRight, Loader2, X } from "lucide-react"
import { withAuth } from "@/lib/with-auth"

const STEPS = [
    { id: 1, title: "Basic Details", icon: Home },
    { id: 2, title: "Pricing", icon: IndianRupee },
    { id: 3, title: "Amenities", icon: Sparkles },
    { id: 4, title: "Photos", icon: ImageIcon },
    { id: 5, title: "Review", icon: CheckCircle }
]

// Helper to get max images based on subscription
const getMaxImages = (userSubscription?: string) => {
    return userSubscription === 'premium' ? 10 : 5
}

function AddPropertyPage() {
    const router = useRouter()
    const { user } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [currentStep, setCurrentStep] = useState(1)
    const [formData, setFormData] = useState({
        title: "",
        propertyType: "PG",
        roomType: "Single",
        city: "",
        area: "",
        address: "",
        price: "",
        deposit: "",
        maintenance: "",
        description: "",
        amenities: [] as string[],
        furnishing: "Fully Furnished",
        floorNumber: "",
        totalFloors: "",
        roomSize: "",
        preferredTenant: "Any",
        pincode: "",
        rules: "",
        images: [] as string[]
    })

    const [termsAccepted, setTermsAccepted] = useState(false)

    const [isLoaded, setIsLoaded] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [isLoading, setIsLoading] = useState(false)
    const [uploadingImages, setUploadingImages] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
    const [pendingFiles, setPendingFiles] = useState<File[]>([])

    // --- Persistence Logic ---
    useEffect(() => {
        const savedData = localStorage.getItem('property_add_form')
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                // Don't restore images as blob URLs will be invalid
                setFormData(prev => ({ ...prev, ...parsed, images: [] }))
                const savedStep = localStorage.getItem('property_add_step')
                if (savedStep) setCurrentStep(parseInt(savedStep))
            } catch (e) {
                console.error("Failed to parse saved form data", e)
            }
        }
        setIsLoaded(true)
    }, [])

    useEffect(() => {
        if (!isLoaded) return

        const { images, ...dataToSave } = formData
        localStorage.setItem('property_add_form', JSON.stringify(dataToSave))
        localStorage.setItem('property_add_step', currentStep.toString())
    }, [formData, currentStep, isLoaded])

    // Clear errors when field is updated
    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear error for this field when user starts typing
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[field]
                return newErrors
            })
        }
    }

    // Input restriction for numbers-only fields
    const updateNumericField = (field: string, value: string) => {
        // Only allow digits
        const numericValue = value.replace(/\D/g, '')
        updateField(field, numericValue)
    }

    const toggleAmenity = (amenity: string) => {
        setFormData(prev => ({
            ...prev,
            amenities: prev.amenities.includes(amenity)
                ? prev.amenities.filter(a => a !== amenity)
                : [...prev.amenities, amenity]
        }))
        // Clear amenities error when user selects one
        if (errors.amenities) {
            setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors.amenities
                return newErrors
            })
        }
    }

    // Comprehensive validation function
    const validateStep = (step: number): boolean => {
        const newErrors: Record<string, string> = {}

        if (step === 1) {
            // Basic Details validation
            if (!formData.title.trim()) {
                newErrors.title = "Property title is required"
            } else if (formData.title.trim().length < 10) {
                newErrors.title = "Title must be at least 10 characters"
            }

            if (!formData.city.trim()) {
                newErrors.city = "City is required"
            }

            if (!formData.area.trim()) {
                newErrors.area = "Area is required"
            }

            if (!formData.pincode.trim()) {
                newErrors.pincode = "Pincode is required"
            } else if (formData.pincode.length !== 6) {
                newErrors.pincode = "Pincode must be exactly 6 digits"
            } else if (!/^\d{6}$/.test(formData.pincode)) {
                newErrors.pincode = "Pincode must contain only numbers"
            }

            if (!formData.address.trim()) {
                newErrors.address = "Address is required"
            } else if (formData.address.trim().length < 10) {
                newErrors.address = "Please provide a detailed address (at least 10 characters)"
            }
        }

        if (step === 2) {
            // Pricing validation
            if (!formData.price.trim()) {
                newErrors.price = "Monthly rent is required"
            } else if (parseInt(formData.price) <= 0) {
                newErrors.price = "Rent must be greater than 0"
            } else if (parseInt(formData.price) < 1000) {
                newErrors.price = "Rent seems too low. Please verify."
            }

            if (!formData.deposit.trim()) {
                newErrors.deposit = "Security deposit is required"
            } else if (parseInt(formData.deposit) <= 0) {
                newErrors.deposit = "Deposit must be greater than 0"
            }

            if (formData.maintenance && parseInt(formData.maintenance) < 0) {
                newErrors.maintenance = "Maintenance cannot be negative"
            }

            if (formData.floorNumber && parseInt(formData.floorNumber) < 0) {
                newErrors.floorNumber = "Floor number cannot be negative"
            }

            if (formData.totalFloors && parseInt(formData.totalFloors) <= 0) {
                newErrors.totalFloors = "Total floors must be greater than 0"
            }

            if (formData.floorNumber && formData.totalFloors) {
                if (parseInt(formData.floorNumber) > parseInt(formData.totalFloors)) {
                    newErrors.floorNumber = "Floor number cannot exceed total floors"
                }
            }

            if (formData.roomSize && parseInt(formData.roomSize) <= 0) {
                newErrors.roomSize = "Room size must be greater than 0"
            }
        }

        if (step === 3) {
            // Amenities validation
            if (formData.amenities.length === 0) {
                newErrors.amenities = "Please select at least one amenity"
            }

            if (!formData.description.trim()) {
                newErrors.description = "Property description is required"
            } else if (formData.description.trim().length < 50) {
                newErrors.description = "Description must be at least 50 characters for better visibility"
            }
        }

        if (step === 4) {
            // Photos validation
            const maxImages = getMaxImages(user?.subscription)
            if (formData.images.length === 0) {
                newErrors.images = "Please upload at least one property image"
            } else if (formData.images.length < 3) {
                newErrors.images = "Please upload at least 3 images for better listing visibility"
            } else if (formData.images.length > maxImages) {
                newErrors.images = `Maximum ${maxImages} images allowed for ${user?.subscription === 'premium' ? 'premium' : 'free'} accounts`
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleNext = () => {
        if (validateStep(currentStep)) {
            if (currentStep < 5) {
                setCurrentStep(currentStep + 1)
                window.scrollTo({ top: 0, behavior: 'smooth' })
            }
        } else {
            toast.error("Please fix the errors before proceeding")
        }
    }

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1)
            setErrors({})
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    const handleSubmit = async () => {
        if (!user) {
            toast.error("You must be logged in to submit a property")
            return
        }

        // Final validation check for all steps
        for (let i = 1; i <= 4; i++) {
            if (!validateStep(i)) {
                setCurrentStep(i)
                toast.error(`Please fix errors in Step ${i} before submitting`)
                return
            }
        }

        if (!termsAccepted) {
            toast.error("Please agree to the Terms of Service to proceed")
            return
        }

        setIsLoading(true)
        try {

            // First, create the property to get an ID
            const tempPropertyData = {
                title: formData.title,
                description: formData.description,
                propertyType: formData.propertyType as 'PG' | 'Co-living' | 'Rent',
                roomType: formData.roomType as 'Single' | 'Double' | 'Triple' | 'Apartment',
                location: {
                    city: formData.city,
                    area: formData.area,
                    address: formData.address,
                    pincode: formData.pincode,
                },
                price: parseInt(formData.price),
                deposit: formData.deposit ? parseInt(formData.deposit) : undefined,
                maintenance: formData.maintenance ? parseInt(formData.maintenance) : undefined,
                amenities: formData.amenities,
                furnishing: formData.furnishing as 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished',
                floorNumber: formData.floorNumber ? parseInt(formData.floorNumber) : undefined,
                totalFloors: formData.totalFloors ? parseInt(formData.totalFloors) : undefined,
                roomSize: formData.roomSize ? parseInt(formData.roomSize) : undefined,
                preferredTenant: formData.preferredTenant as 'Male' | 'Female' | 'Any',
                rules: formData.rules ? formData.rules.split('\n').filter(r => r.trim()) : [],
                images: [], // Will be updated after upload
                ownerId: user.id,
                ownerName: user.name,
                ownerContact: user.phone || user.email,
            }

            const { data: property, error: createError } = await createProperty(tempPropertyData)

            if (createError || !property) {
                handleError(createError || "Failed to create property", "Failed to submit property. Please try again.")
                return
            }

            // Upload images if any
            let imageUrls: string[] = []
            if (pendingFiles.length > 0) {
                setUploadingImages(true)
                toast.info(`Uploading ${pendingFiles.length} image(s)...`)

                const { urls, errors } = await uploadPropertyImages(
                    pendingFiles,
                    property.id,
                    (progress) => {
                        setUploadProgress(progress)
                    }
                )

                imageUrls = urls

                if (errors.length > 0) {
                    console.error('Image upload errors:', errors)
                    toast.warning(`Some images failed to upload: ${errors.join(', ')}`)
                }

                // Update property with image URLs
                if (imageUrls.length > 0) {
                    const { updateProperty } = await import('@/lib/data-service')
                    await updateProperty(property.id, { images: imageUrls })
                }

                setUploadingImages(false)
            }

            toast.success("Property submitted successfully! It will be reviewed by our team.")

            // Clear persistence
            localStorage.removeItem('property_add_form')
            localStorage.removeItem('property_add_step')

            setTimeout(() => {
                router.push('/dashboard/owner')
            }, 1500)
        } catch (error) {
            handleError(error, "An unexpected error occurred while submitting. Please try again.")
        } finally {
            setIsLoading(false)
            setUploadingImages(false)
        }
    }



    const removeImage = (index: number) => {
        // Clean up preview URL
        if (formData.images[index].startsWith('blob:')) {
            URL.revokeObjectURL(formData.images[index])
        }
        const newImages = formData.images.filter((_, i) => i !== index)
        const newFiles = pendingFiles.filter((_, i) => i !== index)
        updateField("images", newImages)
        setPendingFiles(newFiles)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            handleFiles(Array.from(files))
        }
    }

    const handleFiles = (files: File[]) => {
        const imageFiles = files.filter(file => file.type.startsWith('image/'))
        if (imageFiles.length === 0) {
            toast.error("Please upload image files only")
            return
        }

        const maxImages = getMaxImages(user?.subscription)
        if (formData.images.length + imageFiles.length > maxImages) {
            toast.error(`Maximum ${maxImages} images allowed for ${user?.subscription === 'premium' ? 'premium' : 'free'} accounts`)
            return
        }

        setPendingFiles(prev => [...prev, ...imageFiles])

        // Create preview URLs
        const previewUrls = imageFiles.map(file => URL.createObjectURL(file))
        updateField("images", [...formData.images, ...previewUrls])

        toast.success(`${imageFiles.length} image(s) added`)
    }

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            handleFiles(Array.from(files))
        }
    }

    return (
        <div className="min-h-screen bg-muted/30 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">List Your Property</h1>
                        <p className="text-muted-foreground">Fill in the details to list your property</p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => router.push('/dashboard/owner')}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Button>
                </div>

                {/* Progress Steps */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        {STEPS.map((step, index) => (
                            <div key={step.id} className="flex items-center flex-1">
                                <div className="flex flex-col items-center flex-1">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center ${currentStep >= step.id
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                            } transition-colors`}
                                    >
                                        <step.icon className="h-5 w-5" />
                                    </div>
                                    <span className="text-xs mt-2 hidden sm:block">{step.title}</span>
                                </div>
                                {index < STEPS.length - 1 && (
                                    <div
                                        className={`h-1 flex-1 ${currentStep > step.id ? "bg-primary" : "bg-muted"
                                            } transition-colors`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {(() => {
                                const Icon = STEPS[currentStep - 1].icon
                                return <Icon className="h-5 w-5" />
                            })()}
                            {STEPS[currentStep - 1].title}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Step 1: Basic Details */}
                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className={errors.title ? "text-destructive" : ""}>Property Title *</Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g., Luxury PG in Koramangala"
                                        value={formData.title}
                                        onChange={(e) => updateField("title", e.target.value)}
                                        className={errors.title ? "border-destructive ring-destructive" : ""}
                                    />
                                    {errors.title && <p className="text-xs font-medium text-destructive">{errors.title}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Property Type *</Label>
                                        <Select value={formData.propertyType} onValueChange={(v) => updateField("propertyType", v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PG">PG</SelectItem>
                                                <SelectItem value="Co-living">Co-living</SelectItem>
                                                <SelectItem value="Rent">Rent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Room Type *</Label>
                                        <Select value={formData.roomType} onValueChange={(v) => updateField("roomType", v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Single">Single</SelectItem>
                                                <SelectItem value="Double">Double</SelectItem>
                                                <SelectItem value="Triple">Triple</SelectItem>
                                                <SelectItem value="Apartment">Apartment</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="city" className={errors.city ? "text-destructive" : ""}>City *</Label>
                                        <Input
                                            id="city"
                                            placeholder="Bangalore"
                                            value={formData.city}
                                            onChange={(e) => updateField("city", e.target.value)}
                                            className={errors.city ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.city && <p className="text-xs font-medium text-destructive">{errors.city}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="area" className={errors.area ? "text-destructive" : ""}>Area *</Label>
                                        <Input
                                            id="area"
                                            placeholder="Koramangala"
                                            value={formData.area}
                                            onChange={(e) => updateField("area", e.target.value)}
                                            className={errors.area ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.area && <p className="text-xs font-medium text-destructive">{errors.area}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pincode" className={errors.pincode ? "text-destructive" : ""}>Pincode *</Label>
                                    <Input
                                        id="pincode"
                                        placeholder="560034"
                                        maxLength={6}
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={formData.pincode}
                                        onChange={(e) => updateNumericField("pincode", e.target.value)}
                                        className={errors.pincode ? "border-destructive ring-destructive" : ""}
                                    />
                                    {errors.pincode && <p className="text-xs font-medium text-destructive">{errors.pincode}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address" className={errors.address ? "text-destructive" : ""}>Full Address *</Label>
                                    <Textarea
                                        id="address"
                                        placeholder="Complete address with landmarks"
                                        value={formData.address}
                                        onChange={(e) => updateField("address", e.target.value)}
                                        rows={3}
                                        className={errors.address ? "border-destructive ring-destructive" : ""}
                                    />
                                    {errors.address && <p className="text-xs font-medium text-destructive">{errors.address}</p>}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Pricing */}
                        {currentStep === 2 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price" className={errors.price ? "text-destructive" : ""}>Monthly Rent *</Label>
                                    <Input
                                        id="price"
                                        placeholder="12000"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={formData.price}
                                        onChange={(e) => updateNumericField("price", e.target.value)}
                                        className={errors.price ? "border-destructive ring-destructive" : ""}
                                    />
                                    {errors.price && <p className="text-xs font-medium text-destructive">{errors.price}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="deposit" className={errors.deposit ? "text-destructive" : ""}>Security Deposit *</Label>
                                        <Input
                                            id="deposit"
                                            placeholder="24000"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={formData.deposit}
                                            onChange={(e) => updateNumericField("deposit", e.target.value)}
                                            className={errors.deposit ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.deposit && <p className="text-xs font-medium text-destructive">{errors.deposit}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="maintenance" className={errors.maintenance ? "text-destructive" : ""}>Maintenance</Label>
                                        <Input
                                            id="maintenance"
                                            placeholder="1000"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={formData.maintenance}
                                            onChange={(e) => updateNumericField("maintenance", e.target.value)}
                                            className={errors.maintenance ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.maintenance && <p className="text-xs font-medium text-destructive">{errors.maintenance}</p>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Furnishing</Label>
                                        <Select value={formData.furnishing} onValueChange={(v) => updateField("furnishing", v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                                                <SelectItem value="Semi Furnished">Semi Furnished</SelectItem>
                                                <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="roomSize" className={errors.roomSize ? "text-destructive" : ""}>Room Size (sqft)</Label>
                                        <Input
                                            id="roomSize"
                                            placeholder="120"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={formData.roomSize}
                                            onChange={(e) => updateNumericField("roomSize", e.target.value)}
                                            className={errors.roomSize ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.roomSize && <p className="text-xs font-medium text-destructive">{errors.roomSize}</p>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="floorNumber" className={errors.floorNumber ? "text-destructive" : ""}>Floor Number</Label>
                                        <Input
                                            id="floorNumber"
                                            placeholder="3"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={formData.floorNumber}
                                            onChange={(e) => updateNumericField("floorNumber", e.target.value)}
                                            className={errors.floorNumber ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.floorNumber && <p className="text-xs font-medium text-destructive">{errors.floorNumber}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="totalFloors" className={errors.totalFloors ? "text-destructive" : ""}>Total Floors</Label>
                                        <Input
                                            id="totalFloors"
                                            placeholder="5"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={formData.totalFloors}
                                            onChange={(e) => updateNumericField("totalFloors", e.target.value)}
                                            className={errors.totalFloors ? "border-destructive ring-destructive" : ""}
                                        />
                                        {errors.totalFloors && <p className="text-xs font-medium text-destructive">{errors.totalFloors}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Preferred Tenant</Label>
                                    <Select value={formData.preferredTenant} onValueChange={(v) => updateField("preferredTenant", v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Any">Any</SelectItem>
                                            <SelectItem value="Male">Male</SelectItem>
                                            <SelectItem value="Female">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Amenities */}
                        {currentStep === 3 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="description" className={errors.description ? "text-destructive" : ""}>Property Description *</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Describe your property, nearby amenities, and what makes it special..."
                                        value={formData.description}
                                        onChange={(e) => updateField("description", e.target.value)}
                                        rows={5}
                                        className={errors.description ? "border-destructive ring-destructive" : ""}
                                    />
                                    {errors.description && <p className="text-xs font-medium text-destructive">{errors.description}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label className={errors.amenities ? "text-destructive" : ""}>Amenities *</Label>
                                    <p className="text-sm text-muted-foreground mb-4">Select all amenities available in your property</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-card">
                                        {AMENITIES_LIST.map((amenity) => (
                                            <div key={amenity} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`amenity-${amenity}`}
                                                    checked={formData.amenities.includes(amenity)}
                                                    onCheckedChange={() => toggleAmenity(amenity)}
                                                />
                                                <label htmlFor={`amenity-${amenity}`} className="text-sm cursor-pointer hover:text-primary transition-colors">
                                                    {amenity}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    {errors.amenities && <p className="text-xs font-medium text-destructive mt-2">{errors.amenities}</p>}
                                </div>

                                <div className="space-y-2 pt-4">
                                    <Label htmlFor="rules">Rules & Policies (Optional)</Label>
                                    <Textarea
                                        id="rules"
                                        placeholder="e.g., No smoking, No pets, Visitors allowed till 9 PM (one per line)"
                                        value={formData.rules}
                                        onChange={(e) => updateField("rules", e.target.value)}
                                        rows={4}
                                    />
                                    <p className="text-xs text-muted-foreground">Enter each rule on a new line</p>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Photos */}
                        {currentStep === 4 && (
                            <div className="space-y-4">
                                <div
                                    className={`border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer ${errors.images ? "border-destructive bg-destructive/5" : ""}`}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        multiple
                                        accept="image/*"
                                        onChange={onFileInputChange}
                                    />
                                    <ImageIcon className={`h-12 w-12 mx-auto mb-4 ${errors.images ? "text-destructive" : "text-muted-foreground"}`} />
                                    <h3 className={`font-semibold mb-2 ${errors.images ? "text-destructive" : ""}`}>Upload Property Photos</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Drag and drop images here, or click to browse
                                    </p>
                                    <Button variant={errors.images ? "destructive" : "outline"} type="button">Choose Files</Button>
                                    <p className="text-xs text-muted-foreground mt-4">
                                        Upload at least 3 photos (Max {getMaxImages(user?.subscription)}). Supported: JPG, PNG
                                    </p>
                                    {errors.images && <p className="text-sm font-medium text-destructive mt-4">{errors.images}</p>}
                                </div>

                                {formData.images.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {formData.images.map((img, index) => (
                                            <div key={index} className="relative aspect-video bg-muted rounded-lg overflow-hidden group">
                                                <img
                                                    src={img}
                                                    alt={`Property preview ${index + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button
                                                        variant="destructive"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            removeImage(index)
                                                        }}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                <Badge className="absolute top-2 left-2 pointer-events-none">Image {index + 1}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 5: Review */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div className="bg-muted/50 p-6 rounded-lg space-y-4">
                                    <h3 className="font-semibold text-lg">Property Summary</h3>

                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-muted-foreground">Title:</span>
                                            <p className="font-semibold">{formData.title}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Type:</span>
                                            <p className="font-semibold">{formData.propertyType} - {formData.roomType}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Location:</span>
                                            <p className="font-semibold">{formData.area}, {formData.city} - {formData.pincode}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Rent:</span>
                                            <p className="font-semibold text-green-600">₹{formData.price}/month</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Deposit:</span>
                                            <p className="font-semibold">₹{formData.deposit}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Amenities:</span>
                                            <p className="font-semibold">{formData.amenities.length} selected</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-2 p-4 border rounded-lg bg-card">
                                    <Checkbox
                                        id="terms"
                                        checked={termsAccepted}
                                        onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                                    />
                                    <label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer select-none">
                                        I confirm that all the information provided is accurate and I agree to the{" "}
                                        <a href="/terms" className="text-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>Terms of Service</a>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between pt-6 border-t">
                            <Button
                                variant="outline"
                                onClick={handleBack}
                                disabled={currentStep === 1}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>

                            {currentStep < 5 ? (
                                <Button onClick={handleNext}>
                                    Next
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleSubmit}
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Submit Property
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div >
    )
}

export default withAuth(AddPropertyPage, { requiredRole: 'owner' })
