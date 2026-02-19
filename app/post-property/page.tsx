"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { createProperty } from "@/lib/data-service"
import { uploadPropertyImages } from "@/lib/storage-service"
import { supabase } from "@/lib/supabase"
import { PLAN_FEATURES } from "@/lib/constants"
import { sendPropertyPostedEmail } from "@/lib/email-service"
import { withAuth } from "@/lib/with-auth"
import { useCsrf } from "@/lib/csrf-context"

// Import modular components
import { BasicDetailsStep } from "@/components/post-property/BasicDetailsStep"
import { RoomSelectionStep } from "@/components/post-property/RoomSelectionStep"
import { PricingStep } from "@/components/post-property/PricingStep"
import { RulesStep } from "@/components/post-property/RulesStep"
import { MediaStep } from "@/components/post-property/MediaStep"
import { type FormData, type RoomData } from "@/components/post-property/types"

// Image processing types
interface ImageProcessingItem {
  id: string
  file: File
  status: 'pending' | 'compressing' | 'completed' | 'error'
  error?: string
  compressedFile?: File
}

interface ImageProcessingState {
  isProcessing: boolean
  queue: ImageProcessingItem[]
  currentIndex: number
}

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
  images: [],
  // Legal Consents (required for owners posting new properties)
  consentPublished: false,
  consentImages: false,
  consentContact: false,
}

// Track loaded scripts for cleanup
const loadedScripts = new Set<string>();

// Load Razorpay script
const loadScript = (src: string) => {
  return new Promise((resolve) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      loadedScripts.add(src);
      resolve(true);
    };
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// Cleanup function to remove loaded scripts
const cleanupScripts = () => {
  loadedScripts.forEach((src) => {
    const script = document.querySelector(`script[src="${src}"]`);
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
  });
  loadedScripts.clear();
};

function PostPropertyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editPropertyId = searchParams.get('edit')
  const isEditMode = !!editPropertyId

  const { user } = useAuth()
  const { csrfToken } = useCsrf()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string>("")
  const [formData, setFormData] = useState<FormData>(INITIAL_DATA)
  const [maxPhotos, setMaxPhotos] = useState(10) // Maximum 10 images for all users
  const [isLoadingProperty, setIsLoadingProperty] = useState(false)
  const [existingImages, setExistingImages] = useState<string[]>([]) // Track existing images in edit mode

  // Admin-specific state for owner creation
  const [isAdmin, setIsAdmin] = useState(false)
  const [ownerMode, setOwnerMode] = useState<'new' | 'existing'>('new')
  const [ownerDetails, setOwnerDetails] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  })
  const [selectedExistingOwner, setSelectedExistingOwner] = useState<{
    id: string
    name: string
    email: string
    phone: string
  } | null>(null)

  // Property limit state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [existingPropertyCount, setExistingPropertyCount] = useState(0)
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [propertyPayment, setPropertyPayment] = useState<{
    transactionId: string
    plan: string
    expiresAt: string
  } | null>(null)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)

  // Submit lock to prevent duplicate submissions
  const submitLockRef = useRef(false)

  // Track created property for rollback on failure
  const createdPropertyRef = useRef<{ id: string } | null>(null)

  // Image processing queue state
  const imageProcessingRef = useRef<ImageProcessingState>({
    isProcessing: false,
    queue: [],
    currentIndex: 0
  })
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const [processingImageIds, setProcessingImageIds] = useState<Set<string>>(new Set())

  // Form draft persistence key
  const DRAFT_KEY = isEditMode ? `property-draft-edit-${editPropertyId}` : 'property-draft-new'

  // Load saved draft on mount (only if not in edit mode with specific property)
  useEffect(() => {
    if (!isEditMode) {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Only restore if user confirms and it's less than 24 hours old
          const age = Date.now() - (parsed.timestamp || 0)
          const isRecent = age < 24 * 60 * 60 * 1000

          if (isRecent && parsed.formData) {
            // Check if form is not empty before asking
            const hasData = parsed.formData.title || parsed.formData.city || parsed.formData.images?.length > 0
            if (hasData) {
              toast.info('You have unsaved progress from earlier. Form restored.', {
                duration: 5000,
                action: {
                  label: 'Clear Draft',
                  onClick: () => {
                    localStorage.removeItem(DRAFT_KEY)
                    setFormData(INITIAL_DATA)
                  }
                }
              })
              setFormData({ ...INITIAL_DATA, ...parsed.formData })
              setCurrentStep(parsed.currentStep || 1)
            }
          }
        } catch (e) {
          // Invalid saved data, ignore
          localStorage.removeItem(DRAFT_KEY)
        }
      }
    }
  }, [isEditMode, editPropertyId, DRAFT_KEY])

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (isEditMode || isSubmitting) return // Don't auto-save in edit mode or during submission

    const interval = setInterval(() => {
      const hasData = formData.title || formData.city || formData.images.length > 0
      if (hasData) {
        const draft = {
          formData,
          currentStep,
          timestamp: Date.now()
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [formData, currentStep, isEditMode, isSubmitting, DRAFT_KEY])

  // beforeunload protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there's unsaved data
      const hasUnsavedChanges = formData.title?.trim() ||
        formData.city?.trim() ||
        formData.images.length > 0 ||
        existingImages.length > 0

      if (hasUnsavedChanges && !isSubmitting) {
        // Save draft before leaving
        if (!isEditMode) {
          const draft = {
            formData,
            currentStep,
            timestamp: Date.now()
          }
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        }

        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [formData, currentStep, existingImages, isSubmitting, isEditMode, DRAFT_KEY])

  // Clear draft on successful submit
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
  }

  // Cleanup scripts and image processing on unmount
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      cleanupScripts();
      // Cancel any in-flight image processing
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // --- Fetch Subscription Limit ---
  useEffect(() => {
    async function fetchLimit() {
      if (!user) return
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_name, plan_duration')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('end_date', { ascending: false })
        .maybeSingle() // Use maybeSingle() to handle no subscription case

      if (data) {
        const planName = data.plan_name || data.plan_duration
        const features = PLAN_FEATURES[planName?.toUpperCase() as keyof typeof PLAN_FEATURES]
        if (features) {
          setMaxPhotos(features.maxPhotos)
        }
      }
    }
    fetchLimit()
  }, [user])

  // Load property data if in edit mode
  useEffect(() => {
    if (isEditMode && editPropertyId) {
      loadPropertyData(editPropertyId)
    } else if (!isEditMode) {
      // Reset form when leaving edit mode
      setFormData(INITIAL_DATA)
      setExistingImages([])
      setCurrentStep(1)
    }
  }, [isEditMode, editPropertyId])

  const loadPropertyData = async (propertyId: string) => {
    setIsLoadingProperty(true)
    // Reset form first to prevent stale data from previous property
    setFormData(INITIAL_DATA)
    setExistingImages([])
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single()

      if (error) throw error

      if (data) {
        // Map database data to form data
        setFormData({
          propertyType: data.property_type,
          title: data.title,
          description: data.description?.split('\n\nDirections:')[0] || '',
          city: data.city,
          area: data.area,
          address: data.address,
          pincode: data.pincode || '',
          rooms: {
            '1rk': {
              selected: !!data.private_room_price && data.room_type === '1RK',
              rent: (data.room_type === '1RK' ? data.private_room_price : '')?.toString() || '',
              deposit: data.deposit?.toString() || '',
              amenities: data.amenities || []
            },
            single: {
              selected: !!data.private_room_price && data.room_type !== '1RK',
              rent: data.private_room_price?.toString() || '',
              deposit: data.deposit?.toString() || '',
              amenities: data.amenities || []
            },
            double: {
              selected: !!data.double_sharing_price,
              rent: data.double_sharing_price?.toString() || '',
              deposit: data.deposit?.toString() || '',
              amenities: data.amenities || []
            },
            triple: {
              selected: !!data.triple_sharing_price,
              rent: data.triple_sharing_price?.toString() || '',
              deposit: data.deposit?.toString() || '',
              amenities: data.amenities || []
            },
            four: {
              selected: !!data.four_sharing_price,
              rent: data.four_sharing_price?.toString() || '',
              deposit: data.deposit?.toString() || '',
              amenities: data.amenities || []
            }
          },
          gender: data.preferred_tenant?.toLowerCase() || 'male',
          preferredTenant: 'any',
          noSmoking: data.rules?.includes('No Smoking') || false,
          noNonVeg: data.rules?.includes('No Non-Veg') || false,
          noDrinking: data.rules?.includes('No Drinking') || false,
          noLoudMusic: data.rules?.includes('No Loud Music') || false,
          noOppGender: data.rules?.includes('No Opposite Gender') || false,
          otherRules: data.rules?.find((r: string) => !['No Smoking', 'No Non-Veg', 'No Drinking', 'No Loud Music', 'No Opposite Gender'].includes(r) && !r.startsWith('Preferred Tenant:')) || '',
          directionsTip: data.description?.split('\n\nDirections: ')[1] || '',
          furnishing: data.furnishing || '',
          images: [] // New images to be uploaded
        })
        // Set existing images for edit mode
        if (data.images && Array.isArray(data.images)) {
          setExistingImages(data.images)
        }
        if (isMountedRef.current) {
          toast.success('Property data loaded')
        }
      }
    } catch (error) {
      console.error('Error loading property:', error)
      if (isMountedRef.current) {
        toast.error('Failed to load property data')
        router.push('/dashboard/admin')
      }
    } finally {
      setIsLoadingProperty(false)
    }
  }

  // Check if user is admin and enforce subscription gate
  useEffect(() => {
    if (user) {
      setIsAdmin(user.role === 'admin')
      // Admin bypasses ALL checks
      if (user.role === 'admin') {
        setIsCheckingAccess(false)
        return
      }

      // Edit mode bypasses subscription check (user already has property)
      if (isEditMode) {
        setIsCheckingAccess(false)
        return
      }

      // For owners: check subscription first, then property limit
      checkSubscriptionAndLimit(user.id)
    }
  }, [user, isEditMode])

  const checkSubscriptionAndLimit = async (userId: string) => {
    try {
      const now = new Date().toISOString()

      // 1. Check for active subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, plan_name, properties_limit')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('end_date', now)
        .maybeSingle()

      setHasSubscription(!!subscription)

      // 2. Count existing properties with payment expiry check:
      //    - 'included' properties: always count toward limit
      //    - 'paid' properties: only count if payment_expires_at > now
      //    - 'expired' properties: don't count
      const { data: properties, error } = await supabase
        .from('properties')
        .select('payment_status, payment_expires_at')
        .eq('owner_id', userId)
        .in('status', ['active', 'pending'])

      if (error) {
        console.error("Error checking property count:", error)
        return
      }

      // Count properties with expiry validation
      const validPropertyCount = (properties || []).filter(p => {
        // Included properties (first property in plan) always count
        if (p.payment_status === 'included') return true

        // Paid properties only count if not expired
        if (p.payment_status === 'paid') {
          return p.payment_expires_at && p.payment_expires_at > now
        }

        // Any other status doesn't count
        return false
      }).length

      setExistingPropertyCount(validPropertyCount)

      // 3. Enforce business logic:
      //    - First property: MUST have subscription (redirect to pricing)
      //    - Second+ property: Show upgrade/payment modal
      if (!isEditMode) {
        // No subscription at all → redirect to pricing (first property requires plan)
        if (!subscription) {
          router.push('/pricing?redirect=post-property')
          return
        }

        // Has subscription but already at limit → show payment modal for addon
        const propertyLimit = subscription?.properties_limit || 1
        if (validPropertyCount >= propertyLimit) {
          setShowPaymentModal(true)
        }
        // Has subscription and 0 properties → allow to post (first property included)
      }
    } finally {
      // Check complete - hide loading state
      setIsCheckingAccess(false)
    }
  }

  // --- Logic ---
  const maxSteps = 5
  const progress = (currentStep / maxSteps) * 100

  const toggleRoom = (roomType: string) => {
    setFormData((prev) => {
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

  const updateRoomData = (roomType: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      rooms: {
        ...prev.rooms,
        [roomType]: {
          ...prev.rooms[roomType as keyof typeof prev.rooms],
          [field]: value,
        },
      },
    }))
  }

  const toggleAmenity = (roomType: string, amenity: string) => {
    const currentAmenities = formData.rooms[roomType as keyof typeof formData.rooms].amenities
    const newAmenities = currentAmenities.includes(amenity)
      ? currentAmenities.filter((a) => a !== amenity)
      : [...currentAmenities, amenity]

    updateRoomData(roomType, "amenities", newAmenities)
  }

  // Compress image with cancellation support
  const compressImage = useCallback(async (
    file: File,
    signal: AbortSignal
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Image processing cancelled'))
        return
      }

      // Skip compression for small images
      if (file.size <= 2 * 1024 * 1024) {
        resolve(file)
        return
      }

      const img = new Image()
      const url = URL.createObjectURL(file)

      const cleanup = () => {
        URL.revokeObjectURL(url)
      }

      const handleAbort = () => {
        cleanup()
        reject(new Error('Image processing cancelled'))
      }

      signal.addEventListener('abort', handleAbort)

      img.onload = () => {
        if (signal.aborted) {
          handleAbort()
          return
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          signal.removeEventListener('abort', handleAbort)
          cleanup()
          reject(new Error('Could not create canvas context'))
          return
        }

        // Calculate new dimensions (max 1920px on longest side)
        let { width, height } = img
        const maxDimension = 1920
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            signal.removeEventListener('abort', handleAbort)
            cleanup()

            if (signal.aborted) {
              reject(new Error('Image processing cancelled'))
              return
            }

            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: file.lastModified
              })
              resolve(compressedFile)
            } else {
              reject(new Error('Compression failed'))
            }
          },
          file.type,
          0.85 // Quality
        )
      }

      img.onerror = () => {
        signal.removeEventListener('abort', handleAbort)
        cleanup()
        reject(new Error('Failed to load image'))
      }

      img.src = url
    })
  }, [])

  // Process image queue
  const processImageQueue = useCallback(async () => {
    const state = imageProcessingRef.current

    if (state.isProcessing || state.currentIndex >= state.queue.length) {
      return
    }

    state.isProcessing = true
    if (isMountedRef.current) {
      setProcessingImageIds(new Set(state.queue.map(item => item.id)))
    }

    // Create new abort controller for this batch
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    try {
      while (state.currentIndex < state.queue.length && !signal.aborted) {
        const item = state.queue[state.currentIndex]

        // Update status to compressing
        item.status = 'compressing'
        if (isMountedRef.current) {
          setProcessingImageIds(prev => new Set(prev).add(item.id))
        }

        try {
          // Compress the image
          const compressedFile = await compressImage(item.file, signal)

          if (signal.aborted) {
            throw new Error('Image processing cancelled')
          }

          item.compressedFile = compressedFile
          item.status = 'completed'

          // Add to form data immediately after compression (with mount check)
          if (isMountedRef.current && !signal.aborted) {
            setFormData(prev => ({
              ...prev,
              images: [...prev.images, compressedFile]
            }))
          }

          // Remove from processing set
          if (isMountedRef.current) {
            setProcessingImageIds(prev => {
              const next = new Set(prev)
              next.delete(item.id)
              return next
            })
          }
        } catch (error: any) {
          if (error.message === 'Image processing cancelled') {
            throw error
          }
          item.status = 'error'
          item.error = error.message
          if (isMountedRef.current) {
            setProcessingImageIds(prev => {
              const next = new Set(prev)
              next.delete(item.id)
              return next
            })
            toast.error(`Failed to process ${item.file.name}: ${error.message}`)
          }
        }

        state.currentIndex++
      }

      // Show success toast for completed batch
      const completedCount = state.queue.filter(i => i.status === 'completed').length
      if (isMountedRef.current && completedCount > 0 && !signal.aborted) {
        toast.success(`${completedCount} image(s) added successfully`)
      }
    } catch (error: any) {
      if (error.message !== 'Image processing cancelled') {
        console.error('Image processing error:', error)
      }
    } finally {
      state.isProcessing = false
      if (isMountedRef.current) {
        setProcessingImageIds(new Set())
      }

      // Clear processed items from queue
      state.queue = state.queue.filter(item => item.status === 'pending' || item.status === 'compressing')
      state.currentIndex = 0

      // Reset abort controller
      abortControllerRef.current = null
    }
  }, [compressImage])

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const newFiles = Array.from(e.target.files)

    // Validate file size and format
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (server limit)
    const ALLOWED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

    const invalidFiles: string[] = []
    const validFiles: File[] = []

    newFiles.forEach(file => {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push(`${file.name} (too large - max 10MB)`)
        return
      }

      // Check file format
      if (!ALLOWED_FORMATS.includes(file.type)) {
        invalidFiles.push(`${file.name} (invalid format - use JPG, PNG, or WebP)`)
        return
      }

      validFiles.push(file)
    })

    // Show errors for invalid files
    if (invalidFiles.length > 0) {
      toast.error(
        `Invalid files:\n${invalidFiles.join('\n')}`,
        { duration: 5000 }
      )
    }

    // Check total count limit
    const currentImageCount = formData.images.length + imageProcessingRef.current.queue.length
    if (currentImageCount + validFiles.length > maxPhotos) {
      toast.error(`Your plan allows a maximum of ${maxPhotos} images`)
      return
    }

    // Add valid files to processing queue
    if (validFiles.length > 0) {
      const newItems: ImageProcessingItem[] = validFiles.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending'
      }))

      imageProcessingRef.current.queue.push(...newItems)

      // Start processing
      processImageQueue()
    }

    // Reset input to allow selecting same files again
    e.target.value = ''
  }, [formData.images.length, maxPhotos, processImageQueue])

  // Check if image processing is active
  const isImageProcessing = imageProcessingRef.current.isProcessing

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: // Basics
        if (!formData.title.trim()) { toast.error("Property Title is required"); return false }
        if (formData.title.length < 5) { toast.error("Title is too short"); return false }
        if (!formData.description.trim()) { toast.error("Description is required"); return false }
        if (formData.description.length < 20) { toast.error("Description should be at least 20 characters"); return false }
        if (!formData.city.trim()) { toast.error("City is required"); return false }
        if (!formData.area.trim()) { toast.error("Area is required"); return false }
        if (!formData.address.trim()) { toast.error("Full Address is required"); return false }
        if (!formData.pincode || formData.pincode.length !== 6) { toast.error("Valid 6-digit pincode is required"); return false }
        return true

      case 2: // Room Selection
        const hasSelectedRoom = Object.values(formData.rooms).some(r => r.selected)
        if (!hasSelectedRoom) { toast.error("Please select at least one room type"); return false }
        return true

      case 3: // Pricing
        // Check pricing for ALL selected rooms
        const selectedRooms = Object.entries(formData.rooms).filter(([_, r]) => r.selected)
        for (const [type, room] of selectedRooms) {
          if (!room.rent || parseInt(room.rent) <= 0) {
            toast.error(`Please enter valid rent for ${type} room`); return false
          }
          if (!room.deposit || parseInt(room.deposit) < 0) {
            toast.error(`Please enter valid deposit for ${type} room`); return false
          }
        }
        // Validate furnishing is selected
        if (!formData.furnishing) {
          toast.error("Please select furnishing type"); return false
        }
        return true

      case 4: // PG Details / Rules
        // Validate consents for owners posting new properties
        if (!isAdmin && !isEditMode) {
          if (!formData.consentPublished) {
            toast.error("Please agree to the Property Listing Consent")
            return false
          }
          if (!formData.consentImages) {
            toast.error("Please agree to the Image Usage Authorization")
            return false
          }
          if (!formData.consentContact) {
            toast.error("Please agree to the Contact Permission")
            return false
          }
        }
        return true

      case 5: // Images
        if (formData.images.length === 0) {
          toast.error("Please upload at least 1 image of your property")
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

  // Validate session before critical operations
  const validateSession = async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      toast.error("Session expired. Please log in again.", {
        description: "Your session has expired. Please log in again to continue."
      })
      router.push('/login/owner')
      return false
    }
    return true
  }

  // Rollback function for partial failures
  const rollbackProperty = async (propertyId: string) => {
    try {
      await supabase.from('properties').delete().eq('id', propertyId)
      console.log(`Rolled back property ${propertyId}`)
    } catch (e) {
      console.error('Failed to rollback property:', e)
    }
  }

  const handleSubmit = async () => {
    // Strong submit lock using ref (prevents race conditions)
    // Only use ref for synchronous check - React state is async and unreliable for this
    if (submitLockRef.current) {
      console.log('Submit already in progress, ignoring duplicate')
      return
    }
    submitLockRef.current = true

    // Reset rollback tracking
    createdPropertyRef.current = null

    if (!validateStep(5)) {
      submitLockRef.current = false
      return // Validate final step
    }

    // Add user null safety check
    if (!user) {
      toast.error("User session expired. Please log in again.")
      router.push('/login/owner')
      submitLockRef.current = false
      return
    }

    // Validate session before starting
    if (!(await validateSession())) {
      submitLockRef.current = false
      return
    }

    // Admin validation
    if (isAdmin) {
      if (ownerMode === 'new') {
        if (!ownerDetails.name || !ownerDetails.email || !ownerDetails.password || !ownerDetails.phone) {
          toast.error("Please provide all owner details (name, email, password, phone)")
          submitLockRef.current = false
          return
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(ownerDetails.email)) {
          toast.error("Please provide a valid email address")
          submitLockRef.current = false
          return
        }
        if (ownerDetails.password.length < 6) {
          toast.error("Password must be at least 6 characters long")
          submitLockRef.current = false
          return
        }
      } else if (ownerMode === 'existing') {
        if (!selectedExistingOwner) {
          toast.error("Please select an existing owner")
          submitLockRef.current = false
          return
        }
      }
    }

    try {
      setIsSubmitting(true)
      setUploadStatus("Creating property details...")

      let ownerId = user.id
      let ownerName = user.name
      let ownerContact = user.phone || user.email

      // If admin, handle owner assignment
      if (isAdmin) {
        if (ownerMode === 'existing' && selectedExistingOwner) {
          // Verify the owner still exists in database (prevents race condition)
          setUploadStatus("Verifying owner...")
          const { data: existingOwner, error: ownerCheckError } = await supabase
            .from('users')
            .select('id, name, email, phone')
            .eq('id', selectedExistingOwner.id)
            .eq('role', 'owner')
            .maybeSingle()

          if (ownerCheckError || !existingOwner) {
            throw new Error("Selected owner no longer exists. Please select a different owner.")
          }

          ownerId = existingOwner.id
          ownerName = existingOwner.name
          ownerContact = existingOwner.phone || existingOwner.email
          setUploadStatus("Creating property...")
        } else {
          // Create new owner account
          setUploadStatus("Creating owner account...")

          // Check if email already exists
          const { data: existingUser, error: existingUserError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', ownerDetails.email)
            .maybeSingle()

          if (existingUserError) {
            console.error("Error checking existing user:", existingUserError)
          }

          if (existingUser) {
            throw new Error(`An account with email ${ownerDetails.email} already exists. Please select this owner from the existing owners list.`)
          }

          // Validate CSRF token
          if (!csrfToken) {
            throw new Error("Security token missing. Please refresh the page and try again.")
          }

          // Create owner via admin API (bypasses email rate limits)
          const ownerResponse = await fetch('/api/admin/create-owner', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken
            },
            body: JSON.stringify({
              email: ownerDetails.email,
              password: ownerDetails.password,
              name: ownerDetails.name,
              phone: ownerDetails.phone
            })
          })

          const ownerData = await ownerResponse.json()

          if (!ownerResponse.ok) {
            throw new Error(ownerData.error || 'Failed to create owner account')
          }

          ownerId = ownerData.userId
          ownerName = ownerDetails.name
          ownerContact = ownerDetails.phone

          toast.success("Owner account created successfully")
          setUploadStatus("Creating property...")
        }
      }



      // 1. Collect ALL selected room prices
      const selectedRoomTypes = Object.entries(formData.rooms)
        .filter(([_, r]) => r.selected)
        .map(([type, r]) => ({ type, price: parseInt(r.rent), deposit: parseInt(r.deposit) }))

      // Find the lowest price for display (primary price)
      const primaryRoom = selectedRoomTypes.sort((a, b) => a.price - b.price)[0]

      // Map room key 'single' -> DB Enum 'Single'
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

      // 3. Prepare Payload with ALL room prices
      const propertyData = {
        title: formData.title,
        description: formData.description + (formData.directionsTip ? `\n\nDirections: ${formData.directionsTip}` : ""),
        propertyType: formData.propertyType,
        roomType: roomTypeMap[primaryRoom.type] as any,
        location: {
          city: formData.city,
          area: formData.area,
          address: formData.address,
          pincode: formData.pincode
        },
        price: primaryRoom.price, // Display price (lowest)
        deposit: primaryRoom.deposit,
        roomPrices, // 🔥 NEW: Pass all room prices
        amenities: Object.values(formData.rooms)
          .find(r => r.selected)?.amenities || [], // Property-level amenities (same for all rooms)
        images: [], // Placeholder, will update after upload
        ownerId: ownerId,
        ownerName: ownerName,
        ownerContact: ownerContact,

        preferredTenant: (formData.gender === 'male' ? 'Male' : formData.gender === 'female' ? 'Female' : 'Couple') as 'Male' | 'Female' | 'Couple',
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
        // Payment fields for additional properties
        ...(propertyPayment ? {
          payment_status: 'paid',
          payment_expires_at: propertyPayment.expiresAt,
          payment_transaction_id: propertyPayment.transactionId,
          payment_plan: propertyPayment.plan
        } : {
          payment_status: 'included' // First property is included in plan
        }),
        // Legal consents (for owners posting new properties)
        ...(!isAdmin && !isEditMode ? {
          consent_published: formData.consentPublished,
          consent_images: formData.consentImages,
          consent_contact: formData.consentContact,
        } : {})
      }



      // 3. Create or Update Property in DB
      if (isEditMode && editPropertyId) {
        // UPDATE existing property
        setUploadStatus("Updating property...")
        const { updateProperty } = await import('@/lib/data-service')
        const { error: updateError } = await updateProperty(editPropertyId, propertyData)
        
        if (updateError) {
          throw new Error(updateError.message || "Failed to update property")
        }

        // 4. Upload new images if any
        if (formData.images.length > 0) {
          setUploadStatus(`Uploading ${formData.images.length} new images...`)
          const { urls, errors } = await uploadPropertyImages(formData.images, editPropertyId)

          if (errors.length > 0) {
            console.error("Some images failed to upload:", errors)
            toast.warning(`${errors.length} images failed to upload`)
          }

          // Update property with merged image URLs (existing + new)
          if (urls.length > 0) {
            const allImages = [...existingImages, ...urls]
            await updateProperty(editPropertyId, { images: allImages })
          }
        }

        setUploadStatus("Success!")
        toast.success("Property updated successfully!")
        clearDraft() // Clear any saved draft

        // Redirect to correct dashboard based on role
        setTimeout(() => {
          router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')
        }, 1500)
      } else {
        // CREATE new property
        const { data: newProperty, error } = await createProperty(
          propertyData,
          isAdmin ? { isAdminPost: true } : undefined
        )

        if (error || !newProperty) {
          throw new Error(error?.message || "Failed to create property record")
        }

        // Track for potential rollback
        createdPropertyRef.current = newProperty

        // Validate session before image upload
        if (!(await validateSession())) {
          // Session expired - rollback the created property
          await rollbackProperty(newProperty.id)
          throw new Error("Session expired during submission. Please log in and try again.")
        }

        // 4. Upload Images with retry logic
        if (formData.images.length > 0) {
          setUploadStatus(`Uploading ${formData.images.length} images...`)
          const { urls, errors } = await uploadPropertyImages(formData.images, newProperty.id)

          if (errors.length > 0) {
            console.error("Some images failed to upload:", errors)
            toast.warning(`${errors.length} images failed to upload`)
          }

          // Update property with image URLs
          if (urls.length > 0) {
            const { updateProperty } = await import('@/lib/data-service')
            await updateProperty(newProperty.id, { images: urls })
          } else if (formData.images.length > 0 && errors.length === formData.images.length) {
            // ALL images failed - offer rollback or continue
            toast.error("All images failed to upload", {
              description: "Property was created but without images. You can edit the property to add images later.",
              duration: 10000,
              action: {
                label: 'Delete Property',
                onClick: async () => {
                  await rollbackProperty(newProperty.id)
                  toast.success('Property deleted')
                  router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')
                }
              }
            })
          }
        }

        setUploadStatus("Success!")
        toast.success(
          isAdmin
            ? "Property posted and auto-approved!"
            : "Property posted successfully! Waiting for admin approval."
        )
        clearDraft() // Clear saved draft

        // Send email notification (only for owner posts, not admin)
        if (!isAdmin) {
          try {
            await sendPropertyPostedEmail({
              ownerEmail: user.email,
              ownerName: user.name,
              propertyTitle: formData.title
            })
          } catch (emailError) {
            console.error("Failed to send email:", emailError)
          }
        }

        // Redirect to correct dashboard
        setTimeout(() => {
          router.push(isAdmin ? '/dashboard/admin' : '/dashboard/owner')
        }, 1500)
      }

    } catch (error: any) {
      console.error("=== SUBMISSION ERROR ===")
      console.error("Error:", error)
      console.error("Error Message:", error.message)
      console.error("Error Details:", error.details)

      // Show detailed validation errors if available
      let errorMessage = error.message || "Failed to submit property"

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

      toast.error("Property Submission Failed", {
        description: errorMessage,
        duration: 8000
      })
      setUploadStatus("")
    } finally {
      setIsSubmitting(false)
      submitLockRef.current = false // Release the lock
    }
  }

  // Show loading screen while checking subscription access (prevents flicker)
  if (isCheckingAccess && !isEditMode && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">Checking Access...</h2>
          <p className="text-gray-600">Please wait while we verify your subscription</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Upgrade Modal for Free Users */}
      {showUpgradeModal && !hasSubscription && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <CardContent className="pt-6 pb-6 px-6 text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              
              <h2 className="text-xl font-bold text-gray-900">
                Property Limit Reached
              </h2>
              
              <p className="text-gray-600">
                You've already posted <span className="font-semibold">{existingPropertyCount} property</span> on the free plan. 
                Upgrade to a paid plan to post more properties!
              </p>
              
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-gray-900 mb-2">✨ Premium Benefits</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Post additional properties</li>
                  <li>• Priority listing in search</li>
                  <li>• Detailed property analytics</li>
                  <li>• Verified owner badge</li>
                </ul>
              </div>
              
              <div className="flex flex-col gap-3 pt-2">
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 h-12 font-bold"
                  onClick={() => router.push('/pricing')}
                >
                  View Plans & Upgrade
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push('/dashboard/owner')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Modal for Paid Users */}
      {showPaymentModal && hasSubscription && !propertyPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg animate-in fade-in zoom-in duration-300">
            <CardContent className="pt-6 pb-6 px-6 space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Add Another Property</h2>
                <p className="text-gray-600 mt-2">
                  You have {existingPropertyCount} property. Pay to list an additional property.
                </p>
              </div>
              
              <div className="grid gap-3 mt-4">
                {[
                  { key: '1_month', label: '1 Month', price: '₹1,000', days: 30 },
                  { key: '3_months', label: '3 Months', price: '₹2,700', days: 90, tag: 'Popular' },
                  { key: '6_months', label: '6 Months', price: '₹5,000', days: 180 },
                  { key: '12_months', label: '12 Months', price: '₹9,000', days: 365, tag: 'Best Value' },
                ].map((plan) => (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`relative flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      selectedPlan === plan.key 
                        ? 'border-primary bg-primary/5' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedPlan === plan.key ? 'border-primary' : 'border-gray-300'
                      }`}>
                        {selectedPlan === plan.key && (
                          <div className="w-3 h-3 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-gray-900">{plan.label}</div>
                        <div className="text-sm text-gray-500">{plan.days} days listing</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-gray-900">{plan.price}</div>
                      {plan.tag && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {plan.tag}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="flex flex-col gap-3 pt-4">
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 h-12 font-bold"
                  disabled={!selectedPlan || isProcessingPayment}
                  onClick={async () => {
                    if (!selectedPlan) return
                    setIsProcessingPayment(true)
                    try {
                      // Create order
                      const orderRes = await fetch('/api/payments/create-property-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ plan: selectedPlan })
                      })
                      const orderData = await orderRes.json()
                      
                      if (!orderRes.ok) {
                        throw new Error(orderData.error || 'Failed to create order')
                      }

                      // Load Razorpay script
                      const scriptLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
                      if (!scriptLoaded) {
                        toast.error("Failed to load payment gateway. Please check your internet connection.");
                        setIsProcessingPayment(false);
                        return;
                      }

                      // Check if Razorpay is available
                      if (typeof window.Razorpay !== 'function') {
                        toast.error("Payment gateway not available. Please refresh and try again.");
                        setIsProcessingPayment(false);
                        return;
                      }

                      // Initialize Razorpay
                      const options = {
                        key: orderData.keyId,
                        amount: orderData.amount,
                        currency: 'INR',
                        name: 'ZeroRentals',
                        description: 'Additional Property Listing',
                        order_id: orderData.orderId,
                        handler: async function (response: any) {
                          try {
                            // Verify payment
                            const verifyRes = await fetch('/api/payments/verify-property-payment', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                plan: selectedPlan,
                                days: orderData.days
                              })
                            })
                            const verifyData = await verifyRes.json()

                            if (verifyData.success) {
                              setPropertyPayment(verifyData.propertyPayment)
                              setShowPaymentModal(false)
                              toast.success('Payment successful! You can now post your property.')
                            } else {
                              toast.error('Payment verification failed: ' + (verifyData.error || 'Unknown error'))
                            }
                          } catch (error: any) {
                            console.error('Payment verification error:', error)
                            toast.error('Payment verification failed: ' + error.message)
                          } finally {
                            setIsProcessingPayment(false)
                          }
                        },
                        modal: {
                          ondismiss: function() {
                            setIsProcessingPayment(false)
                            toast.info('Payment cancelled. You can try again when ready.')
                          }
                        },
                        theme: { color: '#4F46E5' }
                      }
                      
                      const razorpay = new window.Razorpay(options)
                      razorpay.open()
                    } catch (error: any) {
                      toast.error(error.message || 'Payment failed')
                      setIsProcessingPayment(false)
                    }
                  }}
                >
                  {isProcessingPayment ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                  ) : (
                    'Pay & Continue'
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push('/dashboard/owner')}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-3 md:px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <Link href={isAdmin ? '/dashboard/admin' : '/dashboard/owner'} className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 text-gray-600" />
            </Link>
            <div className="flex flex-col">
              <h1 className="font-semibold text-sm md:text-lg">
                {isAdmin ? 'Admin: Post Property' : (isEditMode ? 'Edit Property' : 'Post New Property')}
              </h1>
              <span className="text-xs text-muted-foreground">Step {currentStep} of {maxSteps}</span>
            </div>
          </div>
          <Progress value={progress} className="w-20 md:w-1/3 h-1.5 md:h-2" />
          <div className="w-6 md:w-10"></div> {/* Spacer */}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-3xl">
        <Card className="shadow-sm border-0 bg-white">
          <CardContent className="p-6 md:p-8 min-h-[60vh]">

            {isLoadingProperty ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading property data...</p>
              </div>
            ) : (
              <>

            {currentStep === 1 && (
              <BasicDetailsStep 
                formData={formData} 
                setFormData={setFormData} 
                isAdmin={isAdmin}
                ownerMode={ownerMode}
                setOwnerMode={setOwnerMode}
                ownerDetails={ownerDetails}
                setOwnerDetails={setOwnerDetails}
                selectedExistingOwner={selectedExistingOwner}
                setSelectedExistingOwner={setSelectedExistingOwner}
              />
            )}

            {currentStep === 2 && (
              <RoomSelectionStep formData={formData} toggleRoom={toggleRoom} />
            )}

            {currentStep === 3 && (
              <PricingStep
                formData={formData}
                updateRoomData={updateRoomData}
                toggleAmenity={toggleAmenity}
                updateFormData={(field, value) => setFormData({ ...formData, [field]: value })}
              />
            )}

            {currentStep === 4 && (
              <RulesStep
                formData={formData}
                setFormData={setFormData}
                isAdmin={isAdmin}
                isEditMode={isEditMode}
              />
            )}

            {currentStep === 5 && (
              <MediaStep
                formData={formData}
                setFormData={setFormData}
                handleImageSelect={handleImageSelect}
                removeImage={removeImage}
                maxPhotos={maxPhotos}
                isEditMode={isEditMode}
                existingImages={existingImages}
                removeExistingImage={(index) => {
                  setExistingImages(prev => prev.filter((_, i) => i !== index))
                }}
                isProcessing={isImageProcessing}
                processingCount={processingImageIds.size}
              />
            )}

              </>
            )}
          </CardContent>

          {/* Footer */}
          <div className="p-6 border-t bg-gray-50 flex items-center justify-between rounded-b-xl">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || isSubmitting}
              className="w-32"
            >
              Back
            </Button>

            {currentStep < maxSteps ? (
              <Button onClick={handleNext} className="w-32 bg-primary">
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-48 bg-primary font-bold">
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploadStatus || "Submitting..."}
                  </div>
                ) : (isEditMode ? "Update Property" : "Submit Property")}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  )
}

export default withAuth(PostPropertyPage, { requiredRole: ['owner', 'admin'] })
