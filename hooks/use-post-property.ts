"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { PLAN_FEATURES } from "@/lib/constants"
import type { FormData, RoomData } from "@/components/post-property/types"

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

export function usePostProperty(user: any) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editPropertyId = searchParams.get('edit')
  const isEditMode = !!editPropertyId

  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string>("")
  const [formData, setFormData] = useState<FormData>(INITIAL_DATA)
  const [maxPhotos, setMaxPhotos] = useState(10)
  const [isLoadingProperty, setIsLoadingProperty] = useState(false)

  // Admin-specific state
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

  // Payment/subscription state
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

  // Check admin status
  useEffect(() => {
    if (user?.role === 'admin') {
      setIsAdmin(true)
    }
  }, [user])

  // Fetch subscription limit
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
        .maybeSingle()

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
    }
  }, [isEditMode, editPropertyId])

  const loadPropertyData = useCallback(async (propertyId: string) => {
    setIsLoadingProperty(true)
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single()

      if (error) throw error

      if (data) {
        // Map database data to form data
        setFormData(prev => ({
          ...prev,
          propertyType: data.property_type,
          title: data.title,
          description: data.description?.split('\n\nDirections:')[0] || '',
          city: data.city,
          area: data.area,
          address: data.address,
          pincode: data.pincode || '',
          // ... rest of mapping
        }))
      }
    } catch (error) {
      console.error('Error loading property:', error)
      toast.error('Failed to load property data')
    } finally {
      setIsLoadingProperty(false)
    }
  }, [])

  // Form update handlers with useCallback
  const updateFormField = useCallback(<K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const updateRoom = useCallback((
    roomType: keyof FormData['rooms'],
    updates: Partial<RoomData>
  ) => {
    setFormData(prev => ({
      ...prev,
      rooms: {
        ...prev.rooms,
        [roomType]: { ...prev.rooms[roomType], ...updates }
      }
    }))
  }, [])

  const resetForm = useCallback(() => {
    setFormData(INITIAL_DATA)
    setCurrentStep(1)
  }, [])

  // Validation with useMemo
  const isStepValid = useMemo(() => {
    switch (currentStep) {
      case 1:
        return !!(formData.title && formData.city && formData.area && formData.propertyType)
      case 2:
        return Object.values(formData.rooms).some(room => room.selected)
      case 3:
        return Object.values(formData.rooms)
          .filter(room => room.selected)
          .every(room => room.rent && room.deposit)
      case 4:
        return true // Rules are optional
      case 5:
        return formData.images.length > 0
      default:
        return true
    }
  }, [currentStep, formData])

  return {
    // State
    formData,
    currentStep,
    isSubmitting,
    uploadStatus,
    maxPhotos,
    isLoadingProperty,
    isEditMode,
    editPropertyId,
    isAdmin,
    ownerMode,
    ownerDetails,
    selectedExistingOwner,
    showUpgradeModal,
    showPaymentModal,
    hasSubscription,
    existingPropertyCount,
    selectedPlan,
    isProcessingPayment,
    propertyPayment,
    isStepValid,

    // Setters
    setCurrentStep,
    setIsSubmitting,
    setUploadStatus,
    setFormData,
    setOwnerMode,
    setOwnerDetails,
    setSelectedExistingOwner,
    setShowUpgradeModal,
    setShowPaymentModal,
    setSelectedPlan,
    setIsProcessingPayment,
    setPropertyPayment,

    // Actions
    updateFormField,
    updateRoom,
    resetForm,
    loadPropertyData,
    router
  }
}
