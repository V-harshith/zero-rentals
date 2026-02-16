"use client"

import { useState, useEffect, useCallback, memo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { Loader2, UserPlus, Users, Search, Check } from "lucide-react"
import { GooglePlacesInput, type PlaceDetails } from "./GooglePlacesInput"
import type { FormData } from "./types"

interface BasicDetailsStepProps {
    formData: FormData
    setFormData: (data: FormData) => void
    isAdmin?: boolean
    ownerMode?: 'new' | 'existing'
    setOwnerMode?: (mode: 'new' | 'existing') => void
    ownerDetails?: { name: string; email: string; password: string; phone: string }
    setOwnerDetails?: (details: { name: string; email: string; password: string; phone: string }) => void
    selectedExistingOwner?: { id: string; name: string; email: string; phone: string } | null
    setSelectedExistingOwner?: (owner: { id: string; name: string; email: string; phone: string } | null) => void
}

type ActiveField = 'city' | 'area' | null

const BasicDetailsStepComponent = ({
    formData, setFormData, isAdmin,
    ownerMode = 'new', setOwnerMode,
    ownerDetails, setOwnerDetails,
    selectedExistingOwner, setSelectedExistingOwner
}: BasicDetailsStepProps) => {
    const [ownerSearch, setOwnerSearch] = useState("")
    const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; email: string; phone: string }>>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [activeGooglePlacesField, setActiveGooglePlacesField] = useState<ActiveField>(null)

    const updateField = useCallback((field: keyof FormData, value: string) => {
        setFormData({ ...formData, [field]: value })
    }, [formData, setFormData])

    // Handle Google Places field focus - close other dropdowns
    const handleGooglePlacesFocus = useCallback((field: ActiveField) => {
        setActiveGooglePlacesField(field)
    }, [])

    // Handle place selection with auto-detected pincode
    const handleCitySelect = useCallback((details: PlaceDetails) => {
        // Auto-fill pincode if available
        if (details.pincode && !formData.pincode) {
            updateField('pincode', details.pincode)
        }
    }, [formData.pincode, updateField])

    const handleAreaSelect = useCallback((details: PlaceDetails) => {
        // Auto-fill pincode if available and not already filled
        if (details.pincode && !formData.pincode) {
            updateField('pincode', details.pincode)
        }
        // Auto-fill city if area selection includes city info
        if (details.city && !formData.city) {
            updateField('city', details.city)
        }
    }, [formData.pincode, formData.city, updateField])

    const updateOwnerField = useCallback((field: string, value: string) => {
        if (setOwnerDetails && ownerDetails) {
            setOwnerDetails({ ...ownerDetails, [field]: value })
        }
    }, [ownerDetails, setOwnerDetails])

    // Debounced owner search
    const searchOwners = useCallback(async (query: string) => {
        if (query.length < 2) {
            setSearchResults([])
            setShowDropdown(false)
            return
        }

        setIsSearching(true)
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, name, email, phone')
                .eq('role', 'owner')
                .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
                .limit(10)

            if (error) {
                console.error("Owner search error:", error)
                setSearchResults([])
            } else {
                setSearchResults(data || [])
                setShowDropdown(true)
            }
        } catch (err) {
            console.error("Owner search failed:", err)
            setSearchResults([])
        } finally {
            setIsSearching(false)
        }
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (ownerSearch) {
                searchOwners(ownerSearch)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [ownerSearch, searchOwners])

    const handleSelectOwner = (owner: { id: string; name: string; email: string; phone: string }) => {
        setSelectedExistingOwner?.(owner)
        setOwnerSearch("")
        setShowDropdown(false)
        setSearchResults([])
    }

    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="border-b pb-3 md:pb-4">
                <h2 className="text-lg md:text-2xl font-bold mb-1">Basic Property Details</h2>
                <p className="text-sm md:text-base text-muted-foreground">Tell us about your property location and name.</p>
            </div>

            {/* Admin: Owner Assignment Section */}
            {isAdmin && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <h3 className="font-semibold text-blue-900">Property Owner</h3>
                    </div>

                    {/* Owner Mode Toggle */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setOwnerMode?.('new')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                                ownerMode === 'new'
                                    ? 'border-blue-600 bg-blue-100 text-blue-800'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <UserPlus className="h-4 w-4" />
                            Create New Owner
                        </button>
                        <button
                            type="button"
                            onClick={() => setOwnerMode?.('existing')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                                ownerMode === 'existing'
                                    ? 'border-blue-600 bg-blue-100 text-blue-800'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <Users className="h-4 w-4" />
                            Existing Owner
                        </button>
                    </div>

                    {/* New Owner Form */}
                    {ownerMode === 'new' && ownerDetails && setOwnerDetails && (
                        <div className="space-y-3">
                            <p className="text-sm text-blue-700">Create a new owner account. The owner can log in using these credentials.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="owner-name">Owner Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="owner-name"
                                        placeholder="e.g. John Doe"
                                        value={ownerDetails.name}
                                        onChange={e => updateOwnerField('name', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="owner-email">Owner Email <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="owner-email"
                                        type="email"
                                        placeholder="e.g. owner@example.com"
                                        value={ownerDetails.email}
                                        onChange={e => updateOwnerField('email', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="owner-password">Owner Password <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="owner-password"
                                        type="password"
                                        placeholder="Minimum 6 characters"
                                        value={ownerDetails.password}
                                        onChange={e => updateOwnerField('password', e.target.value)}
                                    />
                                    <p className="text-xs text-blue-600">Owner will use this password to log in</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="owner-phone">Owner Phone <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="owner-phone"
                                        placeholder="e.g. 9876543210"
                                        value={ownerDetails.phone}
                                        onChange={e => updateOwnerField('phone', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Existing Owner Search */}
                    {ownerMode === 'existing' && (
                        <div className="space-y-3">
                            <p className="text-sm text-blue-700">Search and select an existing owner to assign this property to.</p>
                            
                            {/* Selected Owner Display */}
                            {selectedExistingOwner && (
                                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <Check className="h-5 w-5 text-green-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-green-900 truncate">{selectedExistingOwner.name}</p>
                                        <p className="text-sm text-green-700 truncate">{selectedExistingOwner.email} • {selectedExistingOwner.phone}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedExistingOwner?.(null)}
                                        className="text-sm text-green-700 hover:text-green-900 underline shrink-0"
                                    >
                                        Change
                                    </button>
                                </div>
                            )}

                            {/* Search Input */}
                            {!selectedExistingOwner && (
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search by name, email, or phone..."
                                            value={ownerSearch}
                                            onChange={e => setOwnerSearch(e.target.value)}
                                            className="pl-10"
                                        />
                                        {isSearching && (
                                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
                                        )}
                                    </div>

                                    {/* Search Results Dropdown */}
                                    {showDropdown && searchResults.length > 0 && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                                            {searchResults.map(owner => (
                                                <button
                                                    key={owner.id}
                                                    type="button"
                                                    onClick={() => handleSelectOwner(owner)}
                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                                                >
                                                    <p className="font-medium text-gray-900">{owner.name}</p>
                                                    <p className="text-sm text-gray-500">{owner.email} {owner.phone ? `• ${owner.phone}` : ''}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {showDropdown && searchResults.length === 0 && ownerSearch.length >= 2 && !isSearching && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center">
                                            <p className="text-sm text-gray-500">No owners found matching "{ownerSearch}"</p>
                                            <button
                                                type="button"
                                                onClick={() => setOwnerMode?.('new')}
                                                className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                                            >
                                                Create a new owner instead
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="grid gap-4 md:gap-6">
                {/* Property Type Selection */}
                <div className="space-y-3">
                    <Label className="text-base">Property Type <span className="text-red-500">*</span></Label>
                    <div className="grid grid-cols-2 gap-3">
                        {(['PG', 'Co-living', 'Rent'] as const).map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => updateField('propertyType', type)}
                                className={`
                                    relative p-4 rounded-lg border-2 transition-all text-left
                                    ${formData.propertyType === type 
                                        ? 'border-blue-600 bg-blue-50' 
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }
                                `}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-lg font-semibold ${
                                        formData.propertyType === type ? 'text-blue-700' : 'text-gray-900'
                                    }`}>
                                        {type}
                                    </span>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                        formData.propertyType === type 
                                            ? 'border-blue-600 bg-blue-600' 
                                            : 'border-gray-300'
                                    }`}>
                                        {formData.propertyType === type && (
                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="title" className="text-base">Property Name <span className="text-red-500">*</span></Label>
                    <Input
                        id="title"
                        placeholder="e.g. Sri Lakshmi PG for Ladies"
                        value={formData.title}
                        onChange={e => updateField('title', e.target.value)}
                        className="h-12 text-lg"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <GooglePlacesInput
                        id="city"
                        label="City"
                        value={formData.city}
                        onChange={(value) => updateField('city', value)}
                        onPlaceSelect={handleCitySelect}
                        placeholder="Start typing city name..."
                        required={true}
                        types={['(cities)']}
                        isActive={activeGooglePlacesField === 'city'}
                        onActivate={() => handleGooglePlacesFocus('city')}
                    />
                    <GooglePlacesInput
                        id="area"
                        label="Area / Locality"
                        value={formData.area}
                        onChange={(value) => updateField('area', value)}
                        onPlaceSelect={handleAreaSelect}
                        placeholder="e.g. Koramangala block 4"
                        required={true}
                        types={['geocode']}
                        isActive={activeGooglePlacesField === 'area'}
                        onActivate={() => handleGooglePlacesFocus('area')}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="pincode">Pincode <span className="text-red-500">*</span></Label>
                        <Input
                            id="pincode"
                            placeholder="e.g. 500081"
                            value={formData.pincode}
                            onChange={e => {
                                // Only allow digits, max 6 characters
                                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                                updateField('pincode', value)
                            }}
                            maxLength={6}
                            className={formData.pincode && formData.pincode.length !== 6 ? 'border-destructive' : ''}
                        />
                        {formData.pincode && formData.pincode.length !== 6 && (
                            <p className="text-sm text-destructive">Pincode must be exactly 6 digits</p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="address">Full Address <span className="text-red-500">*</span></Label>
                    <Textarea
                        id="address"
                        placeholder="House No, Street, Landmark..."
                        value={formData.address}
                        onChange={e => updateField('address', e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="desc">Description <span className="text-red-500">*</span></Label>
                    <Textarea
                        id="desc"
                        placeholder="Tell us what makes your PG special..."
                        value={formData.description}
                        onChange={e => updateField('description', e.target.value)}
                        rows={4}
                        required
                    />
                </div>
            </div>
        </div>
    )
}

export const BasicDetailsStep = memo(BasicDetailsStepComponent)
